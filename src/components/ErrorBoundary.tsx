import React from 'react';

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return `${error.message}\n${error.stack || ''}`;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
};

interface ErrorBoundaryState {
  hasError: boolean;
  error: unknown;
  showDetails: boolean;
}

/**
 * قبلاً این باندری همیشه stack trace خام را مستقیم به کاربر نهایی
 * (مثلاً منشی/متخصص کلینیک) نشان می‌داد که برای یک اپلیکیشن پزشکیِ
 * مصرف‌کننده‌محور مناسب نیست. حالا پیش‌فرض یک پیام ساده و قابل‌فهم است،
 * با یک دکمهٔ اختیاری برای نمایش جزئیات فنی (برای پشتیبانی/توسعه‌دهنده)
 * و یک دکمهٔ بازنشانی که کل برنامه را از نو بارگذاری می‌کند.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode; isRtl?: boolean }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode; isRtl?: boolean }) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // برای اشکال‌زدایی توسعه‌دهنده در کنسول باقی می‌ماند، ولی به کاربر نمایش داده نمی‌شود مگر درخواست کند
    console.error('ErrorBoundary caught an error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isRtl = this.props.isRtl ?? true;
      return (
        <div className="min-h-[200px] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center space-y-4">
            <h2 className="text-red-400 font-semibold text-lg">
              {isRtl ? 'مشکلی پیش آمد' : 'Something went wrong'}
            </h2>
            <p className="text-sm opacity-70">
              {isRtl
                ? 'یک خطای غیرمنتظره رخ داد. می‌توانید صفحه را دوباره بارگذاری کنید.'
                : 'An unexpected error occurred. You can reload the page.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReload}
                className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm transition"
              >
                {isRtl ? 'بارگذاری مجدد' : 'Reload'}
              </button>
              <button
                onClick={() => this.setState(s => ({ ...s, showDetails: !s.showDetails }))}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm transition"
              >
                {isRtl ? (this.state.showDetails ? 'پنهان کردن جزئیات فنی' : 'نمایش جزئیات فنی') : (this.state.showDetails ? 'Hide technical details' : 'Show technical details')}
              </button>
            </div>
            {this.state.showDetails && (
              <pre className="mt-2 text-xs text-start whitespace-pre-wrap break-words opacity-60 bg-black/20 p-3 rounded-lg max-h-64 overflow-auto">
                {serializeError(this.state.error)}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
