import { toast } from 'sonner';

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** CRUD با toast خطا — الگوی مشترک فروشگاه‌های Zustand */
export async function withToastMutation<T>(failLabel: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    toast.error(`${failLabel}: ${errorMessage(err)}`);
    throw err;
  }
}

export function prependItem<T>(list: T[], item: T): T[] {
  return [item, ...list];
}

export function replaceById<T extends { id: string }>(list: T[], id: string, item: T): T[] {
  return list.map(x => (x.id === id ? item : x));
}

export function removeById<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter(x => x.id !== id);
}
