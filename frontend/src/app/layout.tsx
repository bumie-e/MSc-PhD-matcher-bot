import type { Metadata } from "next";

import { Carlito } from "next/font/google";

import "./globals.css";

const carlito = Carlito({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-carlito", display: "swap" });

export const metadata: Metadata = {
  title: "MSc PhD Matcher",
  description: "Find and rank graduate opportunities matched to your CV.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={carlito.variable}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
