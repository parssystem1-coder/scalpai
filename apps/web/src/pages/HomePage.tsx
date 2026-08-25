import { useTranslation } from "react-i18next";
import { clearAccessToken } from "../api/client.js";

export default function HomePage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const { t } = useTranslation();
  return (
    <main style={{ maxWidth: 720, margin: "10vh auto" }}>
      <h1>{t("home.title")}</h1>
      <p>ماژول‌های بعدی اینجا قرار می‌گیرند (فازهای بعدی).</p>
      <button
        onClick={() => {
          clearAccessToken();
          onLoggedOut();
        }}
      >
        {t("home.logout")}
      </button>
    </main>
  );
}
