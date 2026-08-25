# فاز 4 — تجربه (Education E1 + PDF + Scalp Map + Electron)

> زمان: ماه ۴-۵ · پیش‌نیاز: DoD فاز 3

## مرجع سند
DESIGN-V2 §11 (storyboards) · §12 (Microscopy Premium) · ADR-8/9

## تسک‌ها

### 4.1 Education E1 (packages/education)
- Storyboard Mapper: خواندن JSON storyboard ها از shared + نگاشت نتیجه تحلیل → صحنه/شدت
- ۸ انیمیشن Rive با state-machine شدت (خفیف/متوسط/شدید)
- قواعد §11: skip همیشه · prefers-reduced-motion · reviewedBy الزامی · دیسکلیمر دائمی

### 4.2 گزارش PDF بالینی
- قالب حرفه‌ای RTL: مشخصات، تصاویر، متریک‌ها، توصیه‌ها، دیسکلیمر
- تولید در worker (Puppeteer) + ذخیره MinIO + لینک توکن‌دار برای بیمار (پیش‌نیاز فاز 5)

### 4.3 داشبورد Scalp Map
- نقشه سر SVG با heatmap تراکم/قرمزی از آخرین تحلیل هر بیمار
- Signature transition «ورود به زیر پوست» (Framer Motion، سبک — 3D کامل فاز 6)

### 4.4 Guided capture
- پرامپت عکس هر جلسه (چک‌لیست زاویه‌ها + quality-gate همانجا)

### 4.5 پوسته Electron (apps/desktop)
- شل نازک: loadURL وب + آیکون/فول‌اسکرین/autoupdate placeholder · هیچ منطق business داخلش

## Definition of Done
```powershell
pnpm e2e --grep "@education"; pnpm e2e --grep "@pdf"
```
- [ ] هر ۸ storyboard برای هر سه شدت بدون خطا پخش می‌شود
- [ ] reduced-motion → انیمیشن جایگزین ایستا
- [ ] PDF تولیدشده روی Windows/macOS یکسان رندر می‌شود (snapshot test)
- [ ] Lighthouse a11y صفحه تحلیل ≥95
