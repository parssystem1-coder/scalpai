import React from "react";

export interface FeatureErrorBoundaryProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  resetLabel?: string;
  onRetry?: () => void;
}

interface FeatureErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/** Isolates lazy or optional feature failures from the rest of the application. */
export class FeatureErrorBoundary extends React.Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  override state: FeatureErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): FeatureErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    if (import.meta.env.DEV) console.error("Feature boundary caught an error", error, info.componentStack);
  }

  private retry = () => {
    if (this.props.onRetry) {
      this.props.onRetry();
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  override render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <section
        role="alert"
        className="min-h-[180px] grid place-items-center rounded-3xl border border-rose-200 bg-rose-50/80 p-8 text-center"
      >
        <div className="max-w-md space-y-3">
          <h2 className="text-sm font-bold text-rose-900">{this.props.title ?? "بارگذاری این بخش ناموفق بود"}</h2>
          <p className="text-xs leading-6 text-rose-800">
            {this.props.description ?? "می‌توانید دوباره تلاش کنید یا ادامه‌ی داشبورد را بدون این بخش ببینید."}
          </p>
          <button
            type="button"
            onClick={this.retry}
            className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-800"
          >
            {this.props.resetLabel ?? "تلاش دوباره"}
          </button>
        </div>
      </section>
    );
  }
}

export default FeatureErrorBoundary;
