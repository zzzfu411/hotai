import "./globals.css";
import "./signal.css";
import "./reading.css";
import type { Metadata, Viewport } from "next";
import { SITE } from "@/lib/constants";
import { AppShell } from "@/components/AppShell";
import { LangProvider } from "@/components/LangContext";
import { ThemeNoFlashScript } from "@/components/ThemeToggle";
import { serverLang } from "@/lib/server-lang";
import { ReadingProvider } from "@/components/ReadingList";

const GOOGLE_FONTS =
  "https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=Noto+Serif+SC:wght@500;700;900&display=swap";

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} — ${SITE.tagline_zh}`,
    template: `%s · ${SITE.name}`,
  },
  description: "多源实时速闻、AI 入库热榜、带引用的简报与本机阅读记录。",
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
    { media: "(prefers-color-scheme: light)", color: "#ffd60a" },
    { media: "(prefers-color-scheme: dark)", color: "#090b12" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await serverLang();
  return (
    <html lang={lang} suppressHydrationWarning>
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
        <LangProvider initialLang={lang}>
          <ReadingProvider><AppShell>{children}</AppShell></ReadingProvider>
        </LangProvider>
      </body>
    </html>
  );
}
