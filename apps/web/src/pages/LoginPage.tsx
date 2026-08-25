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
    formState: { errors, isSubmitting },
  } = useForm<LoginDto>({ resolver: zodResolver(LoginRequest) });

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
    <main style={{ maxWidth: 360, margin: "10vh auto", fontFamily: "inherit" }}>
      <h1>{t("login.title")}</h1>
      <form onSubmit={onSubmit} noValidate>
        <label>
          {t("login.email")}
          <input type="email" {...register("email")} autoComplete="username" />
        </label>
        {errors.email && <p role="alert">{errors.email.message}</p>}
        <label>
          {t("login.password")}
          <input type="password" {...register("password")} autoComplete="current-password" />
        </label>
        {errors.password && <p role="alert">{errors.password.message}</p>}
        {serverError && (
          <p role="alert" style={{ color: "crimson" }}>
            {serverError}
          </p>
        )}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "..." : t("login.submit")}
        </button>
      </form>
    </main>
  );
}
