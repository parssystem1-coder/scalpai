# فاز 0 — آماده‌سازی (ریپو و اسکلت)

> زمان: روز ۱-۲ · پیش‌نیاز: تأیید docs/DESIGN-V2.md توسط مالک

## تسک‌ها
1. `git init` + `.gitignore` (node_modules/dist/release/.env*/release/)
2. آرشیو کد فعلی: branch `legacy/v1` شامل همه فایل‌های فعلی؛ سپس پاک‌سازی root برای v2
   - نکته: پوشه legacy حذف نمی‌شود، فقط در برنچ باقی می‌ماند؛ working tree از نو ساخته می‌شود
3. Monorepo skeleton مطابق §5 سند:
   ```
   pnpm-workspace.yaml · turbo.json · package.json (root)
   apps/{api,web,portal,desktop,admin}  (هر کدام hello-world قابل build)
   packages/{shared,db,sync-client,analysis-core,analysis-engine,education,licensing,notify,ui}
   tooling/{eslint-config,tsconfig,tailwind-preset}
   ops/dev.yml
   ```
4. tooling مشترک + husky/lint-staged + conventional commits
5. CI پایه (GitHub Actions): lint+typecheck+build matrix
6. ADR-0001..0004 (از §17 سند) به‌صورت فایل در `docs/adr/`
7. سیاست Merge دو لاین (ADR-23 · §14.5): branch protection روی main + required checks + فعال‌سازی auto-merge — توافق Fast/Gated مکتوب
8. Scaffold ابزار نگهبانی برای فاز ۱: اسکلت `tools/conformance` و `tools/graph` (+ self-test خالی) تا قرارداد از روز اول ثابت باشد

## Definition of Done
```powershell
git log --oneline            # حداقل: init, legacy archive, scaffold, ci
pnpm install; pnpm build     # همه اپ‌ها/پکیج‌ها بدون خطا build شوند
gh workflow list             # CI فعال
```
- [ ] هیچ فایلی از v1 در main نیست (فقط برنچ legacy)
- [ ] `pnpm -r typecheck` سبز است
- [ ] branch protection + auto-merge روی main فعال است (دو لاین Fast/Gated)
