"use client";

import { useEffect } from "react";

type Props = {
  message: string;
  imageUrl?: string | null;
  onAdvance: () => void;
};

export default function StepCheckpoint({ message, onAdvance }: Props) {
  useEffect(() => {
    const timer = setTimeout(onAdvance, 2500);
    return () => clearTimeout(timer);
  }, [onAdvance]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-8 px-12"
      style={{ backgroundColor: "var(--surface)", zIndex: 40 }}
      onClick={onAdvance}
    >
      <style>{`
        @keyframes draw-check {
          from { stroke-dashoffset: 60; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes fade-circle {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .check-circle {
          animation: fade-circle 0.3s ease forwards;
        }
        .check-mark {
          stroke-dasharray: 60;
          stroke-dashoffset: 60;
          animation: draw-check 0.4s ease 0.25s forwards;
        }
      `}</style>

      <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
        <circle
          className="check-circle"
          cx="40" cy="40" r="37"
          stroke="var(--primary)"
          strokeWidth="2.5"
        />
        <polyline
          className="check-mark"
          points="20,40 33,54 57,26"
          stroke="var(--primary)"
          strokeWidth="5"
          strokeLinecap="square"
          strokeLinejoin="miter"
          fill="none"
        />
      </svg>

      <p
        className="text-xs tracking-widest uppercase text-center"
        style={{ color: "var(--on-surface-variant)", letterSpacing: "0.18em" }}
      >
        {message}
      </p>
    </div>
  );
}
