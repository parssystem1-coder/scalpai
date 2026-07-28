# فعال‌سازی CI — یک قدم دستی لازم است

## چرا این فایل اینجاست و نه در `.github/workflows/`؟

GitHub اجازه نمی‌دهد یک GitHub App بدون مجوز `workflows` فایل workflow را
ایجاد یا تغییر دهد. این یک محدودیت امنیتی خود GitHub است، نه مشکل پروژه.
پیام دقیق هنگام push:

```
refusing to allow a GitHub App to create or update workflow
`.github/workflows/ci.yml` without `workflows` permission
```

پس فایل آمادهٔ `ci.yml` اینجا قرار گرفته تا شما با یک دستور فعالش کنید.

---

## فعال‌سازی (یک بار، ~۱۰ ثانیه)

در پوشهٔ پروژه اجرا کنید:

```bash
mkdir -p .github/workflows
git mv docs/ci/ci.yml .github/workflows/ci.yml
git commit -m "ci: فعال‌سازی workflow بررسی خودکار"
git push
```

پس از این، در تب **Actions** مخزن، اجرای CI را خواهید دید.

---

## این CI چه چیزی را بررسی می‌کند؟

### جاب `verify` — روی هر push و هر Pull Request

| مرحله | چه چیزی را می‌گیرد |
|---|---|
| `tsc -b` | خطای تایپ |
| `eslint .` | خطای لینت (۰ خطا الزامی است) |
| `vitest run` | ۱۵۸ تست واحد |
| `test-db-contract.cjs` | ناسازگاری قرارداد دیتابیس بین موتور SQLite و JSON |
| `check-shared-constants.cjs` | واگرایی ثابت‌ها بین موتور TypeScript و Python |
| `test-build-assets.cjs` | دارایی نصب‌کننده که ارجاع دارد ولی تولید نمی‌شود |
| `pnpm run build` | خرابی بیلد production |

### جاب `package` — فقط با اجرای دستی یا تگ `v*`

نصب‌کنندهٔ واقعی ویندوز را می‌سازد و به‌عنوان artifact آپلود می‌کند.
گران‌تر است، پس روی هر push اجرا نمی‌شود.

برای اجرای دستی: تب **Actions** ← workflow **CI** ← دکمهٔ **Run workflow**.

---

## چرا این مهم است؟

قرارداد «پایان هر فاز» در مستندات پروژه، اجرای دستی `pnpm verify` را الزامی
می‌کرد. در عمل چند فاز «انجام‌شده» علامت خوردند در حالی که بخش‌هایی از
آن‌ها هرگز وارد مخزن نشده بودند — چون هیچ سیستمی ادعای سند را در برابر
واقعیت کد نمی‌سنجید.

از این پس **«انجام شد» یعنی «CI سبز است»**، نه یک جدول در markdown.
