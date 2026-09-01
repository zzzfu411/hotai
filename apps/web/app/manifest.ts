import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LAMDA AI Briefing",
    short_name: "LAMDA Briefing",
    description: "给 Ria 的私有 AI 研究简报。",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f0e8",
    theme_color: "#f4f0e8",
    lang: "zh-CN",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
