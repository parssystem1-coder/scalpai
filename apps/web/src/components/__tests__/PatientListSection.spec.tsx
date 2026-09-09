// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PatientListSection from "../sections/PatientListSection.js";
import { SAMPLE_PATIENTS } from "../../data/dashboard-samples.js";
import { faNum } from "../../i18n.js";

afterEach(cleanup);

const selected = SAMPLE_PATIENTS[0]!;

describe("PatientListSection (Phase 5 i18n)", () => {
  it("renders the translated header, search field and roster", () => {
    render(<PatientListSection patients={SAMPLE_PATIENTS} selectedPatient={selected} />);

    expect(screen.getByText("بخش ۱ از ۴")).toBeDefined();
    expect(screen.getByText("پرونده‌های تریکولوژی")).toBeDefined();
    expect(screen.getByPlaceholderText("جستجوی بیماران...")).toBeDefined();
    expect(screen.getByText("افزودن بیمار جدید")).toBeDefined();
    expect(
      screen.getByText(`${selected.firstName} ${selected.lastName}`)
    ).toBeDefined();
  });

  it("shows the empty state when the search matches nobody", () => {
    render(<PatientListSection patients={SAMPLE_PATIENTS} selectedPatient={selected} />);

    expect(screen.queryByText("بیماری یافت نشد")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("جستجوی بیماران..."), {
      target: { value: "zzzz-no-such-patient" },
    });

    expect(screen.getByText("بیماری یافت نشد")).toBeDefined();
  });

  it("shapes the telemetry gauges with Persian digits", () => {
    render(<PatientListSection patients={SAMPLE_PATIENTS} selectedPatient={selected} />);

    expect(screen.getByText("TELEMETRY MATRIX")).toBeDefined();
    expect(screen.getByText(faNum(selected.hairDensity || 148))).toBeDefined();
    expect(screen.getByText(`${faNum(selected.anagenRatio || 86)}٪`)).toBeDefined();
  });

  it("passes translated radar labels and the patient name to the radar chart", () => {
    render(<PatientListSection patients={SAMPLE_PATIENTS} selectedPatient={selected} />);

    expect(
      screen.getByText(`پروفایل هوشمند: ${selected.firstName} ${selected.lastName}`)
    ).toBeDefined();
    // The radar renders each axis as "<label> (<value>%)".
    expect(screen.getByText(/تراکم تار/)).toBeDefined();
    expect(screen.getByText(/حیات سلول‌های بنیادی/)).toBeDefined();
  });

  it("delegates selection, creation and navigation to the parent", () => {
    const onSelectPatient = vi.fn();
    const onAddPatient = vi.fn();
    const onNavigate = vi.fn();

    render(
      <PatientListSection
        patients={SAMPLE_PATIENTS}
        selectedPatient={selected}
        onSelectPatient={onSelectPatient}
        onAddPatient={onAddPatient}
        onNavigate={onNavigate}
      />
    );

    fireEvent.click(screen.getByText("افزودن بیمار جدید"));
    expect(onAddPatient).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(`${selected.firstName} ${selected.lastName}`));
    expect(onSelectPatient).toHaveBeenCalledWith(selected.id);

    fireEvent.click(screen.getByText("ورود به ویژن تریکوسکوپ 4K (بخش ۲)"));
    expect(onNavigate).toHaveBeenCalledWith("gallery");

    fireEvent.click(screen.getByText("مشاهده شبیه‌ساز ۳ بعدی ساقه مو (بخش ۴)"));
    expect(onNavigate).toHaveBeenCalledWith("3d-model");
  });
});
