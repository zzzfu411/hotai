import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __hotai_prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__hotai_prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__hotai_prisma = prisma;
}

export * from "@prisma/client";
