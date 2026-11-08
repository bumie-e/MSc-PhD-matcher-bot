import Link from "next/link";

/** Mortarboard mark: the cap is the degree, the tassel dot is the match. */
export function LogoMark({ size = 32, tone = "light" }: { size?: number; tone?: "light" | "dark" }) {
  // "light" = white tile for blue backgrounds, "dark" = blue tile for white backgrounds.
  const tile = tone === "light" ? "#ffffff" : "#1d4ed8";
  const ink = tone === "light" ? "#1d4ed8" : "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="8" fill={tile} />
      <path d="M16 7 27 12.5 16 18 5 12.5Z" fill={ink} />
      <path d="M10 16.4V21c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.6l-6 3Z" fill={ink} opacity="0.85" />
      <path d="M27 12.5V20" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="27" cy="22" r="1.9" fill={ink} />
    </svg>
  );
}

export function Logo({ tone = "light", className = "" }: { tone?: "light" | "dark"; className?: string }) {
  return (
    <Link href="/" aria-label="MSc PhD Matcher home" className={`inline-flex items-center gap-2.5 whitespace-nowrap font-bold ${className}`}>
      <LogoMark tone={tone} />
      <span>MSc PhD Matcher</span>
    </Link>
  );
}
