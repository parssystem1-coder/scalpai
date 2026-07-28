/**
 * اعلان ماژول برای فایل‌های CommonJS الکترون و better-sqlite3.
 *
 * چرا لازم است: تست‌های واحد (vitest) هندلرهای واقعی main process را
 * (electron/*.cjs) مستقیماً روی Node اجرا می‌کنند — همان قراردادی که
 * scripts/test-db-contract.cjs هم با آن کار می‌کند. این فایل‌ها عمداً JS
 * هستند تا بدون build در Electron اجرا شوند، پس tsc برایشان تایپ ندارد.
 * این اعلان‌ها فقط دامنهٔ تست را پوشش می‌دهند و خروجی production را
 * تغییر نمی‌دهند (فایل d.ts است و emit نمی‌شود).
 */
declare module '*.cjs';
declare module 'better-sqlite3';
