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
      className="w-full flex items-center justify-between px-4 py-5"
      style={{ backgroundColor: "var(--surface)" }}
    >
      <div className="w-10" />
      <span
        className="font-serif select-none pointer-events-none leading-none"
        style={{ color: "var(--primary)", letterSpacing: "0.45em", fontSize: "2rem" }}
      >
        PENDURA
      </span>
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
