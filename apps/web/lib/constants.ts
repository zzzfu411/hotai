export const CATEGORIES = [
  { slug: "research",   label_en: "Research",   label_zh: "研究" },
  { slug: "industry",   label_en: "Industry",   label_zh: "产业" },
  { slug: "opensource", label_en: "Open Source", label_zh: "开源" },
  { slug: "media",      label_en: "Media",      label_zh: "媒体" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export const SITE = {
  name: "Hot AI",
  tagline_en: "The pulse of AI, every hour.",
  tagline_zh: "每小时,一份 AI 脉搏。",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://hotai.example.com",
};
