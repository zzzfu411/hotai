export const CATEGORIES = [
  { slug: "research",   label_en: "Research",   label_zh: "研究" },
  { slug: "industry",   label_en: "Industry",   label_zh: "产业" },
  { slug: "opensource", label_en: "Open Source", label_zh: "开源" },
  { slug: "media",      label_en: "Media",      label_zh: "媒体" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

/** Focus tags used on the curated /blogs directory (filter chips). */
export const BLOG_TAGS = [
  { slug: "llm",             label_en: "LLM",             label_zh: "大模型" },
  { slug: "research",        label_en: "Research",        label_zh: "研究" },
  { slug: "engineering",     label_en: "Engineering",     label_zh: "工程" },
  { slug: "interpretability",label_en: "Interpretability",label_zh: "可解释性" },
  { slug: "systems",         label_en: "Systems",         label_zh: "系统" },
  { slug: "alignment",       label_en: "Alignment",       label_zh: "对齐" },
  { slug: "tutorial",        label_en: "Tutorial",        label_zh: "教程" },
  { slug: "open-source",     label_en: "Open Source",     label_zh: "开源" },
  { slug: "agents",          label_en: "Agents",          label_zh: "智能体" },
  { slug: "chinese",         label_en: "Chinese",         label_zh: "中文" },
] as const;

export const SITE = {
  name: "Hot AI",
  tagline_en: "The pulse of AI, every hour.",
  tagline_zh: "每小时,一份 AI 脉搏。",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://hotai.yeuxark.com",
};
