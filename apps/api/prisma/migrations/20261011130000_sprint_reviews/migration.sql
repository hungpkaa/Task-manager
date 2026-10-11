CREATE TABLE "sprint_reviews" (
  "id" UUID PRIMARY KEY,
  "sprint_id" UUID NOT NULL UNIQUE REFERENCES "sprints"("id") ON DELETE CASCADE,
  "author_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "summary" TEXT NOT NULL CHECK (length(trim("summary")) BETWEEN 1 AND 4000),
  "feedback" TEXT NOT NULL CHECK (length(trim("feedback")) BETWEEN 1 AND 4000),
  "done_count" INTEGER NOT NULL CHECK ("done_count" >= 0),
  "incomplete_count" INTEGER NOT NULL CHECK ("incomplete_count" >= 0),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);
