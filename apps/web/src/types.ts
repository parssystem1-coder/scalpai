import { z } from "zod";

export const signInSchema = z.object({
  username: z.string().min(1, "نام کاربری یا ایمیل الزامی است"),
  password: z.string().min(6, "رمز عبور باید حداقل ۶ کاراکتر باشد"),
  rememberMe: z.boolean(),
});

export const registerSchema = z.object({
  fullName: z.string().min(2, "نام و نام خانوادگی یا نام سالن الزامی است"),
  email: z.string().email("ایمیل وارد شده معتبر نیست"),
  password: z.string().min(6, "رمز عبور باید حداقل ۶ کاراکتر باشد"),
});

export type SignInFormData = z.infer<typeof signInSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;

export type TabMode = "signin" | "register" | "plans";

export interface MoleculeInfo {
  name: string;
  formula: string;
  desc: string;
  badge: string;
}
