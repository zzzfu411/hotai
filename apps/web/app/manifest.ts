import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hot AI Signal Desk",
    short_name: "Hot AI",
    description: "每日 AI 新闻、研究与开源信号。",
    start_url: "/",
    display: "standalone",
    background_color: "#f3eedf",
    theme_color: "#ffd60a",
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
