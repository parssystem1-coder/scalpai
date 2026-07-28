; installer.nsh — سفارشی‌سازی نصب‌کنندهٔ ScalpAI
; -----------------------------------------------------------------------
; این فایل توسط scripts/generate-build-assets.cjs ساخته شد، ولی اگر از قبل
; وجود داشته باشد هرگز بازنویسی نمی‌شود — می‌توانید آزادانه ویرایشش کنید.
;
; نکتهٔ مهم دربارهٔ داده‌های کاربر: پوشهٔ %APPDATA%\ScalpAI شامل دیتابیس
; بیماران و تصاویر است و هنگام حذف برنامه **عمداً پاک نمی‌شود**
; (deleteAppDataOnUninstall = false در electron-builder.json).
; حذف خودکار دادهٔ بالینی بدون تأیید صریح، غیرقابل‌قبول است.

!macro customInstall
  DetailPrint "در حال نصب ScalpAI..."
!macroend

!macro customUnInstall
  DetailPrint "در حال حذف ScalpAI..."
  DetailPrint "توجه: داده‌های شما در %APPDATA%\ScalpAI حفظ می‌شود."
!macroend
