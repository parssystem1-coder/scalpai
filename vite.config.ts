import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import sourceIdentifierPlugin from 'vite-plugin-source-identifier'

const isProd = process.env.BUILD_MODE === 'prod'
export default defineConfig({
  base: './',
  plugins: [
    react(), 
    sourceIdentifierPlugin({
      enabled: !isProd,
      attributePrefix: 'data-matrix',
      includeProps: true,
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * فاز ۳ (AUD-14) — جداسازی TensorFlow.js از کد خودمان.
         * -------------------------------------------------------------
         * مشکل: چانک `localModel` حدود ۱٫۶ مگابایت بود چون کتابخانهٔ سنگین
         * TensorFlow با منطق مدل در یک فایل ادغام می‌شد. نتیجه: روی
         * کامپیوترهای ضعیف کلینیک، اولین ورود به بخش یادگیری ماشین کند بود
         * و هر تغییر کوچک در کد ما، کل ۱٫۶ مگابایت را برای کاربر
         * بی‌اعتبار (cache-bust) می‌کرد.
         *
         * با این جداسازی، TensorFlow چانک مستقل و پایدار خودش را دارد: بین
         * نسخه‌ها در کش مرورگر/اپ باقی می‌ماند و فقط کد تغییرکردهٔ ما دوباره
         * بارگذاری می‌شود.
         */
        manualChunks(id: string) {
          if (id.includes('node_modules/@tensorflow')) return 'vendor-tensorflow';
        },
      },
    },
  },
})