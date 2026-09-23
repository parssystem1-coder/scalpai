import React from "react";
import { useTranslation } from "react-i18next";
import type { InboxMessage } from "./MessageCard.js";

/** وضعیت دریافت متن پیام. `null` بودن body دو معنی داشت: «در حال بارگذاری» و «نشد». */
export type BodyStatus = "idle" | "loading" | "loaded" | "error";

interface Props { message: InboxMessage | null; body: string | null; bodyStatus?: BodyStatus; onHandled: () => void; handling?: boolean; alreadyReplied?: boolean; }
/**
 * Conversation detail panel. The full inbound body is supplied only after explicit selection.
 *
 * موج ۳ (D14 / ADR-0054): بدون composer متن آزاد. قبلاً یک textarea «پاسخ»
 * بود که دکمه‌ی ارسالش متن را هیچ‌جا نمی‌فرستاد — همان گرفتنی که سند بدهی
 * دور می‌ریخت. الان فقط یک کنش صادق هست: «رسیدگی شد» که state را با
 * `PATCH /aftercare/inbox/:id` به replied می‌برد. پاسخِ واقعیِ قالب‌دار مسیر
 * خودش را از موتور aftercare دارد، نه از اینجا.
 */
export const MessageThread: React.FC<Props> = ({ message, body, bodyStatus = "idle", onHandled, handling = false, alreadyReplied = false }) => {
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

      <div className="flex items-center justify-between gap-3 border-t border-black/10 pt-4">
        <p className="text-xs opacity-60">{t("inbox.handledHint")}</p>
        {alreadyReplied ? (
          <span className="rounded-xl bg-white/70 px-4 py-3 text-sm font-bold opacity-60">{t("inbox.handled")}</span>
        ) : (
          <button
            type="button"
            onClick={onHandled}
            disabled={handling}
            className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            {handling ? t("inbox.handling") : t("inbox.markHandled")}
          </button>
        )}
      </div>
    </section>
  );
};
