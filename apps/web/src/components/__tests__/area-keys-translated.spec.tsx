// @vitest-environment jsdom
//
// Gate criterion 11 (docs/PHASE4-CLOSURE-GATE.md): "Area keys translated".
// The two surfaces that used to interpolate the RAW area enum — the gallery
// badge (TrichoscopyGallerySection) and the lightbox title (PhotoLightbox) —
// must compose the translated `galleryVision.areas.*` label into the phrase,
// in BOTH locales. The regression this guards is the RAW composition
// ("ناحیه: vertex" / "Area: vertex") reaching a Persian clinician; the
// translated labels themselves legitimately contain the Latin annotation
// ("تاج سر (Vertex)" / "Vertex"), so a case-insensitive enum grep would be
// wrong here — we assert the exact composed strings instead.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TrichoscopyGallerySection from "../sections/TrichoscopyGallerySection.js";
import PhotoLightbox from "../modals/PhotoLightbox.js";
import i18n from "../../i18n.js";
import type { Patient, TrichoscopyImage } from "../../data/dashboard-types.js";

const patient: Patient = {
  id: "p1",
  firstName: "Maryam",
  lastName: "Rezaei",
  phone: "09120000000",
};

const photo: TrichoscopyImage = {
  id: "img1",
  patientId: patient.id,
  url: "/trichoscopy/vertex.jpg",
  area: "vertex",
  date: "2026-09-21",
};

const noop = () => {};

function renderGallery() {
  return render(
    <TrichoscopyGallerySection
      selectedArea={photo.area}
      setSelectedArea={noop}
      activeInspectedPhoto={photo}
      setActiveInspectedPhoto={noop}
      patientPhotos={[photo]}
      uploadFeedback={null}
      setUploadFeedback={noop}
      isDraggingOver={false}
      dataMode="demo"
      fileInputRef={{ current: null } as React.RefObject<HTMLInputElement | null>}
      handleDrop={noop as never}
      handleDragOver={noop as never}
      handleDragLeave={noop as never}
      handleFileInputChange={noop as never}
      handleDeletePhoto={noop}
      handleOpenLightbox={noop}
      openGuidedCapture={noop}
      openBeforeAfter={noop}
      scrollToSection={noop}
      areaLabel={(area: string) => String(i18n.t(`dashboard.galleryVision.areas.${area}`))}
      selectedPatient={patient}
      localImages={{}}
      setCompareDefaultA={noop}
      setCompareDefaultB={noop}
    />,
  );
}

function renderLightbox() {
  return render(
    <PhotoLightbox
      previewPhotoModal={photo}
      selectedPatient={patient}
      photosByPatient={{ [patient.id]: [photo] }}
      onClose={noop}
      onDeletePhoto={noop}
      onCompare={noop}
      onInspectHud={noop}
      areaLabel={(area: string) => String(i18n.t(`dashboard.galleryVision.areas.${area}`))}
    />,
  );
}

afterEach(cleanup);

describe("gate criterion 11 — area keys compose the translated label", () => {
  const cases = [
    { lng: "fa" as const, surface: "ناحیه: " },
    { lng: "en" as const, surface: "Area: " },
  ];

  it.each(cases)("gallery badge composes the %s label, never the raw enum", async ({ lng, surface }) => {
    await i18n.changeLanguage(lng);
    renderGallery();

    const translated = String(i18n.t("dashboard.galleryVision.areas.vertex"));
    const label = String(i18n.t("dashboard.galleryVision.areaLabel", { area: translated }));
    // The composed label appears more than once (badge, HUD, drop hint), and
    // every occurrence must be the translated composition.
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain(`${surface}vertex`);
  });

  it.each(cases)("lightbox title composes the %s label, never the raw enum", async ({ lng, surface }) => {
    await i18n.changeLanguage(lng);
    renderLightbox();

    const translated = String(i18n.t("dashboard.galleryVision.areas.vertex"));
    const title = String(i18n.t("dashboard.lightbox.title", { area: translated }));
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain(`${surface}vertex`);
  });
});
