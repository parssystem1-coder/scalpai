import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoginRequest, type LoginRequest as LoginDto } from "@scalpai/shared";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../context/AuthContext.js";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  Droplets,
  Fingerprint,
  Crown,
  Stethoscope,
  AlertCircle,
} from "lucide-react";
import LuxuryFeminineBackground from "../components/LuxuryFeminineBackground.js";
import LuxuryTiltCard from "../components/LuxuryTiltCard.js";

type TokenPair = { accessToken: string; user: { id: string; clinicId: string; role: string; email?: string } };

const isDev = import.meta.env.DEV;

export default function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [activeRole, setActiveRole] = useState<"owner" | "tricho">("owner");
  const [rememberMe, setRememberMe] = useState(false);
  const { login } = useAuth();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginDto>({
    resolver: zodResolver(LoginRequest),
    defaultValues: isDev
      ? { email: "owner@clinic-a.test", password: "Dev12345!" }
      : { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (dto) => {
    setServerError(null);
    try {
      const pair = await apiFetch<TokenPair>("/auth/login", {
        method: "POST",
        body: JSON.stringify(dto),
      });
      login(
        pair.accessToken,
        {
          email: pair.user.email ?? dto.email,
          role: pair.user.role,
          clinicId: pair.user.clinicId,
        },
        rememberMe,
      );
      onLoggedIn();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Authentication failed. Please check credentials.");
    }
  });

  const handleQuickRole = (role: "owner" | "tricho") => {
    setActiveRole(role);
    if (role === "owner") {
      setValue("email", "owner@clinic-a.test");
      setValue("password", "Dev12345!");
    } else {
      setValue("email", "tricho@clinic-a.test");
      setValue("password", "Dev12345!");
    }
  };

  return (
    <div
      dir="ltr"
      style={{
        minHeight: "100vh",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "2rem 4.5rem",
        overflow: "hidden",
        backgroundColor: "#FAF6F0",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        boxSizing: "border-box",
      }}
    >
      {/* 3D Dynamic Microscopic Follicle Background */}
      <LuxuryFeminineBackground />

      {/* LEFT: Frosted Glass Login Card (Exact Replica of the Design) */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: "470px",
        }}
      >
        <LuxuryTiltCard
          maxTilt={5}
          style={{
            background: "rgba(255, 255, 255, 0.45)",
            backdropFilter: "blur(32px) saturate(160%)",
            WebkitBackdropFilter: "blur(32px) saturate(160%)",
            border: "1.5px solid rgba(255, 255, 255, 0.75)",
            borderRadius: "32px",
            padding: "2.8rem 2.6rem 2.2rem 2.6rem",
            boxShadow: `
              0 28px 70px -15px rgba(184, 115, 126, 0.22),
              0 14px 30px -8px rgba(130, 80, 95, 0.1),
              inset 0 1.5px 2px rgba(255, 255, 255, 0.95),
              inset 0 -1px 2px rgba(212, 160, 170, 0.25)
            `,
          }}
        >
          {/* Logo & Monogram */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              marginBottom: "2.2rem",
            }}
          >
            {/* Elegant Monogram 'S' */}
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "50%",
                border: "1.2px solid rgba(196, 125, 136, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255, 255, 255, 0.6)",
                boxShadow: "0 4px 12px rgba(196, 125, 136, 0.15)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M16.5 7.5C16.5 5.5 14.5 4 12 4C9.5 4 7.5 5.5 7.5 7.5C7.5 11 16.5 10 16.5 14.5C16.5 17 14.5 19 12 19C9 19 7.5 17 7.5 15"
                  stroke="#B8737D"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <div>
              <div
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  color: "#3F2A2F",
                  fontFamily: "'Playfair Display', serif",
                }}
              >
                SCALP SCRUB
              </div>
              <div
                style={{
                  fontSize: "0.62rem",
                  fontWeight: 600,
                  letterSpacing: "0.26em",
                  color: "#8C6F76",
                }}
              >
                RITUAL OF RENEWAL
              </div>
            </div>
          </div>

          {/* Heading */}
          <div style={{ marginBottom: "2rem" }}>
            <h1
              id="login-welcome-title"
              style={{
                fontFamily: "'Playfair Display', 'Cormorant Garamond', Georgia, serif",
                fontSize: "2.4rem",
                fontWeight: 500,
                color: "#28191D",
                margin: "0 0 0.4rem 0",
                letterSpacing: "-0.01em",
              }}
            >
              Welcome Back
            </h1>
            <p
              style={{
                fontSize: "0.88rem",
                color: "#80666C",
                margin: 0,
                fontWeight: 400,
              }}
            >
              Sign in to continue your scalp care journey
            </p>
          </div>

          {/* Quick Role Switcher — dev/test only */}
          {isDev && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "1.4rem",
              }}
            >
              <button
                type="button"
                onClick={() => handleQuickRole("owner")}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  borderRadius: "10px",
                  border: activeRole === "owner" ? "1px solid rgba(196, 125, 136, 0.6)" : "1px solid rgba(255, 255, 255, 0.6)",
                  background: activeRole === "owner" ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.4)",
                  color: activeRole === "owner" ? "#8A3D4B" : "#80666C",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <Crown size={13} />
                Clinic Director
              </button>
              <button
                type="button"
                onClick={() => handleQuickRole("tricho")}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  borderRadius: "10px",
                  border: activeRole === "tricho" ? "1px solid rgba(196, 125, 136, 0.6)" : "1px solid rgba(255, 255, 255, 0.6)",
                  background: activeRole === "tricho" ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.4)",
                  color: activeRole === "tricho" ? "#8A3D4B" : "#80666C",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <Stethoscope size={13} />
                Trichologist
              </button>
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={onSubmit}
            noValidate
            style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}
          >
            {/* Input 1: Username or Email */}
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: "16px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#9C7E85",
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <User size={18} />
              </div>
              <input
                id="login-username-input"
                type="text"
                {...register("email")}
                autoComplete="username"
                placeholder="Username or Email"
                style={{
                  width: "100%",
                  height: "52px",
                  padding: "0 16px 0 46px",
                  borderRadius: "14px",
                  border: errors.email
                    ? "1.5px solid #E11D48"
                    : "1.2px solid rgba(255, 255, 255, 0.9)",
                  background: "rgba(255, 255, 255, 0.65)",
                  backdropFilter: "blur(10px)",
                  fontSize: "0.94rem",
                  color: "#28191D",
                  outline: "none",
                  boxShadow: `
                    0 4px 14px rgba(184, 115, 126, 0.08),
                    inset 0 1px 2px rgba(255, 255, 255, 0.9)
                  `,
                  transition: "all 0.25s ease",
                  boxSizing: "border-box",
                }}
              />
              {errors.email && (
                <p style={{ color: "#E11D48", fontSize: "0.76rem", margin: "4px 0 0 4px" }}>
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Input 2: Password */}
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: "16px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#9C7E85",
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Lock size={18} />
              </div>
              <input
                id="login-password-input"
                type={showPassword ? "text" : "password"}
                {...register("password")}
                autoComplete="current-password"
                placeholder="Password"
                style={{
                  width: "100%",
                  height: "52px",
                  padding: "0 46px 0 46px",
                  borderRadius: "14px",
                  border: errors.password
                    ? "1.5px solid #E11D48"
                    : "1.2px solid rgba(255, 255, 255, 0.9)",
                  background: "rgba(255, 255, 255, 0.65)",
                  backdropFilter: "blur(10px)",
                  fontSize: "0.94rem",
                  color: "#28191D",
                  outline: "none",
                  boxShadow: `
                    0 4px 14px rgba(184, 115, 126, 0.08),
                    inset 0 1px 2px rgba(255, 255, 255, 0.9)
                  `,
                  transition: "all 0.25s ease",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "14px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#9C7E85",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              {errors.password && (
                <p style={{ color: "#E11D48", fontSize: "0.76rem", margin: "4px 0 0 4px" }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember Me & Forgot Password */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "0.83rem",
                color: "#6F555C",
                margin: "0.1rem 0.2rem",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{
                    accentColor: "#B8737D",
                    width: "15px",
                    height: "15px",
                    cursor: "pointer",
                  }}
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                onClick={() => alert("Password reset link sent to registered clinic email.")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#A25C68",
                  fontSize: "0.83rem",
                  cursor: "pointer",
                  fontWeight: 500,
                  padding: 0,
                }}
              >
                Forgot password?
              </button>
            </div>

            {/* Server Error Alert */}
            {serverError && (
              <div
                role="alert"
                style={{
                  color: "#9F1239",
                  backgroundColor: "rgba(255, 241, 242, 0.8)",
                  backdropFilter: "blur(10px)",
                  padding: "0.7rem 0.9rem",
                  borderRadius: "12px",
                  fontSize: "0.8rem",
                  border: "1px solid #FFE4E6",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <AlertCircle size={16} color="#E11D48" />
                {serverError}
              </div>
            )}

            {/* Sign In Button */}
            <button
              id="login-submit-button"
              type="submit"
              disabled={isSubmitting}
              style={{
                width: "100%",
                height: "50px",
                borderRadius: "14px",
                border: "1px solid rgba(255, 255, 255, 0.4)",
                background: "linear-gradient(135deg, #B97682 0%, #A45F6C 100%)",
                color: "#FFFFFF",
                fontWeight: 600,
                fontSize: "0.98rem",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                boxShadow: "0 8px 24px -2px rgba(164, 95, 108, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                marginTop: "0.2rem",
                transition: "all 0.25s ease",
              }}
            >
              {isSubmitting ? "Authenticating..." : "Sign In"}
            </button>

            {/* Social Logins Divider */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                margin: "0.4rem 0",
              }}
            >
              <div style={{ flex: 1, height: "1px", background: "rgba(196, 125, 136, 0.25)" }} />
              <span style={{ fontSize: "0.76rem", color: "#8C6F76" }}>or continue with</span>
              <div style={{ flex: 1, height: "1px", background: "rgba(196, 125, 136, 0.25)" }} />
            </div>

            {/* Social Icon Buttons (Google, Apple, Biometric) */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "14px",
              }}
            >
              {/* Google */}
              <button
                type="button"
                onClick={() => alert("Google Sign-In ready")}
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "14px",
                  border: "1.2px solid rgba(255, 255, 255, 0.8)",
                  background: "rgba(255, 255, 255, 0.65)",
                  backdropFilter: "blur(10px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(184, 115, 126, 0.08)",
                  transition: "all 0.2s ease",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              </button>

              {/* Apple */}
              <button
                type="button"
                onClick={() => alert("Apple Sign-In ready")}
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "14px",
                  border: "1.2px solid rgba(255, 255, 255, 0.8)",
                  background: "rgba(255, 255, 255, 0.65)",
                  backdropFilter: "blur(10px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(184, 115, 126, 0.08)",
                  color: "#28191D",
                  transition: "all 0.2s ease",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.86c.66-.8 1.11-1.92.99-3.04-.96.04-2.12.64-2.8 1.44-.59.69-1.12 1.83-.98 2.92 1.07.08 2.16-.54 2.79-1.32" />
                </svg>
              </button>

              {/* Biometric / Touch ID */}
              <button
                type="button"
                onClick={() => alert("Biometric authentication initialized")}
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "14px",
                  border: "1.2px solid rgba(255, 255, 255, 0.8)",
                  background: "rgba(255, 255, 255, 0.65)",
                  backdropFilter: "blur(10px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(184, 115, 126, 0.08)",
                  color: "#B8737D",
                  transition: "all 0.2s ease",
                }}
              >
                <Fingerprint size={22} />
              </button>
            </div>

            {/* Create Account Link */}
            <div
              style={{
                textAlign: "center",
                marginTop: "0.8rem",
                fontSize: "0.84rem",
                color: "#6F555C",
              }}
            >
              New here?{" "}
              <button
                type="button"
                onClick={() => alert("Clinic Registration & Consultation portal available.")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#A25C68",
                  fontWeight: 600,
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: 0,
                  fontSize: "0.84rem",
                }}
              >
                Create an account
              </button>
            </div>
          </form>
        </LuxuryTiltCard>
      </div>

      {/* RIGHT: Floating High-End Editorial Typography (Matching Image Exactly) */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "82vh",
          maxWidth: "380px",
          textAlign: "left",
          pointerEvents: "none",
        }}
      >
        {/* Top Right Headline */}
        <div style={{ paddingTop: "1.5rem" }}>
          <h2
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "1.18rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "#573B41",
              margin: "0 0 0.8rem 0",
              lineHeight: 1.4,
            }}
          >
            HEALTHY SCALP.
            <br />
            BEAUTIFUL YOU.
          </h2>

          <p
            style={{
              fontSize: "0.86rem",
              color: "#7E646A",
              lineHeight: 1.65,
              margin: "0 0 1.2rem 0",
              maxWidth: "32ch",
            }}
          >
            Advanced scalp exfoliation for a cleaner, healthier foundation for your hair.
          </p>

          {/* Water Droplet Badge */}
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: "1.2px solid rgba(196, 125, 136, 0.4)",
              background: "rgba(255, 255, 255, 0.65)",
              backdropFilter: "blur(12px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#B8737D",
              boxShadow: "0 4px 14px rgba(196, 125, 136, 0.12)",
            }}
          >
            <Droplets size={17} />
          </div>
        </div>

        {/* Bottom Right Tagline */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            paddingBottom: "1.5rem",
          }}
        >
          <div
            style={{
              width: "2px",
              height: "32px",
              background: "rgba(196, 125, 136, 0.6)",
              borderRadius: "2px",
            }}
          />
          <div
            style={{
              fontSize: "0.78rem",
              fontWeight: 700,
              letterSpacing: "0.2em",
              color: "#6F5057",
              lineHeight: 1.35,
            }}
          >
            SCALP CARE
            <br />
            IS SELF CARE
          </div>
        </div>
      </div>
    </div>
  );
}
