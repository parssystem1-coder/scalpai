import { useSync } from "../offline/SyncProvider.js";

/**
 * Shows the count of pending offline mutations. Hidden when zero.
 * §8: badge visible in header/nav so the user knows data hasn't synced yet.
 */
export default function PendingBadge() {
  const { isOnline, pendingCount } = useSync();
  if (pendingCount === 0) return null;
  return (
    <span
      data-testid="pending-badge"
      title={isOnline ? "در حال همگام‌سازی..." : "آفلاین — منتظر اتصال"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 20,
        height: 20,
        padding: "0 6px",
        borderRadius: 10,
        backgroundColor: isOnline ? "#f59e0b" : "#ef4444",
        color: "#fff",
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {pendingCount}
    </span>
  );
}
