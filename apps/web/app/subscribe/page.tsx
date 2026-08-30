import type { Metadata } from "next";
import { SubscribeClient } from "@/components/SubscribeClient";

export const metadata: Metadata = {
  title: "我的订阅",
  description: "本机自定义 RSS / Atom / JSON Feed 与 OPML。只存在浏览器里，不影响全站热榜。",
};

export default function SubscribePage() {
  return <SubscribeClient />;
}
