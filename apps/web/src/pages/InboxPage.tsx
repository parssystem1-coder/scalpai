import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api/client.js";
import { MessageCard, type InboxMessage } from "../components/inbox/MessageCard.js";
import { MessageThread } from "../components/inbox/MessageThread.js";

interface InboxResponse { items?: InboxMessage[]; data?: InboxMessage[]; }

/** Clinic-facing inbound inbox. PHI body is fetched separately from the redacted list. */
export const InboxPage: React.FC = () => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextOffset: number) => {
    setLoading(true);
    try {
      const result = await apiFetch<InboxResponse>(
        `/aftercare/inbox?limit=20&offset=${nextOffset}`,
      );
      const incoming = result.items ?? result.data ?? [];
      setMessages((current) =>
        nextOffset === 0 ? incoming : [...current, ...incoming],
      );
      setHasMore(incoming.length === 20);
      setOffset(nextOffset);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  const select = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setBody(null);
      try {
        const result = await apiFetch<{ body?: string }>(
          `/aftercare/inbox/${id}/body`,
        );
        setBody(result.body ?? null);
      } catch (err) {
        console.error("Failed to load message body:", err);
        setBody(null); // Show redacted on error
      }
    },
    [],
  );

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
    setSending(true);
    setError(null);

    // Optimistic update: mark as replied immediately
    setMessages((current) =>
      current.map((msg) =>
        msg.id === selected.id ? { ...msg, state: "replied" } : msg,
      ),
    );

    try {
      await apiFetch(`/aftercare/inbox/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "replied" }),
      });
      setReply(""); // Clear reply field on success
    } catch (err) {
      // Rollback on error
      setMessages((current) =>
        current.map((msg) =>
          msg.id === selected.id ? { ...msg, state: "new" } : msg,
        ),
      );
      console.error("Failed to send reply:", err);
      setError(t("inbox.replyFailed") || "Failed to send reply");
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
            {filtered.length === 0 && !loading && (
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
                onClick={() => void load(offset + 20)}
                disabled={loading}
                className="w-full p-4 text-sm font-bold"
              >
                {loading ? t("inbox.loading") : t("inbox.loadMore")}
              </button>
            )}
          </aside>

          <div className="flex flex-col">
            {error && (
              <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <div className="flex items-center justify-between">
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="text-red-500 hover:text-red-700"
                    aria-label={t("inbox.dismissError") || "Dismiss"}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
            <MessageThread
              message={selected}
              body={body}
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
