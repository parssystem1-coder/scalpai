import { randomUUID } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { hash, verify } from "@node-rs/argon2";
import {
  claimsById,
  issueRefresh,
  loginLookup,
  revokeByToken,
  rotateRefresh,
  type DbService,
  type Tx,
} from "@scalpai/db";
import type { TokenPair } from "@scalpai/shared";
import { envNumber } from "../common/state/kv.store.js";
import { StateStore } from "../common/state/state.store.js";
import { previousKeyUsable, resolveJwtConfig } from "./jwt.config.js";

export type Role = "owner" | "trichologist" | "receptionist";

export interface AccessClaims {
  sub: string;
  clinicId: string;
  role: Role;
}

type ExpiresIn = NonNullable<JwtSignOptions["expiresIn"]>;

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

  constructor(
    private jwt: JwtService,
    private state: StateStore,
  ) {}

  private decoy(): Promise<string> {
    this.decoyHash ??= hash(`${randomUUID()}${randomUUID()}`);
    return this.decoyHash;
  }

  private signAccess(claims: AccessClaims): string {
    const cfg = resolveJwtConfig();
    const signOpts: JwtSignOptions = {
      expiresIn: cfg.accessTtl as unknown as ExpiresIn,
      issuer: cfg.issuer,
      audience: cfg.audience,
      keyid: cfg.kid,
    };
    return this.jwt.sign(claims, signOpts);
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
    // Refresh tokens are written through the scalpai_auth definer surface — the
    // app role has no privilege on refresh_tokens at all (ADR-0029).
    const issued = await issueRefresh(tx, { userId: claims.sub, clinicId: claims.clinicId });
    return {
      accessToken: this.signAccess(claims),
      refreshToken: issued.token,
      user: { id: claims.sub, clinicId: claims.clinicId, role: claims.role, email },
    };
  }

  /** Logout: one round trip, one transaction, whole family revoked (R5). */
  async revoke(db: DbService, presented: string): Promise<void> {
    await db.withClient((tx) => revokeByToken(tx, presented));
  }

  /**
   * Refresh rotation (WEAKNESSES R4/R5/R12 — ADR-0033).
   *
   * The database decides: `fn_refresh_rotate` locks the parent row, mints the
   * child and marks the parent replaced in ONE transaction, and revokes the
   * whole family for reuse, expiry, a revoked user or a clinic mismatch. Two
   * concurrent refreshes therefore produce exactly one success and one reuse.
   * The error is thrown AFTER the transaction commits, so the revocation the
   * database performed is never rolled back with it.
   */
  async rotate(db: DbService, presented: string): Promise<TokenPair> {
    const result = await db.withClient((tx) => rotateRefresh(tx, presented));

    if (result.outcome === "rotated" && result.user && result.refreshToken) {
      const user = { ...result.user, role: result.user.role as Role };
      const accessToken = this.signAccess({
        sub: user.id,
        clinicId: user.clinicId,
        role: user.role,
      });
      return { accessToken, refreshToken: result.refreshToken, user };
    }

    switch (result.outcome) {
      case "reused":
        throw unauthorized("توکن باطل شده است", "REFRESH_REUSED");
      case "expired":
        throw unauthorized("نشست منقضی شده است", "REFRESH_EXPIRED");
      case "revoked_user":
      case "clinic_mismatch":
        throw unauthorized("نشست باطل شده است", "SESSION_INVALID");
      default:
        throw unauthorized("توکن نامعتبر است");
    }
  }

  /**
   * Explicit verification (R12): issuer, audience and algorithm are asserted,
   * and a token minted under the previous secret is accepted only while the
   * rotation window is open AND its `kid` header actually names that key.
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
      if (previousKeyUsable(cfg) && cfg.previousSecret && this.tokenKid(token) === cfg.previousKid) {
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
   * un-revoked, with the same clinic and role the token claims. Cached in the
   * SHARED store for AUTH_PRINCIPAL_TTL_MS, so a logout or a role change on one
   * replica is not masked by a warm Map on another (M6).
   */
  async assertPrincipalActive(db: DbService, claims: AccessClaims): Promise<void> {
    const ttl = envNumber("AUTH_PRINCIPAL_TTL_MS", 30_000);
    const key = this.principalKey(claims.sub);
    const cached = await this.state.get(key);

    if (cached) {
      const [clinicId, role] = cached.split("|");
      if (clinicId !== claims.clinicId || role !== claims.role) {
        throw unauthorized("نشست باطل شده است");
      }
      return;
    }

    const user = await db.withClient((tx) => claimsById(tx, claims.sub));
    if (!user || user.clinic_id !== claims.clinicId || user.role !== claims.role) {
      await this.state.del(key);
      throw unauthorized("نشست باطل شده است");
    }

    if (ttl > 0) {
      await this.state.set(key, `${user.clinic_id}|${user.role}`, ttl);
    }
  }

  /** Password/role changes and logouts must not be masked by the cache. */
  async forgetPrincipal(userId: string): Promise<void> {
    await this.state.del(this.principalKey(userId));
  }

  private principalKey(userId: string): string {
    return this.state.key("auth", "principal", userId);
  }
}
