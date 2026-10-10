CREATE TABLE "comments" (
  "id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "comments_body_check" CHECK (length(trim("body")) BETWEEN 1 AND 5000)
);
CREATE TABLE "comment_mentions" (
  "comment_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  CONSTRAINT "comment_mentions_pkey" PRIMARY KEY ("comment_id", "user_id")
);
CREATE INDEX "comments_task_id_created_at_idx" ON "comments"("task_id", "created_at");
CREATE INDEX "comment_mentions_user_id_idx" ON "comment_mentions"("user_id");
ALTER TABLE "comments" ADD CONSTRAINT "comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
