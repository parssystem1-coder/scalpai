// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AnalyticsSection, { type AnalyticsData } from "../sections/AnalyticsSection.js";
import { faNum } from "../../i18n.js";

afterEach(cleanup);

const DATA: AnalyticsData = {
  scores: { redness: 22, flakeTexture: 26, densityProxy: 88 },
  severity: 24,
  anagenRatio: 87,
  hairCaliber: "76 µm",
  recommendation: "پروتکل آزمونی پپتیدی",
  matrixHydration: 92,
  tensorConfidence: 97.4,
  follicularUnits: { single: 24, double: 52, triple: 24 },
};

describe("AnalyticsSection (Phase 5 i18n)", () => {
  it("renders the translated badge, heading and patient-aware subtitle", () => {
    render(<AnalyticsSection data={DATA} patientName="مریم رضایی" />);

    expect(screen.getByText("بخش ۳ از ۴")).toBeDefined();
    expect(screen.getByText(/استودیوی آنالیز عمیق تریکولوژی/)).toBeDefined();
    expect(screen.getByText(/مریم رضایی/)).toBeDefined();
    expect(screen.getByLabelText("گزارشات و تحلیل‌ها")).toBeDefined();
  });

  it("renders the four metric dials with digit-shaped percentages", () => {
    render(<AnalyticsSection data={DATA} patientName="مریم رضایی" />);

    expect(screen.getByText("اریتم و التهاب پوست سر")).toBeDefined();
    expect(screen.getByText("تجمع سبوم و پوسته لایه شاخی")).toBeDefined();
    expect(screen.getByText("فاز رشد فعال (آناژن)")).toBeDefined();
    expect(screen.getByText("هیدراتاسیون ماتریکس مو")).toBeDefined();

    expect(screen.getByText(`${faNum(22)}%`)).toBeDefined();
    expect(screen.getByText(`${faNum(87)}%`)).toBeDefined();
    expect(screen.getByText(`${faNum(92)}٪`)).toBeDefined();
    expect(screen.getByText(`Tensor Confidence: ${faNum(97.4)}%`)).toBeDefined();
  });

  it("swaps the scan button copy while the engine is running", () => {
    const { unmount } = render(
      <AnalyticsSection data={DATA} patientName="مریم رضایی" isAnalyzing={false} />
    );
    expect(screen.getByText("اجرای مجدد اسکن AI")).toBeDefined();
    unmount();

    render(<AnalyticsSection data={DATA} patientName="مریم رضایی" isAnalyzing={true} />);
    expect(screen.getByText("پردازش ماتریس...")).toBeDefined();
    expect(screen.queryByText("اجرای مجدد اسکن AI")).toBeNull();
  });

  it("renders the AI protocol text and delegates all actions", () => {
    const onRunAnalysis = vi.fn();
    const onOpenEducation = vi.fn();
    const onOpenPdfReport = vi.fn();
    const onNavigate = vi.fn();

    render(
      <AnalyticsSection
        data={DATA}
        patientName="مریم رضایی"
        onRunAnalysis={onRunAnalysis}
        onOpenEducation={onOpenEducation}
        onOpenPdfReport={onOpenPdfReport}
        onNavigate={onNavigate}
      />
    );

    expect(screen.getByText("پروتکل آزمونی پپتیدی")).toBeDefined();

    fireEvent.click(screen.getByText("اجرای مجدد اسکن AI"));
    fireEvent.click(screen.getByText("شبیه‌ساز ۳ بعدی و توجیه بیمار"));
    fireEvent.click(screen.getByText("صدور نسخه و گزارش PDF"));
    fireEvent.click(screen.getByTitle("بازگشت به ابتدای پرونده"));

    expect(onRunAnalysis).toHaveBeenCalledTimes(1);
    expect(onOpenEducation).toHaveBeenCalledTimes(1);
    expect(onOpenPdfReport).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith("patients");
  });
});
