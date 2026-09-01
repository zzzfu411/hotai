-- Durable, cross-process reservations for the public AI ask endpoint.
CREATE TABLE "AskDailyUsage" (
  "day" DATE NOT NULL,
  "usedTokens" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AskDailyUsage_pkey" PRIMARY KEY ("day")
);

CREATE TABLE "AskReservation" (
  "id" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "reservedTokens" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AskReservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AskReservation_day_expiresAt_idx"
  ON "AskReservation"("day", "expiresAt");
CREATE INDEX "AskReservation_expiresAt_idx"
  ON "AskReservation"("expiresAt");

ALTER TABLE "AskReservation"
  ADD CONSTRAINT "AskReservation_day_fkey"
  FOREIGN KEY ("day") REFERENCES "AskDailyUsage"("day")
  ON DELETE CASCADE ON UPDATE CASCADE;
