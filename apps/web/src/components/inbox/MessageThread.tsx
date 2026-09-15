import React from "react";
import { useTranslation } from "react-i18next";
import type { InboxMessage } from "./MessageCard.js";

/** وضعیت دریافت متن پیام. `null` بودن body دو معنی داشت: «در حال بارگذاری» و «نشد». */
export type BodyStatus = "idle" | "loading" | "loaded" | "error";

interface Props { message: InboxMessage | null; body: string | null; bodyStatus?: BodyStatus; reply: string; onReplyChange: (value: string) => void; onReply: () => void; sending?: boolean; }
/** Conversation detail panel. The full inbound body is supplied only after explicit selection. */
export const MessageThread: React.FC<Props> = ({ message, body, bodyStatus = "idle", reply, onReplyChange, onReply, sending = false }) => {
  const { t } = useTranslation();
  if (!message) return <section className="grid min-h-[420px] place-items-center p-8 text-sm opacity-60" aria-label={t("inbox.emptySelection")}>{t("inbox.selectConversation")}</section>;
  return (
    <section className="flex min-h-[420px] flex-col p-6" aria-label={t("inbox.thread")}>
      <header className="border-b border-black/10 pb-4">
        <h2 className="font-bold">{message.senderHash}</h2>
        <p className="text-xs opacity-60">{message.channel}</p>
      </header>

      <div className="flex-1 py-6">
        {bodyStatus === "loading" ? (
          <p className="text-xs opacity-60 text-center">
            {t("inbox.loadingBody")}
          </p>
        ) : (
          <>
            {bodyStatus === "error" && (
              <p role="alert" className="mb-2 text-xs text-red-700">
                {t("inbox.bodyFailed")}
              </p>
            )}
            <p className="rounded-2xl bg-white p-4 text-sm leading-7 shadow-sm">
              {body ?? message.bodyPreview ?? t("inbox.redacted")}
            </p>
          </>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onReply();
        }}
        className="flex gap-3 border-t border-black/10 pt-4"
      >
        <textarea
          aria-label={t("inbox.replyLabel")}
          value={reply}
          onChange={(event) => onReplyChange(event.target.value)}
          disabled={sending}
          rows={2}
          className="min-h-12 flex-1 rounded-xl border border-black/10 bg-white p-3 text-sm disabled:opacity-50"
          placeholder={t("inbox.replyPlaceholder")}
        />
        <button
          type="submit"
          disabled={sending || reply.trim().length === 0}
          className="self-end rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          {sending ? t("inbox.sending") : t("inbox.send")}
        </button>
      </form>
    </section>
  );
};
