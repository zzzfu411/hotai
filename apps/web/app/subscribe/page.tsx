import type { Metadata } from "next";
import { SubscribeClient } from "@/components/SubscribeClient";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
  title: "我的阅读与订阅",
  description: "本机稍后读、已读记录与 RSS / Atom / JSON Feed、OPML 订阅。",
};

export default function SubscribePage() {
  return <SubscribeClient />;
}
