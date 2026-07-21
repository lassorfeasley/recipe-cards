import type { Metadata } from "next";
import { Geist, Geist_Mono, Playwrite_DE_VA } from "next/font/google";
import "./globals.css";
import { getSiteUrl } from "@/lib/og";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Handwriting face for the recipe-card typography. Playwrite DE VA ships no
// named subsets, so next/font exposes neither `subsets` nor `preload` for it
// (preloading is handled automatically); it loads on demand via `display: swap`.
const playwriteCard = Playwrite_DE_VA({
  variable: "--font-card",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Feasley's Recipes",
    template: "%s — Feasley's Recipes",
  },
  description:
    "A family archive of handwritten recipe cards, lovingly digitized.",
  openGraph: {
    type: "website",
    siteName: "Feasley's Recipes",
    title: "Feasley's Recipes",
    description:
      "A family archive of handwritten recipe cards, lovingly digitized.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Feasley's Recipes",
    description:
      "A family archive of handwritten recipe cards, lovingly digitized.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playwriteCard.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
