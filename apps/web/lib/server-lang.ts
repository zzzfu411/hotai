import { cookies } from "next/headers";
import { cache } from "react";

export const serverLang = cache(async (): Promise<"zh" | "en"> =>
  (await cookies()).get("hotai-lang")?.value === "en" ? "en" : "zh");
