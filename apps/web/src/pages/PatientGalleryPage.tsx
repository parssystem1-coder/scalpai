import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { apiFetch, ApiError, clearAccessToken } from "../api/client.js";

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
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mockItems = useMockItems();

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
      const init = await apiFetch<{ id: string; uploadUrl: string }>(
        `/patients/${pid}/gallery/init`,
        { method: "POST", body: JSON.stringify({ mime: file.type || "image/jpeg", sizeBytes: file.size }) },
      );
      const put = await fetch(init.uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type || "image/jpeg" } });
      if (!put.ok) throw new Error("آپلود به storage ناموفق بود");
      return apiFetch(`/gallery/${init.id}/complete`, { method: "POST" });
    },
    onSuccess: () => {
      setError(null);
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

  const renderCell = (it: GalleryItem) => (
    <figure key={it.id} style={{ margin: 0 }}>
      {it.thumbUrl ? (
        <Link to={`/patients/${pid}/gallery/${it.id}`} state={{ viewUrl: it.viewUrl }}>
          <img src={it.thumbUrl} alt="" loading="lazy" style={{ width: "100%", height: 160, objectFit: "cover" }} />
        </Link>
      ) : (
        <div style={{ width: "100%", height: 160, background: "#ddd" }} />
      )}
      {!mockItems && (
        <button type="button" onClick={() => remove.mutate(it.id)}>
          حذف
        </button>
      )}
    </figure>
  );

  // Small galleries skip virtualization entirely (simpler DOM, better a11y).
  if (items.length <= COLS) {
    return (
      <main style={{ maxWidth: 980, margin: "4vh auto" }}>
        <h1>گالری بیمار</h1>
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
          {upload.isPending && <span> در حال پردازش…</span>}
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
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 980, margin: "4vh auto" }}>
      <h1>گالری بیمار</h1>
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
        {upload.isPending && <span> در حال پردازش…</span>}
        {error && (
          <p role="alert" style={{ color: "crimson" }}>
            {error}
          </p>
        )}
      </div>

      {galleryQuery.isLoading && !mockItems ? (
        <p>در حال بارگذاری…</p>
      ) : items.length === 0 ? (
        <p>تصویری ثبت نشده است.</p>
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
    </main>
  );
}
