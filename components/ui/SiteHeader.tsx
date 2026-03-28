"use client";

export default function SiteHeader() {
  return (
    <header
      className="w-full flex items-center justify-center py-5"
      style={{ backgroundColor: "var(--surface)" }}
    >
      <span
        className="font-serif select-none"
        style={{ color: "var(--primary)", letterSpacing: "0.45em", fontSize: "2rem" }}
      >
        PENDURA
      </span>
    </header>
  );
}
