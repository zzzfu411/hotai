-- AlterTable: reading guides ("食用指南") for curated blogs
ALTER TABLE "CuratedBlog" ADD COLUMN "guideCadenceEn" TEXT;
ALTER TABLE "CuratedBlog" ADD COLUMN "guideCadenceZh" TEXT;
ALTER TABLE "CuratedBlog" ADD COLUMN "guideHowEn" TEXT;
ALTER TABLE "CuratedBlog" ADD COLUMN "guideHowZh" TEXT;
ALTER TABLE "CuratedBlog" ADD COLUMN "guideTimelineEn" TEXT;
ALTER TABLE "CuratedBlog" ADD COLUMN "guideTimelineZh" TEXT;
ALTER TABLE "CuratedBlog" ADD COLUMN "guideStartHere" JSONB;
