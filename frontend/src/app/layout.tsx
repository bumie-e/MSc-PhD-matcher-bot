import type { Metadata } from "next";

import { Carlito } from "next/font/google";

import "./globals.css";

const carlito = Carlito({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-carlito", display: "swap" });

export const metadata: Metadata = {
  title: "MSc PhD Matcher",
  description: "Find and rank graduate opportunities matched to your CV.",
};

// GitHub Pages cannot set response headers, so the policy is a meta tag.
// Next's static export emits inline bootstrap scripts, hence 'unsafe-inline'
// for scripts (dev also needs 'unsafe-eval' for hot reload). Everything else
// is locked to this origin plus Supabase.
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} https://*.supabase.co${process.env.NODE_ENV === "production" ? "" : " ws://localhost:*"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={carlito.variable}>
      <head>
        <meta httpEquiv="Content-Security-Policy" content={csp} />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
