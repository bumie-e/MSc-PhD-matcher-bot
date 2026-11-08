"use client";

import { useEffect, useState } from "react";

// The ring fills from empty on mount; the CSS transition does the animation.
export function ScoreRing({ score, size = 56, light = false }: { score: number; size?: number; light?: boolean }) {
  const [filled, setFilled] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(score));
    return () => cancelAnimationFrame(id);
  }, [score]);

  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Match score ${score} out of 100`}>
      <svg viewBox="0 0 52 52" className="-rotate-90" width={size} height={size} aria-hidden="true">
        <circle cx="26" cy="26" r={r} fill="none" stroke={light ? "rgba(255,255,255,0.3)" : "#dbe7ff"} strokeWidth="5" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke={light ? "#ffffff" : "#1d4ed8"}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(filled / 100) * c} ${c}`}
          style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.2, 0.7, 0.2, 1)" }}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-base font-bold ${light ? "text-white" : "text-black"}`}>{score}</span>
    </div>
  );
}
