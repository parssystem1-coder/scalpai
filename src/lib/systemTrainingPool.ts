/**
 * systemTrainingPool.ts
 * -----------------------------------------------------------------------
 * ثابت‌ها/کمک‌تابع‌های مربوط به «کلاینت سیستمی استخر تصاویر آموزشی».
 *
 * چرا این کلاینت لازم است:
 *  - جدول gallery در SQLite قید `FOREIGN KEY(clientId) REFERENCES clients(id)`
 *    دارد و `PRAGMA foreign_keys = ON` است (electron/main.cjs)، پس
 *    addGalleryItem نمی‌تواند با یک clientId جعلی/ناموجود موفق شود.
 *  - «استخر تصاویر آموزشی» (تب یادگیری ماشین) نیاز به عکس‌هایی دارد که به
 *    هیچ مشتری واقعی تعلق ندارند — راه‌حل: یک ردیف ثابت و همیشگی در clients
 *    با id = SYSTEM_TRAINING_POOL_CLIENT_ID که isSystemRecord=true دارد و
 *    از فهرست/جستجوی مشتریان واقعی و از گالری عمومی همیشه فیلتر می‌شود
 *    (نگاه کنید به فیلترهای getClients/getClientsCount/getAllGallery/getGalleryCount
 *    در electron/db-handlers.cjs، electron/db-handlers-json.cjs و
 *    src/db/adapter-web.ts).
 *
 * منبع حقیقت معادل در سمت Electron: electron/db-common.cjs
 * (buildSystemTrainingPoolClientRecord / ensureSystemTrainingPoolClientSqlite).
 * هنگام تغییر این ثابت‌ها، هر دو فایل را هم‌راستا نگه دارید.
 */

import type { Client } from '../db/types';

export const SYSTEM_TRAINING_POOL_CLIENT_ID = 'system-training-pool';

/** آیا این id متعلق به کلاینت سیستمی استخر آموزشی است؟ */
export function isSystemTrainingPoolClientId(id: string | undefined | null): boolean {
  return id === SYSTEM_TRAINING_POOL_CLIENT_ID;
}

/** ساخت شیء کامل ردیف مشتری سیستمی — برای وب (localforage) و تست‌ها */
export function buildSystemTrainingPoolClientRecord(nowIso?: string): Client {
  const now = nowIso || new Date().toISOString();
  return {
    id: SYSTEM_TRAINING_POOL_CLIENT_ID,
    firstName: 'استخر آموزشی',
    lastName: '(سیستمی)',
    phone: '000',
    email: 'system@scalpai.local',
    gender: 'male',
    birthDate: '',
    notes: 'System-managed pool for shared ML training photos. Do not delete.',
    isSystemRecord: true,
    createdAt: now,
    updatedAt: now,
  };
}
