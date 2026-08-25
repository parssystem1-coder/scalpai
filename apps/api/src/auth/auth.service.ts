import { randomUUID } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { verify } from "@node-rs/argon2";
import { and, eq, isNull, sql } from "drizzle-orm";
import { refreshTokens, sha256, type DbService, type Tx } from "@scalpai/db";
import type { TokenPair } from "@scalpai/shared";

export interface AccessClaims {
  sub: string;
  clinicId: string;
  role: "owner" | "trichologist" | "receptionist";
}

const REFRESH_TTL_MS = 14 * 24 * 3600 * 1000;

function firstRow<T>(res: unknown): T | undefined {
  const r = res as { rows?: T[] };
  return (r.rows ?? (res as T[]))?.[0];
}

@Injectable()
export class AuthService {
  constructor(private jwt: JwtService) {}

  private signAccess(c: AccessClaims): string {
    return this.jwt.sign(c, { expiresIn: "15m" });
  }

  /**
   * Login lookup uses SECURITY DEFINER fn_auth_login (migration 0002):
   * `users` sits behind FORCE RLS and login happens before any tenant is known.
   */
  async login(tx: Tx, email: string, password: string): Promise<TokenPair> {
    const res = await tx.execute(sql`SELECT id, clinic_id, role::text AS role, password_hash FROM fn_auth_login(${email})`);
    const row = firstRow<{ id: string; clinic_id: string; role: string; password_hash: string }>(res);
    if (!row || !(await verify(row.password_hash, password))) {
      throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "Ø§ÛŒÙ…ÛŒÙ„ ÛŒØ§ Ø±Ù…Ø² Ø§Ø´ØªØ¨Ø§Ù‡ Ø§Ø³Øª" });
    }
    const claims: AccessClaims = { sub: row.id, clinicId: row.clinic_id, role: row.role as AccessClaims["role"] };
    const refreshToken = await this.issueRefresh(tx, claims.sub);
    return {
      accessToken: this.signAccess(claims),
      refreshToken,
      user: { id: claims.sub, clinicId: claims.clinicId, role: claims.role },
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

  /** Logout: kill the presented token's family. */
  async revoke(db: DbService, presented: string): Promise<void> {
    await db.withClient(async (tx) => {
      const hash = sha256(presented);
      const found = (await tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).limit(1))[0];
      if (!found) return;
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, found.familyId), isNull(refreshTokens.revokedAt)));
    });
  }

  /**
   * Rotating refresh with reuse detection (Â§13). On replay of an already-used
   * token, the WHOLE family is revoked in its own committed transaction â€”
   * a rollback from the resulting 401 must never undo that revocation.
   */
  async rotate(db: DbService, presented: string): Promise<TokenPair> {
    type RotateOutcome =
      | { reused: true; familyId: string | null }
      | { reused: false; found: { id: string; familyId: string; userId: string }; uRes: unknown };
    const hash = sha256(presented);

    const outcome = await db.withClient<RotateOutcome>(async (tx) => {
      const found = (
        await tx
          .select()
          .from(refreshTokens)
          .where(and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt)))
          .limit(1)
      )[0];

      if (!found) {
        const used = (await tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).limit(1))[0];
        return { reused: true as const, familyId: used?.familyId ?? null };
      }
      if (found.expiresAt.getTime() < Date.now()) {
        return { reused: true as const, familyId: null };
      }
      const uRes = await tx.execute(sql`SELECT id, clinic_id, role::text AS role FROM fn_user_claims(${found.userId})`);
      return { reused: false as const, found, uRes } as const;
    });

    if (outcome.reused) {
      if (outcome.familyId) {
        // Security action commits independently of the 401 response.
        await db.withClient((tx) =>
          tx
            .update(refreshTokens)
            .set({ revokedAt: new Date() })
            .where(and(eq(refreshTokens.familyId, outcome.familyId!), isNull(refreshTokens.revokedAt))),
        );
      }
      throw new UnauthorizedException({ code: "REFRESH_REUSED", message: "ØªÙˆÚ©Ù† Ø¨Ø§Ø·Ù„ Ø´Ø¯Ù‡ Ø§Ø³Øª" });
    }

    const { found, uRes } = outcome;
    const u = firstRow<{ id: string; clinic_id: string; role: string }>(uRes);
    if (!u) throw new UnauthorizedException({ code: "UNAUTHORIZED" });

    return db.withClient(async (tx) => {
      const newToken = `${randomUUID()}.${randomUUID()}`;
      const childId = randomUUID();
      await tx.insert(refreshTokens).values({
        id: childId,
        userId: u!.id,
        tokenHash: sha256(newToken),
        familyId: found.familyId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      });
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date(), replacedBy: childId })
        .where(eq(refreshTokens.id, found.id));

      const user = { id: u!.id, clinicId: u!.clinic_id, role: u!.role as AccessClaims["role"] };
      return {
        accessToken: this.signAccess({ sub: user.id, clinicId: user.clinicId, role: user.role }),
        refreshToken: newToken,
        user,
      };
    });
  }

  verifyAccess(token: string): AccessClaims {
    return this.jwt.verify<AccessClaims>(token);
  }
}
