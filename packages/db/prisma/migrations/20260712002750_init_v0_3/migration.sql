-- CreateTable
CREATE TABLE "Source" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "homepage" TEXT,
    "type" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFetch" TIMESTAMP(3),
    "consecutiveFails" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleHash" TEXT NOT NULL,
    "summary" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lang" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "signals" JSONB,
    "raw" JSONB,
    "crossPosts" JSONB,
    "aiSummaryEn" TEXT,
    "aiSummaryZh" TEXT,
    "aiTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiSentiment" TEXT,
    "aiImportance" DOUBLE PRECISION,
    "aiAnalyzedAt" TIMESTAMP(3),
    "aiModel" TEXT,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Digest" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "headline" TEXT NOT NULL,
    "overview" TEXT NOT NULL,
    "bullets" JSONB NOT NULL,
    "themes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Digest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AskCache" (
    "id" SERIAL NOT NULL,
    "hash" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "model" TEXT,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AskCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_slug_key" ON "Source"("slug");

-- CreateIndex
CREATE INDEX "Source_category_enabled_idx" ON "Source"("category", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "Article_url_key" ON "Article"("url");

-- CreateIndex
CREATE UNIQUE INDEX "Article_urlHash_key" ON "Article"("urlHash");

-- CreateIndex
CREATE INDEX "Article_score_publishedAt_idx" ON "Article"("score" DESC, "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Article_category_score_idx" ON "Article"("category", "score" DESC);

-- CreateIndex
CREATE INDEX "Article_sourceId_publishedAt_idx" ON "Article"("sourceId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Article_publishedAt_idx" ON "Article"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Article_titleHash_idx" ON "Article"("titleHash");

-- CreateIndex
CREATE INDEX "Article_aiAnalyzedAt_idx" ON "Article"("aiAnalyzedAt");

-- CreateIndex
CREATE INDEX "Article_aiTopics_idx" ON "Article" USING GIN ("aiTopics" array_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Digest_date_key" ON "Digest"("date");

-- CreateIndex
CREATE INDEX "Digest_date_idx" ON "Digest"("date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AskCache_hash_key" ON "AskCache"("hash");

-- CreateIndex
CREATE INDEX "AskCache_createdAt_idx" ON "AskCache"("createdAt");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;
