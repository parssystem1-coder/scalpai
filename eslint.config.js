import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  /**
   * فاز ۳ (AUD-10) — پوشش لینت برای فرایند اصلی الکترون و اسکریپت‌های گیت.
   * -----------------------------------------------------------------------
   * چرا لازم بود: بلوک پایین فقط `**​/*.{ts,tsx}` را می‌دید، یعنی حدود ۶ هزار
   * خط حساس‌ترین کد پروژه (main process، رمزنگاری، لایهٔ دیتابیس و خودِ
   * اسکریپت‌های تست) هیچ گیت لینتی نداشت. یک تایپوی ساده در نام متغیر آن‌جا
   * تا زمان اجرا پنهان می‌ماند.
   *
   * قواعد عمداً هم‌تراز با همان استثناهای بخش TypeScript تنظیم شده‌اند تا
   * الگوهای مستند و عمدی پروژه «خطای کاذب» نسازند:
   *   - متغیرهای `_`دار: نتیجهٔ destructuring حذفی مثل
   *     `const { passwordHash: _ph, ...safe } = params` که راهِ استاندارد
   *     «این فیلد را عمداً بیرون بگذار» است.
   *   - `catch (e)` بدون استفاده: در چند جا عمداً خطا بلعیده می‌شود (مثل حذف
   *     فایل موقتی که ممکن است قفل باشد) و همان‌جا کامنت دارد.
   */
  {
    files: ['electron/**/*.cjs', 'scripts/**/*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      // sanitizePdfFileName عمداً کاراکترهای کنترلی را از نام فایل پاک می‌کند؛
      // این دقیقاً کار درست است، نه اشتباه.
      'no-control-regex': 'off',
    },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
)
