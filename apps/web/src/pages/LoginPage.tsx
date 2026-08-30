import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoginRequest, type LoginRequest as LoginDto } from "@scalpai/shared";
import { useTranslation } from "react-i18next";
import { apiFetch, setAccessToken } from "../api/client.js";

type TokenPair = { accessToken: string; refreshToken: string };

export default function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginDto>({
    resolver: zodResolver(LoginRequest),
    defaultValues: {
      email: "owner@clinic-a.test",
      password: "Dev12345!",
    },
  });

  const onSubmit = handleSubmit(async (dto) => {
    setServerError(null);
    try {
      const pair = await apiFetch<TokenPair>("/auth/login", {
        method: "POST",
        body: JSON.stringify(dto),
      });
      setAccessToken(pair.accessToken);
      onLoggedIn();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "خطای نامشخص");
    }
  });

  return (
    <main id="login-container" style={{ maxWidth: 400, margin: "8vh auto", fontFamily: "inherit", padding: "1.5rem", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#ffffff", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <h1 id="login-title" style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "#0f172a" }}>{t("login.title")}</h1>
        <p style={{ fontSize: "0.875rem", color: "#64748b", margin: 0 }}>پلتفرم مدیریت کلینیک و تریکولوژی ScalpAI</p>
      </div>

      <form onSubmit={onSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label htmlFor="login-email-input" style={{ display: "block", marginBottom: "0.375rem", fontSize: "0.875rem", fontWeight: 500, color: "#334155" }}>
            {t("login.email")}
          </label>
          <input
            id="login-email-input"
            type="email"
            {...register("email")}
            autoComplete="username"
            style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.95rem", boxSizing: "border-box" }}
          />
          {errors.email && <p role="alert" style={{ color: "#ef4444", fontSize: "0.8rem", margin: "0.25rem 0 0 0" }}>{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="login-password-input" style={{ display: "block", marginBottom: "0.375rem", fontSize: "0.875rem", fontWeight: 500, color: "#334155" }}>
            {t("login.password")}
          </label>
          <input
            id="login-password-input"
            type="password"
            {...register("password")}
            autoComplete="current-password"
            style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.95rem", boxSizing: "border-box" }}
          />
          {errors.password && <p role="alert" style={{ color: "#ef4444", fontSize: "0.8rem", margin: "0.25rem 0 0 0" }}>{errors.password.message}</p>}
        </div>

        {serverError && (
          <p id="login-error-message" role="alert" style={{ color: "#ef4444", backgroundColor: "#fee2e2", padding: "0.5rem", borderRadius: "6px", fontSize: "0.85rem", margin: 0 }}>
            {serverError}
          </p>
        )}

        <button
          id="login-submit-button"
          type="submit"
          disabled={isSubmitting}
          style={{ width: "100%", padding: "0.625rem", borderRadius: "6px", background: "#2563eb", color: "#ffffff", border: "none", fontWeight: 600, fontSize: "0.95rem", cursor: "pointer", opacity: isSubmitting ? 0.7 : 1 }}
        >
          {isSubmitting ? "در حال ورود..." : t("login.submit")}
        </button>

        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #f1f5f9", fontSize: "0.8rem", color: "#64748b" }}>
          <div style={{ fontWeight: 600, marginBottom: "0.375rem" }}>حساب‌های آزمایشی موجود در دیتابیس:</div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              id="demo-account-owner-btn"
              type="button"
              onClick={() => {
                setValue("email", "owner@clinic-a.test");
                setValue("password", "Dev12345!");
              }}
              style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", padding: "0.25rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", cursor: "pointer" }}
            >
              مدیر کلینیک الف
            </button>
            <button
              id="demo-account-tricho-btn"
              type="button"
              onClick={() => {
                setValue("email", "tricho@clinic-a.test");
                setValue("password", "Dev12345!");
              }}
              style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", padding: "0.25rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", cursor: "pointer" }}
            >
              پزشک تریکولوژیست
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}
