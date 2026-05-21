import "./globals.css";
import type { Metadata, Viewport } from "next";
import { SITE } from "@/lib/constants";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LangProvider } from "@/components/LangContext";
import { ThemeNoFlashScript } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} — ${SITE.tagline_en}`,
    template: `%s · ${SITE.name}`,
  },
  description: "Daily AI news, research, and open-source releases — ranked by heat, summarised by Claude.",
  metadataBase: new URL(SITE.url),
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    title: SITE.name,
    description: SITE.tagline_en,
    url: SITE.url,
    siteName: SITE.name,
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.name,
    description: SITE.tagline_en,
    images: ["/og.png"],
  },
  alternates: {
    types: { "application/rss+xml": `${SITE.url}/feed.xml` },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)",  color: "#020617" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeNoFlashScript />
      </head>
      <body className="min-h-screen flex flex-col">
        <LangProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </LangProvider>
      </body>
    </html>
  );
}
