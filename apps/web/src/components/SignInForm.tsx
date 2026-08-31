import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { User, Lock, Eye, EyeOff } from "lucide-react";
import { signInSchema, SignInFormData } from "../types.js";

interface SignInFormProps {
  onSubmit: (data: SignInFormData) => void;
  onDemoLogin: (provider: "Google" | "Apple") => void;
  onForgotPassword: () => void;
}

export const SignInForm: React.FC<SignInFormProps> = ({
  onSubmit,
  onDemoLogin,
  onForgotPassword,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      username: "",
      password: "",
      rememberMe: true,
    },
  });

  return (
    <div className="animate-fadeIn">
      <h1 className="font-serif text-3xl font-normal mb-1">Welcome Back</h1>
      <p className="text-xs font-light text-[oklch(42%_0.02_20)] mb-5">
        Sign in to your active professional scalp suite
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>
        <div>
          <div className="relative">
            <input
              {...register("username")}
              type="text"
              placeholder="Username or Email"
              className="w-full h-12 pl-12 pr-4 bg-white/60 focus:bg-white/90 border border-white/70 focus:border-[oklch(76%_0.085_24)] rounded-2xl outline-none text-sm transition-all shadow-inner"
            />
            <User className="absolute left-4 top-3.5 w-4.5 h-4.5 text-[oklch(60%_0.015_20)]" />
          </div>
          {errors.username && (
            <span className="text-[0.7rem] text-red-600 mt-1 block pr-1">
              {errors.username.message}
            </span>
          )}
        </div>

        <div>
          <div className="relative">
            <input
              {...register("password")}
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              className="w-full h-12 pl-12 pr-12 bg-white/60 focus:bg-white/90 border border-white/70 focus:border-[oklch(76%_0.085_24)] rounded-2xl outline-none text-sm transition-all shadow-inner"
            />
            <Lock className="absolute left-4 top-3.5 w-4.5 h-4.5 text-[oklch(60%_0.015_20)]" />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-3 text-[oklch(60%_0.015_20)] hover:text-black"
            >
              {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
            </button>
          </div>
          {errors.password && (
            <span className="text-[0.7rem] text-red-600 mt-1 block pr-1">
              {errors.password.message}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between text-xs py-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              {...register("rememberMe")}
              type="checkbox"
              className="rounded border-gray-300 text-[oklch(62%_0.09_16)] focus:ring-0"
            />
            <span>Remember me</span>
          </label>
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-[oklch(62%_0.09_16)] font-medium hover:underline bg-transparent border-0 p-0 cursor-pointer"
          >
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-12 rounded-2xl bg-gradient-to-r from-[oklch(76%_0.085_24)] via-[oklch(62%_0.09_16)] to-[oklch(48%_0.095_12)] text-white font-semibold text-xs tracking-wider uppercase shadow-xl hover:brightness-110 active:scale-[0.98] transition-all"
        >
          {isSubmitting ? "Authenticating..." : "Sign In to Pro Suite"}
        </button>
      </form>

      <div className="relative flex items-center justify-center my-4">
        <div className="border-t border-black/10 w-full" />
        <span className="bg-transparent px-3 text-[0.65rem] tracking-wider uppercase text-[oklch(60%_0.015_20)]">
          or explore instant demo with
        </span>
        <div className="border-t border-black/10 w-full" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-2">
        <button
          type="button"
          onClick={() => onDemoLogin("Google")}
          className="h-11 rounded-2xl bg-white/60 hover:bg-white/90 border border-white/80 flex items-center justify-center gap-2 text-xs font-semibold shadow-sm transition-all hover:-translate-y-0.5"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A10.94 10.94 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4z"
              fill="#EA4335"
            />
          </svg>
          <span>Google Demo</span>
        </button>

        <button
          type="button"
          onClick={() => onDemoLogin("Apple")}
          className="h-11 rounded-2xl bg-white/60 hover:bg-white/90 border border-white/80 flex items-center justify-center gap-2 text-xs font-semibold shadow-sm transition-all hover:-translate-y-0.5"
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-2.13 4.48-3.74 4.25z" />
          </svg>
          <span>Apple Demo</span>
        </button>
      </div>
      <p className="text-center text-[0.68rem] text-[oklch(50%_0.015_20)]">
        💡 ورود با گوگل/اپل شما را مستقیماً وارد محیط پیش‌نمایش (Demo Mode) می‌کند.
      </p>
    </div>
  );
};
