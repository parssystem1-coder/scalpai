/** پیام سراسری بالای صفحهٔ تنظیمات — توسط shell نمایش داده و خودکار پاک می‌شود */
export type Notify = (type: 'success' | 'error', text: string) => void;
