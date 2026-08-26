import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { apiFetch, ApiError, clearAccessToken } from "../api/client.js";
import { createEngine } from "@scalpai/analysis-engine";
import { useTranslation } from "react-i18next";
import { faNum, toggleLang } from "../i18n.js";
import AutoLock from "../components/AutoLock.js";

interface Scores {
  redness: number;
  flakeTexture: number;
  densityProxy: number;
}

interface Saved {
  id: string;
}

const SCORE_LABELS: Array<{ key: keyof Scores }> = [
  { key: "redness" },
  { key: "flakeTexture" },
  { key: "densityProxy" },
];

export default function AnalysisPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const { pid = "", gid = "" } = useParams();
  const { t, i18n } = useTranslation();
  const location = useLocation() as { state?: { viewUrl?: string } };
  const viewUrlFromState = location.state?.viewUrl ?? null;

  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [scores, setScores] = useState<Scores | null>(null);
  const [adjusted, setAdjusted] = useState<Scores | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [reviewDone, setReviewDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const save = useMutation({
    mutationFn: (result: { scores: Scores; severity: number; modelVersion: string }) =>
      apiFetch<Saved>("/analyses", {
        method: "POST",
        body: JSON.stringify({ patientId: pid, galleryItemId: gid, result }),
      }),
    onSuccess: (s) => setSaved(s),
    onError: (e) => {
      if (e instanceof ApiError && e.status === 401) {
        clearAccessToken();
        onLoggedOut();
        return;
      }
      setError(e instanceof ApiError ? `[${e.code}] ${e.message}` : String(e));
    },
  });

  const review = useMutation({
    mutationFn: (payload: unknown) =>
      apiFetch(`/analyses/${saved?.id ?? ""}/expert-review`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => setReviewDone(true),
  });

  useEffect(() => {
    if (startedRef.current || !viewUrlFromState) return;
    startedRef.current = true;
    (async () => {
      try {
        const t0 = performance.now();
        const res = await fetch(viewUrlFromState);
        if (!res.ok) throw new Error("دریافت تصویر ناموفق بود");
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);
        const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas unavailable");
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const engine = createEngine();
        const out = await engine.analyze({ image: { data: imageData.data, width: imageData.width, height: imageData.height } });
        setElapsedMs(Math.round(performance.now() - t0));
        setScores(out.scores);
        setAdjusted(out.scores);
        save.mutate({ scores: out.scores, severity: out.severity, modelVersion: out.modelVersion });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [viewUrlFromState, save]);

  const severity =
    adjusted ? Math.round(adjusted.redness * 0.4 + adjusted.flakeTexture * 0.35 + adjusted.densityProxy * 0.25) : null;

  return (
    <main style={{ maxWidth: 720, margin: "4vh auto" }}>
      <AutoLock minutes={10} onLock={() => { clearAccessToken(); onLoggedOut(); }} />
      <h1>{t("analysis.title")}</h1>
      <button type="button" onClick={toggleLang}>{i18n.language === "fa" ? "EN" : "فا"}</button>
      <Link to={`/patients/${pid}/gallery`}>{t("analysis.back")}</Link>

      {!scores && !error && <p>{t("analysis.running")}</p>}
      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}

      {scores && (
        <>
          <p>
            {t("analysis.elapsed")} <strong data-testid="elapsed">{faNum(elapsedMs)}</strong> {t("analysis.msUnit")}
          </p>
          <ul style={{ listStyle: "none", padding: 0 }}>
              {SCORE_LABELS.map(({ key }) => (
              <li key={key}>
                {t(`analysis.${key}`)}:{" "}
                <strong data-testid={`score-${key}`}>{faNum(adjusted?.[key] ?? scores[key])}</strong> / {faNum(100)}
              </li>
            ))}
          </ul>
          <p>
            {t("analysis.severity")} <strong>{faNum(severity)}</strong> / {faNum(100)}
          </p>

          {!reviewDone ? (
            <section>
              <h2>{t("analysis.reviewTitle")}</h2>
            {SCORE_LABELS.map(({ key }) => (
                <label key={key} style={{ display: "block" }}>
                  {t(`analysis.${key}`)}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={adjusted?.[key] ?? 0}
                    onChange={(e) => setAdjusted((prev) => ({ ...(prev ?? scores), [key]: Number(e.target.value) }))}
                  />
                </label>
              ))}
              <input
                placeholder={t("analysis.notePh")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ width: "60%" }}
              />
              <button
                type="button"
                onClick={() =>
                  review.mutate({
                    verdict: "adjust",
                    adjustedScores: adjusted,
                    note: note || undefined,
                  })
                }
                disabled={!saved || review.isPending}
              >
                {t("analysis.adjust")}
              </button>
              <button
                type="button"
                onClick={() => review.mutate({ verdict: "confirm" })}
                disabled={!saved || review.isPending}
                data-testid="confirm"
              >
                {t("analysis.confirm")}
              </button>
              <span data-testid="review-status">{saved ? `saved:${saved.id.slice(0, 6)}` : "nosave"}:{review.status}</span>
            </section>
          ) : (
            <p data-testid="saved">{t("analysis.saved")}</p>
          )}
        </>
      )}
    </main>
  );
}
