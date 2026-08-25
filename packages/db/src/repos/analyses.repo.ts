import { and, desc, eq } from "drizzle-orm";
import { analyses, galleryItems } from "../schema.js";
import { appendAudit } from "./core.repo.js";
import type { Tx } from "../tenant.js";

export interface AnalysisCreateInput {
  patientId: string;
  galleryItemId: string;
  result: unknown; // AnalysisResult shape validated by shared zod upstream
  modelVersion: string;
  userId: string;
}

export async function createAnalysis(tx: Tx, clinicId: string, input: AnalysisCreateInput) {
  // the analysed image must exist in this clinic and be complete
  const item = (
    await tx
      .select({ id: galleryItems.id })
      .from(galleryItems)
      .where(
        and(
          eq(galleryItems.clinicId, clinicId),
          eq(galleryItems.id, input.galleryItemId),
          eq(galleryItems.patientId, input.patientId),
        ),
      )
      .limit(1)
  )[0];
  if (!item) return null;
  const rows = await tx
    .insert(analyses)
    .values({
      clinicId,
      patientId: input.patientId,
      galleryItemId: input.galleryItemId,
      type: "heuristic",
      result: input.result as object,
      modelVersion: input.modelVersion,
      createdBy: input.userId,
    })
    .returning();
  const created = rows[0]!;
  await appendAudit(tx, {
    clinicId,
    userId: input.userId,
    action: "analysis.create",
    entity: "analysis",
    entityId: created.id,
  });
  return created;
}

export async function getAnalysisById(tx: Tx, clinicId: string, id: string) {
  const rows = await tx
    .select()
    .from(analyses)
    .where(and(eq(analyses.clinicId, clinicId), eq(analyses.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listAnalysesByPatient(tx: Tx, clinicId: string, patientId: string) {
  return tx
    .select()
    .from(analyses)
    .where(and(eq(analyses.clinicId, clinicId), eq(analyses.patientId, patientId)))
    .orderBy(desc(analyses.createdAt))
    .limit(50);
}

export interface ExpertReviewInput {
  verdict: "confirm" | "adjust";
  adjustedScores?: unknown;
  note?: string;
  userId: string;
}

/** Gold-label capture (§10.2) — stored inside the same row, audited. */
export async function saveExpertReview(tx: Tx, clinicId: string, id: string, input: ExpertReviewInput) {
  const existing = await getAnalysisById(tx, clinicId, id);
  if (!existing) return null;
  const payload = {
    verdict: input.verdict,
    adjustedScores: input.adjustedScores ?? null,
    note: input.note ?? null,
    reviewedBy: input.userId,
    reviewedAt: new Date().toISOString(),
  };
  const rows = await tx
    .update(analyses)
    .set({ expertReview: payload })
    .where(and(eq(analyses.clinicId, clinicId), eq(analyses.id, id)))
    .returning();
  await appendAudit(tx, {
    clinicId,
    userId: input.userId,
    action: "analysis.expert_review",
    entity: "analysis",
    entityId: id,
    meta: { verdict: input.verdict },
  });
  return rows[0]!;
}
