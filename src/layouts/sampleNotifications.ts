export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
}

/** اعلان‌های نمونهٔ UI تا سیستم اعلان واقعی وصل شود */
export const sampleNotifications: AppNotification[] = [
  {
    id: '1',
    title: 'جلسه جدید',
    message: 'یک جلسه جدید برای فردا برنامه‌ریزی شده است',
    type: 'info',
    read: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    title: 'تحلیل کامل شد',
    message: 'تحلیل هوش مصنوعی با موفقیت انجام شد',
    type: 'success',
    read: false,
    createdAt: new Date().toISOString(),
  },
];
