ALTER TABLE "comment_mentions" ADD COLUMN "notified_at" TIMESTAMPTZ(3);

UPDATE "comment_mentions" SET "notified_at" = now();
