import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { apiFetch, ApiError, clearAccessToken } from "../api/client.js";
import AutoLock from "../components/AutoLock.js";
import DigitalConsentModal from "../components/DigitalConsentModal.js";
import { faNum, toggleLang } from "../i18n.js";
import { uploadChunked, getPendingUploads, type ChunkedUploadState } from "../offline/chunked-upload.js";

interface GalleryItem {
  id: string;
  createdAt: string;
  quality: unknown;
  thumbUrl: string | null;
  viewUrl: string | null;
}

interface GalleryPage {
  items: GalleryItem[];
  nextCursor: string | null;
}

const COLS = 4;

/** Dev-only perf harness: ?mock=N renders N synthetic tiles without API (Lighthouse). */
function useMockItems(): GalleryItem[] | null {
  const mock = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("mock") : null;
  return useMemo(() => {
    if (!mock) return null;
    const n = Math.min(Number(mock) || 0, 2000);
    return Array.from({ length: n }, (_, i) => ({
      id: `mock-${i}`,
      createdAt: new Date().toISOString(),
      quality: null,
      thumbUrl: "/vite.svg",
      viewUrl: "/vite.svg",
    }));
  }, [mock]);
}

export default function PatientGalleryPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const { pid = "" } = useParams();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [pendingUploads, setPendingUploads] = useState<ChunkedUploadState[]>([]);
  const [isConsentOpen, setIsConsentOpen] = useState(false);
  const mockItems = useMockItems();

  const patientQuery = useQuery({
    queryKey: ["patient", pid],
    enabled: Boolean(pid) && !mockItems,
    queryFn: () => apiFetch<{ id: string; firstName: string; lastName: string; phone: string }>(`/patients/${pid}`),
  });

  // refresh pending uploads on mount and after uploads
  useEffect(() => {
    setPendingUploads(getPendingUploads());
  }, []);

  const galleryQuery = useInfiniteQuery({
    queryKey: ["gallery", pid],
    enabled: !mockItems,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<GalleryPage>(
        `/patients/${pid}/gallery?limit=24${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items: GalleryItem[] = mockItems ?? galleryQuery.data?.pages.flatMap((p) => p.items) ?? [];

  const upload = useMutation({
    mutationFn: async (file: File) => {
      await uploadChunked(file, pid, setPct);
      setPendingUploads(getPendingUploads());
    },
    onSuccess: () => {
      setPct(null);
      setError(null);
      setPendingUploads(getPendingUploads());
      void qc.invalidateQueries({ queryKey: ["gallery", pid] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 401) {
        clearAccessToken();
        onLoggedOut();
        return;
      }
      setError(e instanceof ApiError ? `[${e.code}] ${e.message}` : e.message);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/gallery/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["gallery", pid] }),
  });

  // Infinite scroll trigger
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onSentinel = useCallback(
    (node: HTMLDivElement | null) => {
      sentinelRef.current = node;
    },
    [],
  );
  void sentinelRef;
  const loadMoreIfVisible = useCallback(() => {
    if (galleryQuery.hasNextPage && !galleryQuery.isFetchingNextPage) void galleryQuery.fetchNextPage();
  }, [galleryQuery]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(items.length / COLS),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 190,
    overscan: 4,
    enabled: items.length > COLS,
  });

  const renderCell = (it: GalleryItem) => {
    const pending = pendingUploads.find((p) => p.galleryItemId === it.id);
    return (
      <figure key={it.id} style={{ margin: 0, position: "relative" }}>
        {it.thumbUrl ? (
          <Link to={`/patients/${pid}/gallery/${it.id}`} state={{ viewUrl: it.viewUrl }}>
            <img src={it.thumbUrl} alt="" loading="lazy" style={{ width: "100%", height: 160, objectFit: "cover" }} />
          </Link>
        ) : (
          <div style={{ width: "100%", height: 160, background: "#ddd" }} />
        )}
        {pending && (
          <span
            data-testid="pending-upload-badge"
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              background: "#f59e0b",
              color: "#fff",
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: 8,
            }}
          >
            {pending.completedParts.length}/{pending.totalParts}
          </span>
        )}
        {!mockItems && (
          <button type="button" onClick={() => remove.mutate(it.id)}>
            {t("common.delete")}
          </button>
        )}
      </figure>
    );
  };

  // Small galleries skip virtualization entirely (simpler DOM, better a11y).
  if (items.length <= COLS) {
    return (
      <main style={{ maxWidth: 980, margin: "4vh auto", padding: "0 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <h1>گالری بیمار {patientQuery.data ? `(${patientQuery.data.firstName} ${patientQuery.data.lastName})` : ""}</h1>
          <button
            id="open-gallery-consent-btn"
            type="button"
            onClick={() => setIsConsentOpen(true)}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "6px 14px",
              background: "#C9906A",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            ✍️ فرم رضایت دیجیتال بیمار
          </button>
        </div>
        <Link to="/patients">بازگشت به بیماران</Link>
        <div style={{ margin: "12px 0" }}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="انتخاب تصویر"
            disabled={upload.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = "";
            }}
          />
          {upload.isPending && <span> {t("gallery.processing")}</span>}
        {upload.isPending && pct !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flexGrow: 1, height: 8, background: "#e5e7eb", borderRadius: 4 }}>
              <div data-testid="upload-bar" style={{ width: `${pct}%`, height: "100%", background: "#10b981", borderRadius: 4, transition: "width .2s" }} />
            </div>
            <span data-testid="upload-pct">{faNum(pct)}٪</span>
          </div>
        )}
          {error && (
            <p role="alert" style={{ color: "crimson" }}>
              {error}
            </p>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 8 }} data-testid="gallery-grid">
          {items.map(renderCell)}
        </div>
        <span data-testid="qstatus">{galleryQuery.status}</span>
        {galleryQuery.error && <span data-testid="qerr">{String(galleryQuery.error)}</span>}

        <DigitalConsentModal
          patientId={pid}
          patientName={patientQuery.data ? `${patientQuery.data.firstName} ${patientQuery.data.lastName}` : "بیمار"}
          patientPhone={patientQuery.data?.phone ?? ""}
          isOpen={isConsentOpen}
          onClose={() => setIsConsentOpen(false)}
        />
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 980, margin: "4vh auto", padding: "0 16px" }}>
      <AutoLock minutes={10} onLock={() => { clearAccessToken(); onLoggedOut(); }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>
          {t("gallery.title")} {patientQuery.data ? `(${patientQuery.data.firstName} ${patientQuery.data.lastName})` : ""}
        </h1>
        <button
          id="open-gallery-consent-btn"
          type="button"
          onClick={() => setIsConsentOpen(true)}
          style={{
            fontSize: 13,
            fontWeight: 600,
            padding: "6px 14px",
            background: "#C9906A",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          ✍️ فرم رضایت دیجیتال بیمار
        </button>
      </div>
      <div style={{ display: "flex", gap: 12, margin: "8px 0" }}>
        <button type="button" onClick={toggleLang}>{i18n.language === "fa" ? "EN" : "فا"}</button>
        <Link to="/patients">{t("gallery.back")}</Link>
      </div>

      <div style={{ margin: "12px 0" }}>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={t("gallery.pick")}
          disabled={upload.isPending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = "";
          }}
        />
        {upload.isPending && <span> {t("gallery.processing")}</span>}
        {upload.isPending && pct !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flexGrow: 1, height: 8, background: "#e5e7eb", borderRadius: 4 }}>
              <div data-testid="upload-bar" style={{ width: `${pct}%`, height: "100%", background: "#10b981", borderRadius: 4, transition: "width .2s" }} />
            </div>
            <span data-testid="upload-pct">{faNum(pct)}٪</span>
          </div>
        )}
        {error && (
          <p role="alert" style={{ color: "crimson" }}>
            {error}
          </p>
        )}
      </div>

      {galleryQuery.isLoading && !mockItems ? (
        <p>{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <p>{t("gallery.empty")}</p>
      ) : (
        <div
          ref={scrollRef}
          data-testid="gallery-scroll"
          style={{ height: "70vh", overflow: "auto", position: "relative" }}
          onScroll={() => {
            const el = scrollRef.current;
            if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 300) loadMoreIfVisible();
          }}
        >
          <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((row) => (
              <div
                key={row.key}
                ref={rowVirtualizer.measureElement}
                data-index={row.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${row.start}px)`,
                  display: "grid",
                  gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                  gap: 8,
                }}
              >
                {items.slice(row.index * COLS, row.index * COLS + COLS).map(renderCell)}
              </div>
            ))}
          </div>
          <div ref={onSentinel} />
        </div>
      )}

      <DigitalConsentModal
        patientId={pid}
        patientName={patientQuery.data ? `${patientQuery.data.firstName} ${patientQuery.data.lastName}` : "بیمار"}
        patientPhone={patientQuery.data?.phone ?? ""}
        isOpen={isConsentOpen}
        onClose={() => setIsConsentOpen(false)}
      />
    </main>
  );
}
