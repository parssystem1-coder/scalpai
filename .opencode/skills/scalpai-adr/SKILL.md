---
name: scalpai-adr
description: Create, update and register ScalpAI v2 Architecture Decision Records (ADRs). Use when the user says "ADR بساز", "این تصمیم را ADR کن", "record an ADR", "decide between X and Y for ScalpAI", or when a deviation from docs/DESIGN-V2.md is discovered during build/gate that must be recorded. Handles template, numbering, §17 index registration and exceptions.json linkage.
---

# ScalpAI v2 — ADR Factory

## چه چیزی ADR می‌خواهد، چه چیزی نمی‌خواهد

**ADR لازم است:** تغییر قرارداد API/DB · انتخاب/تعویض فناوری · سیاست تعارض sync · فیچر gating جدید · انحراف از DESIGN-V2 · استثنای دائمی از engineering-rules
**ADR لازم نیست:** refactor بدون تغییر رفتار · رفع باگ · افزودن endpoint عادی مطابق سند · محتوای storyboard

## پروتکل ساخت

1. **شماره:** بزرگ‌ترین ADR موجود در `docs/adr/` + جدول §17 سند +۱ (الان: بعدی = 24). هرگز شماره استفاده‌شده را بازیافت نکن
2. **بررسی تضاد:** در §17 و فایل‌های adr بگرد — اگر تصمیم قبلی را تغییر می‌دهد، ADR جدید با `Superseded by` بنویس؛ ADR قبلی را ویرایش نکن (فقط Status اش شود `Superseded by ADR-XXXX`)
3. **فایل:** `docs/adr/ADR-NNNN-slug-en.md` با قالب پایین
4. **ثبت در اندیس:** یک ردیف به جدول §17 سند اضافه کن: `| NNNN | تصمیم یک‌خطی | جایگزین ردشده | دلیل |`
5. **اتصال استثنا:** اگر این ADR مجوز نقض قانونی در engineering-rules است، راهنمای ورودش به exceptions.json را هم بنویس (rule + file + adr)
6. **کامیت جدا:** `docs(adr): ADR-NNNN — <عنوان کوتاه>`

## قالب فایل

```markdown
# ADR-NNNN — <عنوان>

- Status: Proposed | Accepted | Superseded by ADR-MMMM
- Date: YYYY-MM-DD
- Phase: <فاز/های مرتبط>
- Blocks: <چه چیزی منتظر این تصمیم است>

## زمینه (Context)
مشکل/نیاز — با ارجاع به بخش سند (§X)

## تصمیم (Decision)
تصمیم قطعی، صریح، قابل تست

## جایگزین‌های ردشده (Alternatives)
هر جایگزین + دلیل رد (یک خط)

## پیامدها (Consequences)
- مثبت: ...
- منفی/هزینه پذیرفته‌شده: ...

## تأثیر بر قوانین
تغییر در engineering-rules.md؟ (در صورت لزوم متن بند جدید)
```

## قواعد سخت
- **یک تصمیم در هر ADR** — تصمیم ترکیبی = چند ADR
- ADR Accepted غیرقابل ویرایش است (جز ستون Status) — اصلاح = ADR جدید که قبلی را Supersede می‌کند
- Proposed بدون تأیید مالک نباید در کد اعمال شود
- عنوان/محتوا فارسی آزاد؛ ID و slug انگلیسی
- اگر تصمیم با §17 سند فعلی تناقض دارد، خود سند هم همانجا آپدیت شود (ADR برنده است، اما دوگانه ماندن ممنوع)
