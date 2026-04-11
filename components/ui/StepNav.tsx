"use client";

import { useTranslations } from "next-intl";
import { useProject } from "@/context/ProjectContext";
import { Step, STEP_INDEX } from "@/lib/types";
import { useRouter, usePathname } from "next/navigation";

type NavItem = {
  step: Step;
  icon: React.ReactNode;
  labelKey: "wall" | "art" | "crop" | "place" | "render";
};

const WallIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="square">
    <rect x="3" y="3" width="18" height="18" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="3" x2="9" y2="9" />
    <line x1="15" y1="9" x2="15" y2="15" />
    <line x1="9" y1="15" x2="9" y2="21" />
  </svg>
);

const ArtIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="square">
    <rect x="4" y="4" width="16" height="16" />
    <line x1="4" y1="8" x2="20" y2="8" />
  </svg>
);

const CropIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="square">
    <polyline points="6 3 6 18 21 18" />
    <polyline points="3 6 18 6 18 21" />
  </svg>
);

const PlaceIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="square">
    <rect x="3" y="3" width="18" height="18" />
    <rect x="7" y="7" width="10" height="10" />
  </svg>
);

const RenderIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="square">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const NAV_ITEMS: NavItem[] = [
  { step: "wall", icon: <WallIcon />, labelKey: "wall" },
  { step: "painting", icon: <ArtIcon />, labelKey: "art" },
  { step: "crop", icon: <CropIcon />, labelKey: "crop" },
  { step: "placement", icon: <PlaceIcon />, labelKey: "place" },
  { step: "render", icon: <RenderIcon />, labelKey: "render" },
];

export default function StepNav() {
  const t = useTranslations("nav");
  const { currentStep, maxReachedStep, goToStep } = useProject();
  const router = useRouter();
  const pathname = usePathname();

  const handleLangSwitch = () => {
    const isEn = pathname.startsWith("/en");
    const newLocale = isEn ? "pt" : "en";
    const newPath = pathname.replace(/^\/(en|pt)/, `/${newLocale}`);
    router.push(newPath);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-2"
      style={{
        backgroundColor: "rgba(249,249,246,0.85)",
        backdropFilter: "blur(20px)",
        borderTop: "none",
        height: "64px",
      }}
    >
      {NAV_ITEMS.map(({ step, icon, labelKey }) => {
        const isActive = currentStep === step;
        const isReachable = STEP_INDEX[step] <= STEP_INDEX[maxReachedStep];

        return (
          <button
            key={step}
            onClick={() => isReachable && goToStep(step)}
            disabled={!isReachable}
            className="flex flex-col items-center gap-1 flex-1 py-2 transition-opacity"
            style={{
              color: isActive
                ? "var(--primary)"
                : isReachable
                ? "var(--on-surface-variant)"
                : "var(--outline-variant)",
              opacity: isReachable ? 1 : 0.4,
              cursor: isReachable ? "pointer" : "default",
            }}
          >
            {icon}
            <span className="text-[10px] font-medium tracking-widest uppercase">
              {t(labelKey)}
            </span>
          </button>
        );
      })}

      <button
        onClick={handleLangSwitch}
        className="flex flex-col items-center gap-1 flex-1 py-2"
        style={{ color: "var(--on-surface-variant)" }}
      >
        <span className="text-[11px] font-medium tracking-widest uppercase">
          {t("switchLang")}
        </span>
      </button>
    </nav>
  );
}
