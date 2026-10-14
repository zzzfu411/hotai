import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Archivo_Black, IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import { SITE } from "@/lib/constants";
import { AppShell } from "@/components/AppShell";
import { LangProvider } from "@/components/LangContext";
import { ThemeNoFlashScript } from "@/components/ThemeToggle";
import { serverLang } from "@/lib/server-lang";
import { ReadingProvider } from "@/components/ReadingList";

// Self-hosted at build time: no render-blocking request to Google, which is
// slow or unreachable for many readers in mainland China. CJK text uses the
// reader's system fonts — a web CJK face adds ~200 @font-face rules to every
// page's CSS for little gain.
const sans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-mono", display: "swap" });
const display = Archivo_Black({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });
// Reader prose: Latin text and punctuation come from Source Serif so English
// never picks up a CJK font's full-width quotes.
const serifLatin = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif-latin", display: "swap", preload: false });

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
    { media: "(prefers-color-scheme: light)", color: "#f4f0e6" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d14" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await serverLang();
  return (
    <html
      lang={lang}
      className={`${sans.variable} ${mono.variable} ${display.variable} ${serifLatin.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeNoFlashScript />
      </head>
      <body>
        <LangProvider initialLang={lang}>
          <ReadingProvider><AppShell>{children}</AppShell></ReadingProvider>
        </LangProvider>
      </body>
    </html>
  );
}
