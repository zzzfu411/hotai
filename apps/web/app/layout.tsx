import "./globals.css";
import type { Metadata, Viewport } from "next";
import { SITE } from "@/lib/constants";
import { AppShell } from "@/components/AppShell";
import { LangProvider } from "@/components/LangContext";
import { ThemeNoFlashScript } from "@/components/ThemeToggle";

const GOOGLE_FONTS =
  "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;0,9..40,900&family=JetBrains+Mono:wght@400;500;700&family=Noto+Serif+SC:wght@400;600;700&display=swap";

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} — ${SITE.tagline_zh}`,
    template: `%s · ${SITE.name}`,
  },
  description: "每日 AI 新闻、研究与开源热度榜 — 按热度排序，Claude 摘要。",
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
    description: SITE.tagline_zh,
    url: SITE.url,
    siteName: SITE.name,
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.name,
    description: SITE.tagline_zh,
    images: ["/og.png"],
  },
  alternates: {
    types: { "application/rss+xml": `${SITE.url}/feed.xml` },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#facc15" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <head>
        <ThemeNoFlashScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={GOOGLE_FONTS} media="print" data-kz-fonts="1" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function arm(l){l.onload=function(){l.media='all'};if(l.sheet)l.media='all'}document.querySelectorAll('link[data-kz-fonts]').forEach(arm);})();`,
          }}
        />
        <noscript>
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
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
