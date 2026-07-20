import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
