import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api/client.js";
import { MessageCard, type InboxMessage } from "../components/inbox/MessageCard.js";
import { MessageThread, type BodyStatus } from "../components/inbox/MessageThread.js";
import "./inbox.i18n.js";

interface InboxResponse { items?: InboxMessage[]; data?: InboxMessage[]; }

const PAGE_SIZE = 20;

/** Clinic-facing inbound inbox. PHI body is fetched separately from the redacted list. */
export const InboxPage: React.FC = () => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [bodyStatus, setBodyStatus] = useState<BodyStatus>("idle");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // فقط جدیدترین درخواستِ متن اجازه نوشتن در state را دارد: انتخاب A و بعد B
  // نباید پاسخ کندترِ A را زیر هدر B نشان بدهد.
  const bodyRequestId = useRef(0);

  const load = useCallback(
    async (nextOffset: number) => {
      setLoading(true);
      try {
        const result = await apiFetch<InboxResponse>(
          `/aftercare/inbox?limit=${PAGE_SIZE}&offset=${nextOffset}`,
        );
        const incoming = result.items ?? result.data ?? [];
        setMessages((current) =>
          nextOffset === 0 ? incoming : [...current, ...incoming],
        );
        setHasMore(incoming.length === PAGE_SIZE);
        setOffset(nextOffset);
      } catch {
        // خطای خام ممکن است متن پروایدر یا PHI داشته باشد: نه لاگ می‌شود نه
        // نمایش داده می‌شود. قبلاً این promise بدون catch رد می‌شد و کاربر
        // «پیامی پیدا نشد» می‌دید، یعنی خطا شبیه صندوق خالی بود.
        setError(t("inbox.loadFailed"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const select = useCallback(async (id: string) => {
    const requestId = bodyRequestId.current + 1;
    bodyRequestId.current = requestId;
    setSelectedId(id);
    setBody(null);
    setBodyStatus("loading");
    try {
      const result = await apiFetch<{ body?: string }>(
        `/aftercare/inbox/${id}/body`,
      );
      if (requestId !== bodyRequestId.current) return;
      setBody(result.body ?? null);
      setBodyStatus("loaded");
    } catch {
      if (requestId !== bodyRequestId.current) return;
      setBody(null);
      setBodyStatus("error");
    }
  }, []);

  const selected = messages.find((item) => item.id === selectedId) ?? null;
  const filtered = useMemo(
    () =>
      messages.filter((item) =>
        `${item.senderHash} ${item.bodyPreview ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [messages, query],
  );

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    // بازگردانی باید به حالت قبلی برگردد، نه به "new": یک پیام خوانده‌شده که
    // ارسال پاسخش شکست خورده، دوباره خوانده‌نشده نمی‌شود.
    const previousState = selected.state;
    setSending(true);
    setError(null);

    // Optimistic update: mark as replied immediately
    setMessages((current) =>
      current.map((msg) =>
        msg.id === selected.id ? { ...msg, state: "replied" } : msg,
      ),
    );

    try {
      // TODO(phase-5b): این درخواست فقط حالت پیام را عوض می‌کند و متن `reply`
      // را هیچ‌جا نمی‌فرستد — قرارداد InboundMessageUpdate فقط {state,intent}
      // را می‌پذیرد و endpoint ارسال پاسخ وجود ندارد. تا روشن شدن قرارداد،
      // این دکمه «ثبت پاسخ» است نه «ارسال پیام».
      // docs/reviews/PHASE-5AB-REVIEW.md — پرسش باز ۱.
      await apiFetch(`/aftercare/inbox/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "replied" }),
      });
      setReply(""); // Clear reply field on success
    } catch {
      // Rollback on error
      setMessages((current) =>
        current.map((msg) =>
          msg.id === selected.id ? { ...msg, state: previousState } : msg,
        ),
      );
      setError(t("inbox.replyFailed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[oklch(85%_0.03_28)] p-4 md:p-8"
      aria-labelledby="inbox-title"
    >
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 id="inbox-title" className="text-2xl font-black">
              {t("inbox.title")}
            </h1>
            <p className="mt-1 text-sm opacity-65">{t("inbox.subtitle")}</p>
          </div>
          <input
            aria-label={t("inbox.searchLabel")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("inbox.searchPlaceholder")}
            className="rounded-xl border border-black/10 bg-white px-4 py-3 text-sm"
          />
        </header>

        <div className="grid overflow-hidden rounded-2xl border border-white/70 bg-white/40 shadow-xl md:grid-cols-[minmax(260px,34%)_1fr]">
          <aside
            className="max-h-[70vh] overflow-y-auto"
            aria-label={t("inbox.conversations")}
          >
            {filtered.length === 0 && !loading && !error && (
              <p className="p-8 text-center text-sm opacity-60">
                {t("inbox.noMessages")}
              </p>
            )}
            {filtered.map((message) => (
              <MessageCard
                key={message.id}
                message={message}
                selected={message.id === selectedId}
                onSelect={(id) => void select(id)}
              />
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={() => void load(offset + PAGE_SIZE)}
                disabled={loading}
                className="w-full p-4 text-sm font-bold"
              >
                {loading ? t("inbox.loading") : t("inbox.loadMore")}
              </button>
            )}
          </aside>

          <div className="flex flex-col">
            {error && (
              <div
                role="alert"
                className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                <div className="flex items-center justify-between gap-3">
                  <span>{error}</span>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void load(0)}
                      className="font-bold text-red-700 underline"
                    >
                      {t("inbox.retry")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setError(null)}
                      className="text-red-500 hover:text-red-700"
                      aria-label={t("inbox.dismissError")}
                    >
                      ✕
                    </button>
                  </span>
                </div>
              </div>
            )}
            <MessageThread
              message={selected}
              body={body}
              bodyStatus={bodyStatus}
              reply={reply}
              onReplyChange={setReply}
              onReply={() => void sendReply()}
              sending={sending}
            />
          </div>
        </div>
      </div>
    </main>
  );
};

export default InboxPage;
