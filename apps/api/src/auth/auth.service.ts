import { randomUUID } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { verify } from "@node-rs/argon2";
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

const REFRESH_TTL_MS = 14 * 24 * 3600 * 1000;

export interface AccessClaims {
  sub: string;
  clinicId: string;
  role: "owner" | "trichologist" | "receptionist";
}

@Injectable()
export class AuthService {
  constructor(private jwt: JwtService) {}

  private signAccess(c: AccessClaims): string {
    return this.jwt.sign(c, { expiresIn: "15m" });
  }

  async login(tx: Tx, email: string, password: string): Promise<TokenPair> {
    const row = await loginLookup(tx, email);
    if (!row || !(await verify(row.password_hash, password))) {
      throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "ایمیل یا رمز اشتباه است" });
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
          user: { id: string; clinicId: string; role: "owner" | "trichologist" | "receptionist" };
        };

    const outcome = await db.withClient<Outcome>(async (tx) => {
      const live = await findLiveByHash(tx, presented);
      if (!live) {
        const used = await findByHash(tx, presented);
        return { reused: true, familyId: used?.familyId ?? null };
      }
      if (live.expiresAt.getTime() < Date.now()) {
        return { reused: true, familyId: null };
      }
      const u = await claimsById(tx, live.userId);
      if (!u || u.id !== live.userId) throw new UnauthorizedException({ code: "UNAUTHORIZED" });
      return {
        reused: false,
        parent: { id: live.id, familyId: live.familyId, userId: live.userId },
        user: { id: u.id, clinicId: u.clinic_id, role: u.role as AccessClaims["role"] },
      };
    });

    // بررسی دقیق برای اطمینان کامل تایپ‌اسکریپت
    if (outcome.reused === true) {
      if (outcome.familyId) {
        await db.withClient((tx) => revokeFamily(tx, outcome.familyId!));
      }
      throw new UnauthorizedException({ code: "REFRESH_REUSED", message: "توکن باطل شده است" });
    }

    // در اینجا تایپ‌اسکریپت مطمئن است که outcome.reused برابر false است
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

  verifyAccess(token: string): AccessClaims {
    return this.jwt.verify<AccessClaims>(token);
  }
}
