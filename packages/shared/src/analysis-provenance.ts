import { z } from "zod";
import { SHA256_HEX_PATTERN } from "./sha256.js";

/**
 * Analysis provenance (phase 10 / H13, ADR-0043).
 *
 * The golden rule (§3) is that image analysis never leaves the device. The cost
 * of that rule is that the server sees only NUMBERS: before this module a client
 * could post any three scores with any `modelVersion` string and the row was
 * accepted as "an analysis". The product then displayed it next to clinical
 * data, which is exactly the kind of unprovable claim phase 10 exists to remove.
 *
 * A submission must now carry:
 *   - `imageSha256`  the digest of the EXACT pixel buffer that was analysed;
 *   - `pixelWidth/Height` the geometry that digest belongs to;
 *   - `model`        a reference into the registry below, not a free string;
 *   - `computedAt`   when the client ran it;
 *   - `diagnostic: false` an explicit, non-negotiable statement of scope.
 *
 * The server verifies the model reference against ITS OWN copy of the registry,
 * so an unknown or edited manifest is a 400 rather than a stored fact. This is
 * not a signature over the pixels - the client is untrusted by construction -
 * but it makes every stored analysis re-checkable against the original image
 * and pins the algorithm revision that produced it.
 */

/** A model the platform recognises. `revision` pins the algorithm, not the file. */
export interface RegisteredAnalysisModel {
  readonly id: string;
  readonly version: string;
  readonly backend: "heuristic";
  readonly revision: string;
  readonly algorithm: string;
  /** Always false: nothing in this registry is a diagnostic device. */
  readonly diagnostic: false;
}

export const ANALYSIS_MODEL_REGISTRY: readonly RegisteredAnalysisModel[] = [
  {
    id: "scalpai.heuristic",
    version: "heuristic-v0",
    backend: "heuristic",
    revision: "manifest-2026-09-07",
    algorithm: "redness(excess-red) + flakeTexture(laplacian-variance) + densityProxy(edge-ratio)",
    diagnostic: false,
  },
];

export function findRegisteredModel(version: string): RegisteredAnalysisModel | undefined {
  return ANALYSIS_MODEL_REGISTRY.find((m) => m.version === version);
}

export function isRegisteredModelVersion(version: string): boolean {
  return findRegisteredModel(version) !== undefined;
}

/**
 * The label the UI is REQUIRED to render next to any score. It is a constant so
 * that a rule can assert its presence instead of trusting a reviewer to notice
 * it was deleted.
 */
export const ANALYSIS_NON_DIAGNOSTIC_LABEL = {
  fa: "این نتیجه کمکی و غیرتشخیصی است و جایگزین تشخیص پزشک نیست.",
  en: "Assistive and non-diagnostic. This result does not replace a clinician's diagnosis.",
} as const;

export const AnalysisModelRef = z.object({
  id: z.string().min(3).max(60),
  version: z.string().min(3).max(60),
  backend: z.enum(["heuristic"]),
  revision: z.string().min(3).max(120),
});
export type AnalysisModelRefDto = z.infer<typeof AnalysisModelRef>;

export const AnalysisProvenance = z
  .object({
    imageSha256: z.string().regex(SHA256_HEX_PATTERN, "imageSha256 باید هش شانزده‌شانزدهی sha256 باشد"),
    pixelWidth: z.coerce.number().int().min(16).max(20_000),
    pixelHeight: z.coerce.number().int().min(16).max(20_000),
    model: AnalysisModelRef,
    computedAt: z.string().datetime(),
    /** A client may not claim diagnostic scope. */
    diagnostic: z.literal(false),
  })
  .superRefine((provenance, ctx) => {
    const known = findRegisteredModel(provenance.model.version);
    if (!known) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["model", "version"],
        message: `مدل '${provenance.model.version}' در رجیستری پلتفرم ثبت نشده است`,
      });
      return;
    }
    if (known.id !== provenance.model.id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["model", "id"], message: "شناسه مدل با رجیستری هم‌خوان نیست" });
    }
    if (known.backend !== provenance.model.backend) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["model", "backend"], message: "backend مدل با رجیستری هم‌خوان نیست" });
    }
    if (known.revision !== provenance.model.revision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["model", "revision"],
        message: "revision مانیفست مدل با نسخه سرور هم‌خوان نیست",
      });
    }
  });
export type AnalysisProvenanceDto = z.infer<typeof AnalysisProvenance>;

/** The manifest reference a client must send for a registered model. */
export function modelRefOf(model: RegisteredAnalysisModel): AnalysisModelRefDto {
  return { id: model.id, version: model.version, backend: model.backend, revision: model.revision };
}
