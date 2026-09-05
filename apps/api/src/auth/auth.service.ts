import { randomUUID } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "@node-rs/argon2";
import {
  claimsById,
  findByHash,
  findLiveByHash,
  insertChild,
  loginLookup,
  markReplaced,
  refreshTokens,
  revokeFamily,
  sha256,
  type DbService,
  type Tx,
} from "@scalpai/db";
import type { TokenPair } from "@scalpai/shared";
import { resolveJwtConfig } from "./jwt.config.js";

const REFRESH_TTL_MS = 14 * 24 * 3600 * 1000;
const PRINCIPAL_CACHE_LIMIT = 5_000;

export type Role = "owner" | "trichologist" | "receptionist";

export interface AccessClaims {
  sub: string;
  clinicId: string;
  role: Role;
}

interface CachedPrincipal {
  until: number;
  clinicId: string;
  role: string;
}

function unauthorized(message: string, code = "UNAUTHORIZED"): UnauthorizedException {
  return new UnauthorizedException({ code, message });
}

/** Email is an identifier, not a display value — compare it in one canonical form (R12). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class AuthService {
  /** Argon2 hash of a throwaway secret — burned on unknown users so a missing
   *  account costs the same wall-clock time as a wrong password (R12). */
  private decoyHash: Promise<string> | null = null;
  private principals = new Map<string, CachedPrincipal>();

  constructor(private jwt: JwtService) {}

  private decoy(): Promise<string> {
    this.decoyHash ??= hash(`${randomUUID()}${randomUUID()}`);
    return this.decoyHash;
  }

  private signAccess(claims: AccessClaims): string {
    const cfg = resolveJwtConfig();
    return this.jwt.sign(claims, {
      expiresIn: cfg.accessTtl,
      issuer: cfg.issuer,
      audience: cfg.audience,
      keyid: cfg.kid,
    });
  }

  async login(tx: Tx, rawEmail: string, password: string): Promise<TokenPair> {
    const email = normalizeEmail(rawEmail);
    const row = await loginLookup(tx, email);

    if (!row) {
      // Unknown account: still pay the hashing cost before failing.
      await verify(await this.decoy(), password).catch(() => false);
      throw unauthorized("ایمیل یا رمز اشتباه است");
    }
    const ok = await verify(row.password_hash, password).catch(() => false);
    if (!ok) {
      throw unauthorized("ایمیل یا رمز اشتباه است");
    }

    const claims: AccessClaims = { sub: row.id, clinicId: row.clinic_id, role: row.role as Role };
    const refreshToken = await this.issueRefresh(tx, claims.sub);
    return {
      accessToken: this.signAccess(claims),
      refreshToken,
      user: { id: claims.sub, clinicId: claims.clinicId, role: claims.role, email },
    };
  }

  private async issueRefresh(tx: Tx, userId: string): Promise<string> {
    const token = `${randomUUID()}.${randomUUID()}`;
    await tx.insert(refreshTokens).values({
      userId,
      tokenHash: sha256(token),
      familyId: randomUUID(),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    return token;
  }

  async revoke(db: DbService, presented: string): Promise<void> {
    await db.withClient(async (tx) => {
      const found = await findByHash(tx, presented);
      if (!found) return;
      await revokeFamily(tx, found.familyId);
    });
  }

  async rotate(db: DbService, presented: string): Promise<TokenPair> {
    type Outcome =
      | { reused: true; familyId: string | null }
      | {
          reused: false;
          parent: { id: string; familyId: string; userId: string };
          user: { id: string; clinicId: string; role: Role; email: string };
        };

    const outcome = await db.withClient<Outcome>(async (tx) => {
      const live = await findLiveByHash(tx, presented);
      if (!live) {
        const used = await findByHash(tx, presented);
        return { reused: true, familyId: used?.familyId ?? null };
      }
      if (live.expiresAt.getTime() < Date.now()) {
        return { reused: true, familyId: live.familyId };
      }
      // Claims always come from the database, never from the presented token.
      const u = await claimsById(tx, live.userId);
      if (!u || u.id !== live.userId) throw unauthorized("نشست باطل شده است");
      return {
        reused: false,
        parent: { id: live.id, familyId: live.familyId, userId: live.userId },
        user: { id: u.id, clinicId: u.clinic_id, role: u.role as Role, email: u.email },
      };
    });

    if (outcome.reused) {
      if (outcome.familyId) {
        const familyId = outcome.familyId;
        await db.withClient((tx) => revokeFamily(tx, familyId));
      }
      throw unauthorized("توکن باطل شده است", "REFRESH_REUSED");
    }

    const parentData = outcome.parent;
    const userData = outcome.user;

    return db.withClient(async (tx) => {
      const { childId, token } = await insertChild(tx, {
        userId: parentData.userId,
        familyId: parentData.familyId,
      });
      await markReplaced(tx, parentData.id, childId);
      const accessToken = this.signAccess({
        sub: userData.id,
        clinicId: userData.clinicId,
        role: userData.role,
      });
      return { accessToken, refreshToken: token, user: userData };
    });
  }

  /**
   * Explicit verification (R12): issuer, audience and algorithm are asserted,
   * and a token minted under the previous secret is accepted only when its
   * `kid` header actually names that key.
   */
  verifyAccess(token: string): AccessClaims {
    const cfg = resolveJwtConfig();
    try {
      return this.jwt.verify<AccessClaims>(token, {
        secret: cfg.secret,
        issuer: cfg.issuer,
        audience: cfg.audience,
        algorithms: ["HS256"],
      });
    } catch (err) {
      if (cfg.previousSecret && this.tokenKid(token) === cfg.previousKid) {
        return this.jwt.verify<AccessClaims>(token, {
          secret: cfg.previousSecret,
          issuer: cfg.issuer,
          audience: cfg.audience,
          algorithms: ["HS256"],
        });
      }
      throw err;
    }
  }

  private tokenKid(token: string): string | null {
    const decoded = this.jwt.decode(token, { complete: true }) as { header?: { kid?: string } } | null;
    return decoded?.header?.kid ?? null;
  }

  /**
   * A signature alone is not authorization: the user must still exist and be
   * un-revoked, with the same clinic and role the token claims. Cached for
   * AUTH_PRINCIPAL_TTL_MS so this costs one query per user per window.
   */
  async assertPrincipalActive(db: DbService, claims: AccessClaims): Promise<void> {
    const ttl = Number(process.env.AUTH_PRINCIPAL_TTL_MS ?? 30_000);
    const now = Date.now();
    const cached = this.principals.get(claims.sub);

    if (cached && cached.until > now) {
      if (cached.clinicId !== claims.clinicId || cached.role !== claims.role) {
        throw unauthorized("نشست باطل شده است");
      }
      return;
    }

    const user = await db.withClient((tx) => claimsById(tx, claims.sub));
    if (!user || user.clinic_id !== claims.clinicId || user.role !== claims.role) {
      this.principals.delete(claims.sub);
      throw unauthorized("نشست باطل شده است");
    }

    if (ttl > 0) {
      if (this.principals.size >= PRINCIPAL_CACHE_LIMIT) this.principals.clear();
      this.principals.set(claims.sub, { until: now + ttl, clinicId: user.clinic_id, role: user.role });
    }
  }

  /** Password/role changes and logouts must not be masked by the cache. */
  forgetPrincipal(userId: string): void {
    this.principals.delete(userId);
  }
}
