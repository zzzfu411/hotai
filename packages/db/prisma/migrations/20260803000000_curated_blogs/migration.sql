-- CreateTable
CREATE TABLE "CuratedBlog" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "feedUrl" TEXT,
    "affiliation" TEXT,
    "bioEn" TEXT NOT NULL,
    "bioZh" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lang" TEXT NOT NULL DEFAULT 'en',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuratedBlog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CuratedBlog_slug_key" ON "CuratedBlog"("slug");

-- CreateIndex
CREATE INDEX "CuratedBlog_enabled_sortOrder_idx" ON "CuratedBlog"("enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "CuratedBlog_featured_sortOrder_idx" ON "CuratedBlog"("featured", "sortOrder");

-- CreateIndex
CREATE INDEX "CuratedBlog_tags_idx" ON "CuratedBlog" USING GIN ("tags");
