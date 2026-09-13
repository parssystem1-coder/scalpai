import { useCallback, useEffect, useRef, useState } from "react";
import { SECTIONS, type SectionId } from "../components/dashboard-sections";

export interface DashboardNavigationState {
  activeSection: SectionId;
  showBackToTop: boolean;
  scrollToSection: (sectionId: SectionId) => void;
}

/** Owns dashboard navigation state without knowing patient or modal domains. */
export function useDashboardNavigation(): DashboardNavigationState {
  const [activeSection, setActiveSection] = useState<SectionId>("patients");
  const isManualScrolling = useRef(false);
  const releaseManualScrollTimer = useRef<number | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const scrollToSection = useCallback((sectionId: SectionId) => {
    setActiveSection(sectionId);
    isManualScrolling.current = true;
    const element = document.getElementById(`section-${sectionId}`);
    if (element) {
      const y = element.getBoundingClientRect().top + window.pageYOffset - 90;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
    if (releaseManualScrollTimer.current !== null) {
      window.clearTimeout(releaseManualScrollTimer.current);
    }
    releaseManualScrollTimer.current = window.setTimeout(() => {
      isManualScrolling.current = false;
      releaseManualScrollTimer.current = null;
    }, 850);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setShowBackToTop(scrollY > 350);
      if (isManualScrolling.current) return;

      const scrollPosition = scrollY + 160;
      for (let i = SECTIONS.length - 1; i >= 0; i -= 1) {
        const section = SECTIONS[i];
        if (!section) continue;
        const element = document.getElementById(`section-${section.id}`);
        if (element && element.offsetTop <= scrollPosition) {
          setActiveSection(section.id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (releaseManualScrollTimer.current !== null) {
        window.clearTimeout(releaseManualScrollTimer.current);
      }
    };
  }, []);

  return { activeSection, showBackToTop, scrollToSection };
}
