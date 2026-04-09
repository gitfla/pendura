"use client";

import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { useProject } from "@/context/ProjectContext";

export default function SiteHeader() {
  const t = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();
  const { persistForLocaleSwitch } = useProject();

  const handleLangSwitch = async () => {
    await persistForLocaleSwitch();
    const isEn = pathname.startsWith("/en");
    const newLocale = isEn ? "pt" : "en";
    const newPath = pathname.replace(/^\/(en|pt)/, `/${newLocale}`);
    router.push(newPath);
  };

  return (
    <header
      className="w-full flex items-center justify-between px-6 py-5"
      style={{ backgroundColor: "var(--surface)" }}
    >
      <div className="flex items-end select-none pointer-events-none" style={{ gap: "0.05em", alignSelf: "flex-end" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon-96x96.png" alt="" style={{ height: "2.5rem", width: "auto", display: "block", filter: "brightness(0) saturate(100%) invert(37%) sepia(18%) saturate(624%) hue-rotate(169deg) brightness(92%) contrast(90%)" }} />
        <span
          className="font-serif leading-none"
          style={{ color: "var(--primary)", letterSpacing: "0.3em", fontSize: "2rem" }}
        >
          ENDURA
        </span>
      </div>
      <button
        onClick={handleLangSwitch}
        className="w-10 text-right text-[11px] font-medium tracking-widest uppercase leading-none self-center"
        style={{ color: "var(--on-surface-variant)" }}
      >
        {t("switchLang")}
      </button>
    </header>
  );
}
