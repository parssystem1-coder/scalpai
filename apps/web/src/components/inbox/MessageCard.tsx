import React from "react";
import { useTranslation } from "react-i18next";

export interface InboxMessage { id: string; channel: string; senderHash: string; bodyPreview: string | null; receivedAt: string; state?: string; }
interface Props { message: InboxMessage; selected?: boolean; onSelect: (id: string) => void; }

/** Accessible compact message preview used by the inbox conversation list. */
export const MessageCard: React.FC<Props> = ({ message, selected = false, onSelect }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={t("inbox.openMessage", {
        sender: message.senderHash,
      })}
      onClick={() => onSelect(message.id)}
      className={`w-full text-right p-4 border-b border-black/5 hover:bg-white/70 ${
        selected ? "bg-white shadow-sm" : "bg-white/30"
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <strong className="text-sm">{message.senderHash}</strong>
        <time
          className="text-xs opacity-60"
          dateTime={message.receivedAt}
        >
          {new Date(message.receivedAt).toLocaleString()}
        </time>
      </span>
      <span className="mt-2 block truncate text-xs opacity-70">
        {message.bodyPreview ?? t("inbox.redacted")}
      </span>
      {message.state === "new" && (
        <span className="mt-2 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-700">
          {t("inbox.unread")}
        </span>
      )}
    </button>
  );
};
