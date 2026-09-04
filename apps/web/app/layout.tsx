import "./globals.css";
import type { Metadata, Viewport } from "next";
import { SITE } from "@/lib/constants";
import { AppShell } from "@/components/AppShell";
import { LangProvider } from "@/components/LangContext";
import { ThemeNoFlashScript } from "@/components/ThemeToggle";

const GOOGLE_FONTS =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=Noto+Serif+SC:wght@500;700;900&display=swap";

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} — ${SITE.tagline_zh}`,
    template: `%s · ${SITE.name}`,
  },
  description: "给 Ria 的私有 LAMDA AI 研究简报。",
  metadataBase: new URL(SITE.url),
  manifest: "/manifest.webmanifest",
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
    description: SITE.tagline_zh,
    url: SITE.url,
    siteName: SITE.name,
    type: "website",
    images: ["/og-zh.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.name,
    description: SITE.tagline_zh,
    images: ["/og-zh.png"],
  },
  alternates: {
    types: { "application/rss+xml": `${SITE.url}/feed.xml` },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f0e8" },
    { media: "(prefers-color-scheme: dark)", color: "#171513" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <head>
        <ThemeNoFlashScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS} />
        <noscript>
          <link rel="stylesheet" href={GOOGLE_FONTS} />
        </noscript>
      </head>
      <body>
        <LangProvider>
          <AppShell>{children}</AppShell>
        </LangProvider>
      </body>
    </html>
  );
}
