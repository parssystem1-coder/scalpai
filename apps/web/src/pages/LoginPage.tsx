import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoginRequest, type LoginRequest as LoginDto } from "@scalpai/shared";
import { useTranslation } from "react-i18next";
import { apiFetch, setAccessToken } from "../api/client.js";
import { 
  Sparkles, 
  Eye, 
  EyeOff, 
  Mail, 
  ChevronLeft,
  ShieldCheck,
  Sparkle
} from "lucide-react";
import FigmaLuxuryBackground from "../components/FigmaLuxuryBackground.js";

type TokenPair = { accessToken: string; refreshToken: string };

export default function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [activeDemoRole, setActiveDemoRole] = useState<"owner" | "tricho">("owner");

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
      setServerError(e instanceof Error ? e.message : "خطای نامشخص در ورود");
    }
  });

  const setDemoAccount = (role: "owner" | "tricho") => {
    setActiveDemoRole(role);
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
      style={{
        minHeight: "100vh",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
      }}
    >
      {/* Figma Animated Luxury Canvas & SVG Background */}
      <FigmaLuxuryBackground />

      {/* Top Header */}
      <header
        style={{
          position: "relative",
          zIndex: 20,
          width: "100%",
          padding: "1.5rem 3rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #C9906A 0%, #D4A96A 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FAF7F2",
              boxShadow: "0 6px 20px rgba(201, 144, 106, 0.35)",
            }}
          >
            <Sparkles size={20} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "1.4rem",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "#1A1614",
                }}
              >
                Scalp<span style={{ color: "#C9906A" }}>AI</span>
              </span>
              <span
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "100px",
                  background: "rgba(250,247,242,0.85)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(201,144,106,0.25)",
                  color: "#C9906A",
                  letterSpacing: "0.08em",
                }}
              >
                CLINICAL TRICHOLOGY
              </span>
            </div>
            <span style={{ fontSize: "0.76rem", color: "#8A7A70", fontWeight: 500 }}>
              فناوری هوشمند تریکولوژی و ماتریس عصبی فولیکول
            </span>
          </div>
        </div>

        {/* Clinical Quality Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 16px",
            borderRadius: "100px",
            border: "1px solid rgba(201,144,106,0.3)",
            background: "rgba(250,247,242,0.75)",
            backdropFilter: "blur(16px)",
            fontSize: "0.78rem",
            color: "#1A1614",
            fontWeight: 600,
            boxShadow: "0 4px 14px rgba(0,0,0,0.02)",
          }}
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "#C9906A",
              boxShadow: "0 0 8px #C9906A",
            }}
          />
          سامانه فعال و متصل
        </div>
      </header>

      {/* Main Content: Hero Grid with Figma Aesthetics */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          flex: 1,
          maxWidth: "1340px",
          width: "100%",
          margin: "0 auto",
          padding: "1rem 2.5rem 2.5rem 2.5rem",
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr",
          gap: "4rem",
          alignItems: "center",
        }}
      >
        {/* Right Side: Editorial Figma Hero Title & Clinical Stats */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 16px",
              borderRadius: "100px",
              border: "1px solid rgba(201,144,106,0.3)",
              background: "rgba(250,247,242,0.7)",
              backdropFilter: "blur(12px)",
              color: "#C9906A",
              fontSize: "0.78rem",
              fontWeight: 600,
              width: "fit-content",
              letterSpacing: "0.05em",
            }}
          >
            <Sparkle size={14} />
            فناوری ماتریس عصبی فولیکول (Neural Follicle Technology)
          </div>

          <h1
            style={{
              fontSize: "clamp(2.4rem, 4.2vw, 3.8rem)",
              fontWeight: 800,
              lineHeight: 1.15,
              color: "#1A1614",
              margin: 0,
            }}
          >
            دقت کلینیکال،{" "}
            <span
              style={{
                fontStyle: "italic",
                background: "linear-gradient(135deg, #C9906A 0%, #D4A96A 40%, #E8C88A 65%, #C9906A 100%)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                display: "inline-block",
              }}
            >
              درخشش ابریشمی
            </span>
          </h1>

          <p
            style={{
              fontSize: "1rem",
              color: "#5A4A42",
              lineHeight: 1.8,
              margin: 0,
              maxWidth: "52ch",
              fontWeight: 400,
            }}
          >
            پلتفرم هوش مصنوعی تخصصی تحلیل تریکوسکوپی، نقشه‌برداری میکرومتری لایه‌های کوتیکول و ثبت پرونده‌های بالینی با بالاترین استانداردهای روز دنیا.
          </p>

          {/* Stats Bar from Figma */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "1.5rem",
              borderTop: "1px solid rgba(201,144,106,0.2)",
              paddingTop: "1.5rem",
              marginTop: "0.5rem",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "1.8rem",
                  fontWeight: 800,
                  color: "#1A1614",
                  lineHeight: 1,
                  background: "linear-gradient(135deg, #C9906A 0%, #D4A96A 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                ۹۹.۴٪
              </div>
              <div style={{ fontSize: "0.75rem", color: "#8A7A70", marginTop: "4px", fontWeight: 500 }}>
                دقت اسکن کوتیکول
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: "1.8rem",
                  fontWeight: 800,
                  color: "#1A1614",
                  lineHeight: 1,
                  background: "linear-gradient(135deg, #C9906A 0%, #D4A96A 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                ۰.۴ μm
              </div>
              <div style={{ fontSize: "0.75rem", color: "#8A7A70", marginTop: "4px", fontWeight: 500 }}>
                تفکیک‌پذیری میکرومتری
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: "1.8rem",
                  fontWeight: 800,
                  color: "#1A1614",
                  lineHeight: 1,
                  background: "linear-gradient(135deg, #C9906A 0%, #D4A96A 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                ۳۰۰k
              </div>
              <div style={{ fontSize: "0.75rem", color: "#8A7A70", marginTop: "4px", fontWeight: 500 }}>
                نقشه‌برداری فولیکولی
              </div>
            </div>
          </div>
        </div>

        {/* Left Side: Frosted Glass Login Form */}
        <main
          id="login-container"
          style={{
            width: "100%",
            maxWidth: "440px",
            margin: "0 auto",
            padding: "2.4rem 2.2rem",
            borderRadius: "24px",
            background: "rgba(255, 255, 255, 0.72)",
            backdropFilter: "blur(24px)",
            border: "1.5px solid rgba(201, 144, 106, 0.28)",
            boxShadow: `
              0 30px 60px -15px rgba(201, 144, 106, 0.18),
              0 10px 25px -5px rgba(0, 0, 0, 0.03),
              inset 0 1px 0 rgba(255, 255, 255, 0.95)
            `,
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: "1.6rem" }}>
            <h2
              id="login-title"
              style={{
                fontSize: "1.4rem",
                fontWeight: 800,
                color: "#1A1614",
                margin: "0 0 0.3rem 0",
              }}
            >
              {t("login.title")}
            </h2>
            <p style={{ fontSize: "0.84rem", color: "#8A7A70", margin: 0 }}>
              ورود کادر درمان و متخصصین کلینیک
            </p>
          </div>

          {/* Role Switcher */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "6px",
              padding: "4px",
              borderRadius: "14px",
              background: "rgba(240, 230, 212, 0.45)",
              marginBottom: "1.5rem",
              border: "1px solid rgba(201, 144, 106, 0.15)",
            }}
          >
            <button
              id="demo-account-owner-btn"
              type="button"
              onClick={() => setDemoAccount("owner")}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "none",
                background: activeDemoRole === "owner" ? "#ffffff" : "transparent",
                color: activeDemoRole === "owner" ? "#1A1614" : "#8A7A70",
                fontWeight: activeDemoRole === "owner" ? 700 : 500,
                fontSize: "0.82rem",
                cursor: "pointer",
                boxShadow: activeDemoRole === "owner" ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.2s",
              }}
            >
              مدیر کلینیک
            </button>
            <button
              id="demo-account-tricho-btn"
              type="button"
              onClick={() => setDemoAccount("tricho")}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "none",
                background: activeDemoRole === "tricho" ? "#ffffff" : "transparent",
                color: activeDemoRole === "tricho" ? "#1A1614" : "#8A7A70",
                fontWeight: activeDemoRole === "tricho" ? 700 : 500,
                fontSize: "0.82rem",
                cursor: "pointer",
                boxShadow: activeDemoRole === "tricho" ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.2s",
              }}
            >
              پزشک تریکولوژیست
            </button>
          </div>

          {/* Form */}
          <form onSubmit={onSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "1.15rem" }}>
            {/* Email */}
            <div>
              <label
                htmlFor="login-email-input"
                style={{
                  display: "block",
                  marginBottom: "0.4rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "#2E2824",
                }}
              >
                {t("login.email")}
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="login-email-input"
                  type="email"
                  {...register("email")}
                  autoComplete="username"
                  placeholder="ایمیل پزشک یا کلینیک..."
                  style={{
                    width: "100%",
                    padding: "0.78rem 1rem 0.78rem 2.5rem",
                    borderRadius: "12px",
                    border: errors.email ? "1.5px solid #ef4444" : "1.5px solid rgba(201, 144, 106, 0.25)",
                    background: "rgba(255, 255, 255, 0.9)",
                    fontSize: "0.9rem",
                    color: "#1A1614",
                    outline: "none",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#C9906A",
                  }}
                >
                  <Mail size={16} />
                </div>
              </div>
              {errors.email && (
                <p role="alert" style={{ color: "#ef4444", fontSize: "0.75rem", margin: "0.3rem 0 0 0" }}>
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="login-password-input"
                style={{
                  display: "block",
                  marginBottom: "0.4rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "#2E2824",
                }}
              >
                {t("login.password")}
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="login-password-input"
                  type={showPassword ? "text" : "password"}
                  {...register("password")}
                  autoComplete="current-password"
                  placeholder="رمز عبور..."
                  style={{
                    width: "100%",
                    padding: "0.78rem 1rem 0.78rem 2.5rem",
                    borderRadius: "12px",
                    border: errors.password ? "1.5px solid #ef4444" : "1.5px solid rgba(201, 144, 106, 0.25)",
                    background: "rgba(255, 255, 255, 0.9)",
                    fontSize: "0.9rem",
                    color: "#1A1614",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    left: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#C9906A",
                    cursor: "pointer",
                    padding: "4px",
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p role="alert" style={{ color: "#ef4444", fontSize: "0.75rem", margin: "0.3rem 0 0 0" }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Server Error */}
            {serverError && (
              <div
                id="login-error-message"
                role="alert"
                style={{
                  color: "#b91c1c",
                  backgroundColor: "#fef2f2",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "10px",
                  fontSize: "0.8rem",
                  border: "1px solid #fecaca",
                }}
              >
                {serverError}
              </div>
            )}

            {/* Submit Button */}
            <button
              id="login-submit-button"
              type="submit"
              disabled={isSubmitting}
              style={{
                width: "100%",
                padding: "0.9rem",
                borderRadius: "100px",
                background: "linear-gradient(135deg, #C9906A 0%, #D4A96A 60%, #C9906A 100%)",
                backgroundSize: "200% auto",
                color: "#FAF7F2",
                border: "none",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                opacity: isSubmitting ? 0.75 : 1,
                boxShadow: "0 6px 24px rgba(201, 144, 106, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                marginTop: "0.3rem",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
              }}
            >
              {isSubmitting ? (
                "در حال ورود به سامانه..."
              ) : (
                <>
                  <span>ورود به پرونده‌های بالینی</span>
                  <ChevronLeft size={18} />
                </>
              )}
            </button>

            {/* Subtext */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                fontSize: "0.74rem",
                color: "#8A7A70",
                marginTop: "0.15rem",
              }}
            >
              <ShieldCheck size={14} color="#C9906A" />
              اتصال امن با استاندارد رمزنگاری درمانی
            </div>
          </form>
        </main>
      </div>

      {/* Footer */}
      <footer
        style={{
          position: "relative",
          zIndex: 20,
          width: "100%",
          padding: "1rem 3rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.78rem",
          color: "#8A7A70",
          borderTop: "1px solid rgba(201, 144, 106, 0.18)",
          background: "rgba(250, 247, 242, 0.6)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div>
          © ۱۴۰۵ ScalpAI — پلتفرم نسل جدید تحلیل تریکوسکوپی و مراقبت بالینی مو
        </div>
        <div style={{ display: "flex", gap: "1.5rem" }}>
          <span>فناوری ماتریس عصبی فولیکول</span>
          <span>امنیت داده‌های بالینی</span>
        </div>
      </footer>
    </div>
  );
}
