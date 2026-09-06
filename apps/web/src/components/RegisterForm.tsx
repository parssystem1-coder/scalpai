import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { User, Mail, Lock, Sparkles } from "lucide-react";
import { registerSchema, RegisterFormData } from "../types.js";

interface RegisterFormProps {
  onSubmit: (data: RegisterFormData) => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSubmit }) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  return (
    <div className="animate-fadeIn">
      <h1 className="font-serif text-3xl font-normal mb-1">Open Registration</h1>
      <p className="text-xs font-light text-[oklch(42%_0.02_20)] mb-4">
        ثبت‌نام مستقیم و آزاد برای تمامی آرایشگران، تریکولوژیست‌ها و سالن‌های زیبایی
      </p>

      {/* Subscription Callout */}
      <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[oklch(85%_0.1_50/0.15)] border border-[oklch(85%_0.12_55/0.4)] mb-4 text-xs">
        <Sparkles className="w-4 h-4 text-[oklch(62%_0.09_16)] shrink-0" />
        <p className="text-[0.72rem] text-right font-sans leading-relaxed" dir="rtl">
          <strong>شفاف‌سازی:</strong> ثبت‌نام اولیه کاملاً رایگان است. جهت دسترسی و فعال‌سازی ابزارهای درمانی، اشتراک تخصصی مورد نیاز خواهد بود.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>
        <div>
          <div className="relative">
            <input
              {...register("fullName")}
              type="text"
              placeholder="Full Name / Salon Name"
              className="w-full h-12 pl-12 pr-4 bg-white/60 focus:bg-white/90 border border-white/70 focus:border-[oklch(76%_0.085_24)] rounded-2xl outline-none text-sm transition-all shadow-inner"
            />
            <User className="absolute left-4 top-3.5 w-4.5 h-4.5 text-[oklch(60%_0.015_20)]" />
          </div>
          {errors.fullName && (
            <span className="text-[0.7rem] text-red-600 mt-1 block pr-1">
              {errors.fullName.message}
            </span>
          )}
        </div>

        <div>
          <div className="relative">
            <input
              {...register("email")}
              type="email"
              placeholder="Email Address"
              className="w-full h-12 pl-12 pr-4 bg-white/60 focus:bg-white/90 border border-white/70 focus:border-[oklch(76%_0.085_24)] rounded-2xl outline-none text-sm transition-all shadow-inner"
            />
            <Mail className="absolute left-4 top-3.5 w-4.5 h-4.5 text-[oklch(60%_0.015_20)]" />
          </div>
          {errors.email && (
            <span className="text-[0.7rem] text-red-600 mt-1 block pr-1">
              {errors.email.message}
            </span>
          )}
        </div>

        <div>
          <div className="relative">
            <input
              {...register("password")}
              type="password"
              placeholder="Create Password (min. 6 characters)"
              className="w-full h-12 pl-12 pr-4 bg-white/60 focus:bg-white/90 border border-white/70 focus:border-[oklch(76%_0.085_24)] rounded-2xl outline-none text-sm transition-all shadow-inner"
            />
            <Lock className="absolute left-4 top-3.5 w-4.5 h-4.5 text-[oklch(60%_0.015_20)]" />
          </div>
          {errors.password && (
            <span className="text-[0.7rem] text-red-600 mt-1 block pr-1">
              {errors.password.message}
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-12 rounded-2xl bg-gradient-to-r from-[oklch(76%_0.085_24)] via-[oklch(62%_0.09_16)] to-[oklch(48%_0.095_12)] text-white font-semibold text-xs tracking-wider uppercase shadow-xl hover:brightness-110 active:scale-[0.98] transition-all"
        >
          {isSubmitting ? "Creating Account..." : "Create Account & Choose Plan"}
        </button>
      </form>
    </div>
  );
};
