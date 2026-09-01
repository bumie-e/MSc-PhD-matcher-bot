import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "MSc–PhD Matcher",
  description: "Find and rank graduate opportunities matched to your CV.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
