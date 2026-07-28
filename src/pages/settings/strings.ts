/** متن‌های صفحهٔ تنظیمات — تنها منبع حقیقت برای هر دو زبان */
import type { Dict } from '../../i18n';

export const settingsDict = {
  // تب‌ها
  tabGeneral: { fa: 'عمومی', en: 'General' },
  tabProfile: { fa: 'پروفایل', en: 'Profile' },
  tabProxy: { fa: 'پروکسی', en: 'Proxy' },
  tabTrichologists: { fa: 'تریکولوژیست‌ها', en: 'Trichologists' },
  tabAI: { fa: 'هوش مصنوعی', en: 'AI Settings' },

  // عمومی — زبان و تم
  language: { fa: 'زبان', en: 'Language' },
  theme: { fa: 'تم', en: 'Theme' },
  themeDark: { fa: 'تیره', en: 'Dark' },
  themeBlue: { fa: 'آبی', en: 'Blue' },
  themePurple: { fa: 'بنفش', en: 'Purple' },
  themeMint: { fa: 'نعنایی', en: 'Mint' },
  themeNeural: { fa: 'عصبی AI', en: 'Neural AI' },
  themeMintAi: { fa: 'نعنایی AI', en: 'Mint AI' },
  themesHint: {
    fa: 'تم‌های حرفه‌ای با افکت شیشه‌ای؛ تم عصبی AI با پس‌زمینه متحرک',
    en: 'Professional glassmorphism themes; Neural AI includes an animated background',
  },

  // عمومی — پشتیبان‌گیری
  backupRestore: { fa: 'پشتیبان‌گیری و بازیابی', en: 'Backup & Restore' },
  backupFolder: { fa: 'پوشه ذخیره‌سازی', en: 'Backup Folder' },
  noFolderSelected: { fa: 'پوشه‌ای انتخاب نشده', en: 'No folder selected' },
  select: { fa: 'انتخاب', en: 'Select' },
  backupFolderHint: {
    fa: 'پوشه را انتخاب کنید تا پشتیبان‌ها مستقیماً در آن ذخیره شوند',
    en: 'Select a folder to save backups directly',
  },
  backup: { fa: 'پشتیبان‌گیری', en: 'Backup' },
  restore: { fa: 'بازیابی', en: 'Restore' },
  folderSelected: { fa: 'پوشه ذخیره‌سازی انتخاب شد', en: 'Backup folder selected' },
  folderNotSupported: {
    fa: 'مرورگر شما از انتخاب پوشه پشتیبانی نمی‌کند',
    en: 'Your browser does not support folder selection',
  },
  restoreSuccess: { fa: 'بازیابی با موفقیت انجام شد', en: 'Restore completed successfully' },
  restoreError: { fa: 'خطا در بازیابی', en: 'Error restoring data' },

  // پروفایل
  personalInfo: { fa: 'اطلاعات شخصی', en: 'Personal Information' },
  firstName: { fa: 'نام', en: 'First Name' },
  lastName: { fa: 'نام خانوادگی', en: 'Last Name' },
  firstNamePlaceholder: { fa: 'نام خود را وارد کنید', en: 'Enter your first name' },
  lastNamePlaceholder: { fa: 'نام خانوادگی خود را وارد کنید', en: 'Enter your last name' },
  saveProfile: { fa: 'ذخیره اطلاعات', en: 'Save Profile' },
  firstNameRequired: { fa: 'نام الزامی است', en: 'First name is required' },
  profileSaved: { fa: 'پروفایل با موفقیت ذخیره شد', en: 'Profile saved successfully' },
  changeUsername: { fa: 'تغییر نام کاربری', en: 'Change Username' },
  newUsername: { fa: 'نام کاربری جدید', en: 'New Username' },
  usernameMin: { fa: 'نام کاربری باید حداقل ۳ کاراکتر باشد', en: 'Username must be at least 3 characters' },
  usernameChanged: { fa: 'نام کاربری با موفقیت تغییر کرد', en: 'Username changed successfully' },
  changePassword: { fa: 'تغییر رمز عبور', en: 'Change Password' },
  currentPassword: { fa: 'رمز عبور فعلی', en: 'Current Password' },
  newPassword: { fa: 'رمز عبور جدید', en: 'New Password' },
  confirmNewPassword: { fa: 'تکرار رمز عبور جدید', en: 'Confirm New Password' },
  wrongCurrentPassword: { fa: 'رمز عبور فعلی اشتباه است', en: 'Current password is incorrect' },
  passwordMin: { fa: 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد', en: 'New password must be at least 8 characters' },
  passwordMismatch: {
    fa: 'رمز عبور جدید با تکرار آن مطابقت ندارد',
    en: 'New password and confirmation do not match',
  },
  passwordChanged: { fa: 'رمز عبور با موفقیت تغییر کرد', en: 'Password changed successfully' },

  // پروکسی
  systemProxy: { fa: 'تنظیمات پروکسی سیستم', en: 'System Proxy Settings' },
  systemProxySubtitle: { fa: 'برای عبور از فیلترینگ در ایران', en: 'For bypassing internet filtering in Iran' },
  localProxyAddress: { fa: 'آدرس پروکسی لوکال', en: 'Local Proxy Address' },
  proxyHint: {
    fa: 'آدرس پروکسی فیلتر شکن خود را وارد کنید (مثلاً V2Ray, Clash, Shadowsocks)',
    en: 'Enter your VPN/proxy address (e.g., V2Ray, Clash, Shadowsocks)',
  },
  saveApply: { fa: 'ذخیره و اعمال', en: 'Save & Apply' },
  testConnection: { fa: 'تست اتصال', en: 'Test Connection' },
  disable: { fa: 'غیرفعال کردن', en: 'Disable' },
  proxySet: { fa: 'پروکسی با موفقیت تنظیم شد', en: 'Proxy configured successfully' },
  proxySetError: { fa: 'خطا در تنظیم پروکسی', en: 'Error configuring proxy' },
  proxyDisabled: { fa: 'پروکسی غیرفعال شد', en: 'Proxy disabled' },
  proxyOk: { fa: 'اتصال موفق! پروکسی کار می‌کند.', en: 'Connection successful! Proxy is working.' },
  proxyFail: { fa: 'اتصال ناموفق. پروکسی را بررسی کنید.', en: 'Connection failed. Check your proxy.' },
  commonProxies: { fa: 'نمونه آدرس‌های رایج:', en: 'Common Proxy Addresses:' },
  webProxyTitle: { fa: 'تنظیمات پروکسی وب', en: 'Web Proxy Settings' },
  webProxySubtitle: { fa: 'نسخه وب از پروکسی CORS استفاده می‌کند', en: 'Web version uses CORS proxy' },
  webProxyDesktopHint: {
    fa: 'برای استفاده بهتر و پشتیبانی از پروکسی سیستم، نسخه دسکتاپ (Electron) را نصب کنید.',
    en: 'For better experience and system proxy support, install the desktop (Electron) version.',
  },
  webProxyCorsHint: {
    fa: 'در نسخه وب، از تنظیمات "پراکسی CORS" در بخش هوش مصنوعی استفاده کنید.',
    en: 'In web version, use "CORS Proxy" settings in AI Settings section.',
  },

  // تریکولوژیست‌ها
  manageTrichologists: { fa: 'مدیریت تریکولوژیست‌ها', en: 'Manage Trichologists' },
  add: { fa: 'افزودن', en: 'Add' },
  noTrichologists: { fa: 'تریکولوژیستی ثبت نشده', en: 'No trichologists registered' },
  active: { fa: 'فعال', en: 'Active' },
  inactive: { fa: 'غیرفعال', en: 'Inactive' },
  editTrichologist: { fa: 'ویرایش تریکولوژیست', en: 'Edit Trichologist' },
  newTrichologist: { fa: 'تریکولوژیست جدید', en: 'New Trichologist' },
  name: { fa: 'نام', en: 'Name' },
  specialty: { fa: 'تخصص', en: 'Specialty' },
  phone: { fa: 'تلفن', en: 'Phone' },
  email: { fa: 'ایمیل', en: 'Email' },
  description: { fa: 'توضیحات', en: 'Description' },
  saveChanges: { fa: 'ذخیره تغییرات', en: 'Save Changes' },

  // هوش مصنوعی
  aiService: { fa: 'سرویس هوش مصنوعی', en: 'AI Service' },
  aiServiceHint: {
    fa: 'برای مشتری فقط شمارهٔ مدل (۱ تا ۴) نمایش داده می‌شود. نام واقعی سرویس فقط اینجا برای شماست.',
    en: 'Clients only see the model number (1–4). The real service name is shown here for you only.',
  },
  publicModelBadge: { fa: 'نمایش عمومی:', en: 'Client-facing label:' },
  specialistOnlyHint: {
    fa: 'نام زیر فقط برای متخصص — در صفحهٔ تحلیل دیده نمی‌شود.',
    en: 'Name below is specialist-only — hidden on the analysis screen.',
  },
  getFreeKey: { fa: 'دریافت کلید API رایگان ↗', en: 'Get a free API key ↗' },
  providerType: { fa: 'نوع سرویس', en: 'Provider Type' },
  openaiCompatible: { fa: 'سازگار با OpenAI (هر سرویسی)', en: 'OpenAI-compatible (any service)' },
  providerHint: {
    fa: 'حالت «سازگار با OpenAI» تقریباً با همهٔ سرویس‌های هوش مصنوعیِ امروزی کار می‌کند: OpenRouter، Groq، Together، DeepSeek، خودِ OpenAI، و حتی مدل‌های محلی مثل Ollama یا LM Studio.',
    en: 'The "OpenAI-compatible" mode works with nearly every modern AI service: OpenRouter, Groq, Together, DeepSeek, OpenAI itself, and even local models like Ollama or LM Studio.',
  },
  apiKey: { fa: 'کلید API', en: 'API Key' },
  apiKeyConfigured: { fa: 'کلید ذخیره شده است. برای تغییر، کلید جدید وارد کنید.', en: 'A key is saved. Enter a new key to replace it.' },
  insecureKeyStorageWarning: {
    fa: 'هشدار: ذخیره‌سازی امن (رمزنگاری سیستم‌عامل) در دسترس نیست؛ کلید API به‌صورت رمزنگاری‌نشده روی دیسک ذخیره می‌شود.',
    en: 'Warning: secure storage (OS encryption) is unavailable; the API key will be stored unencrypted on disk.',
  },
  modelName: { fa: 'نام مدل', en: 'Model Name' },
  baseUrl: { fa: 'آدرس API (Base URL)', en: 'Base URL' },
  baseUrlHintGemini: { fa: 'پیش‌فرض: Google Gemini 2.0 Flash', en: 'Default: Google Gemini 2.0 Flash' },
  baseUrlHintOpenAI: {
    fa: 'فقط ریشهٔ API را وارد کنید؛ مسیر /chat/completions خودکار اضافه می‌شود.',
    en: 'Enter just the API root; /chat/completions is appended automatically.',
  },
  ownProxy: { fa: 'پراکسی اختصاصی (اختیاری، فقط نسخهٔ وب)', en: 'Your own proxy (optional, web version only)' },
  ownProxyPlaceholder: { fa: 'مثلاً یک Cloudflare Worker شخصی خودتان', en: 'e.g. your own Cloudflare Worker' },
  proxyPrivacyWarning: {
    fa: 'هشدار حریم خصوصی: هر پراکسی‌ای که اینجا وارد کنید، تصویر مراجع و کلید API از آن عبور می‌کند. فقط پراکسیِ خودتان (یا سرویسی که کاملاً به آن اعتماد دارید) را وارد کنید — هیچ پراکسی عمومی به‌طور پیش‌فرض استفاده نمی‌شود. در نسخهٔ دسکتاپ اصلاً نیازی به این فیلد نیست چون از پروکسی سیستم (تب «پروکسی») به‌صورت امن و رمزنگاری‌شده استفاده می‌شود.',
    en: "Privacy warning: any proxy you enter here will see the client's image and your API key pass through it. Only enter a proxy you personally trust — no public proxy is used by default. The desktop app doesn't need this field at all since it uses the encrypted system proxy from the \"Proxy\" tab.",
  },
  confidenceThreshold: { fa: 'آستانه اطمینان', en: 'Confidence Threshold' },
  includeMedicalDataInAi: {
    fa: 'ارسال دادهٔ پزشکی به هوش مصنوعی ابری',
    en: 'Send medical questionnaire data to cloud AI',
  },
  includeMedicalDataInAiHint: {
    fa: 'اگر فعال باشد، سن، جنسیت، پرسشنامه پزشکی و خلاصهٔ تغییرات نسبت به مراجعه قبل همراه تصویر به سرویس AI ارسال می‌شود. بدون این گزینه فقط تصویر و ناحیه/لنز ارسال می‌شود.',
    en: 'When enabled, age, gender, the medical questionnaire and change summary are sent with the image to the AI provider. When disabled, only the image plus region/lens context are sent.',
  },
  includeMedicalDataInAiWarning: {
    fa: 'هشدار حریم خصوصی: با فعال‌سازی، داده‌های پزشکی مراجع از دستگاه شما خارج و به ارائه‌دهندهٔ AI ارسال می‌شود. فقط در صورت رضایت آگاهانه فعال کنید.',
    en: 'Privacy warning: enabling this sends the client’s medical questionnaire off-device to your AI provider. Enable only with informed consent.',
  },
  internetStatus: { fa: 'وضعیت اتصال اینترنت:', en: 'Internet Connection Status:' },
  recheck: { fa: 'بررسی مجدد', en: 'Recheck' },
  checking: { fa: 'در حال بررسی...', en: 'Checking...' },
  vpnConnected: { fa: 'متصل (فیلتر شکن فعال)', en: 'Connected (VPN Active)' },
  vpnDisconnected: { fa: 'قطع شده (فیلتر شکن خاموش)', en: 'Disconnected (VPN Off)' },
  vpnHintElectron: { fa: 'در تب «پروکسی» یک پروکسی سیستم تنظیم کنید', en: 'Set a system proxy in the "Proxy" tab' },
  vpnHintWeb: {
    fa: 'فیلتر شکن خود را روشن کنید یا در بالا یک پراکسی شخصی وارد کنید',
    en: 'Enable your VPN or enter a personal proxy above',
  },
  testApiConnection: { fa: 'تست اتصال API', en: 'Test API Connection' },
  enterKeyFirst: { fa: 'ابتدا کلید API را وارد کنید', en: 'Enter an API key first' },
  unknownError: { fa: 'خطای ناشناخته', en: 'Unknown error' },
  apiConnected: { fa: 'اتصال موفق - API آماده استفاده است', en: 'Connected - API is ready' },
  apiFailed: { fa: 'خطا در اتصال API', en: 'API Connection Failed' },
  possibleCauses: { fa: 'احتمالی علل:', en: 'Possible causes:' },
  causeInvalidKey: { fa: 'کلید API نامعتبر یا منقضی شده', en: 'Invalid or expired API key' },
  causeRateLimit: { fa: 'محدودیت نرخ API (429) - Quota تمام شده', en: 'API rate limit exceeded - Quota exhausted' },
  causeWrongUrl: { fa: 'آدرس Base URL یا نام مدل اشتباه است', en: 'Wrong Base URL or model name' },
  causeVpnElectron: {
    fa: 'فیلتر شکن/پروکسی سیستم خاموش یا قطع شده',
    en: 'System VPN/proxy is disabled or disconnected',
  },
  causeVpnWeb: {
    fa: 'در وب و بدون پراکسی، سرویس ممکن است در دسترس نباشد (فیلترینگ)',
    en: 'In the browser without a proxy, the service may be unreachable (filtering)',
  },
  causeOpenRouterSecurity: {
    fa: 'OpenRouter: فیلترشکن را روشن کنید، هدرها را چک کنید، و مدل رایگان (:free) انتخاب کنید',
    en: 'OpenRouter: enable VPN, check headers, and use a free (:free) model',
  },
  openRouterGuideTitle: { fa: 'راهنمای OpenRouter:', en: 'OpenRouter setup tips:' },
  openRouterStep1: {
    fa: '۱) کارت «OpenRouter (مدل‌های رایگان :free)» را انتخاب کنید',
    en: '1) Select the "OpenRouter (free :free models)" card',
  },
  openRouterStep2: {
    fa: '۲) کلید sk-or-v1-... را وارد کنید (کلید فاش‌شده را revoke و کلید جدید بسازید)',
    en: '2) Paste your sk-or-v1-... key (revoke any exposed key and create a new one)',
  },
  openRouterStep3: {
    fa: '۳) مدل را روی openrouter/free بگذارید (روتر رایگان رسمی؛ مدل‌های تکی :free ممکن است حذف شوند)',
    en: '3) Set model to openrouter/free (official free router; specific :free models may disappear)',
  },
  openRouterStep4: {
    fa: '۴) فیلترشکن/پروکسی سیستم را روشن کنید، سپس دوباره تست اتصال بزنید',
    en: '4) Turn on system VPN/proxy, then test connection again',
  },
  openRouterNote: {
    fa: 'مدل openai/gpt-4o پولی است. اگر خطای «No endpoints found» دیدید، مدل را به openrouter/free تغییر دهید.',
    en: 'openai/gpt-4o is paid. If you see "No endpoints found", switch the model to openrouter/free.',
  },
  quotaGuideTitle: { fa: 'راهنمای افزایش Quota API:', en: 'How to Increase API Quota:' },
  quotaStep1Title: { fa: 'ورود به Google AI Studio:', en: 'Visit Google AI Studio:' },
  quotaStep2Title: { fa: 'فعال‌سازی Billing:', en: 'Enable Billing:' },
  quotaStep2Body: {
    fa: 'به Google Cloud Console > Billing بروید و حساب خود را فعال کنید',
    en: 'Go to Google Cloud Console > Billing and enable billing',
  },
  quotaStep3Title: { fa: 'دریافت API Key جدید:', en: 'Get New API Key:' },
  quotaStep3Body: {
    fa: 'در AI Studio، API Key جدید با Quota بالاتر بسازید',
    en: 'Create a new API key with higher quota in AI Studio',
  },
  quotaStep4Title: { fa: 'API Key را جایگزین کنید:', en: 'Replace API Key:' },
  quotaStep4Body: { fa: 'کلید جدید را در همین صفحه وارد کنید', en: 'Enter the new key in this page' },
  note: { fa: 'توجه:', en: 'Note:' },
  quotaNote: {
    fa: 'Free tier محدود است. برای استفاده تجاری، حتماً billing را فعال کنید یا از OpenRouter/Groq در حالت سفارشی استفاده کنید.',
    en: 'Free tier is limited. For commercial use, enable billing or use OpenRouter/Groq in Custom mode.',
  },
} satisfies Dict;

export type SettingsKey = keyof typeof settingsDict;
