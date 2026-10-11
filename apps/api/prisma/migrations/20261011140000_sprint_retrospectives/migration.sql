CREATE TABLE "sprint_retrospectives" (
  "id" UUID PRIMARY KEY,
  "sprint_id" UUID NOT NULL UNIQUE REFERENCES "sprints"("id") ON DELETE CASCADE,
  "author_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "went_well" TEXT NOT NULL CHECK (length(trim("went_well")) BETWEEN 1 AND 4000),
  "needs_improvement" TEXT NOT NULL CHECK (length(trim("needs_improvement")) BETWEEN 1 AND 4000),
  "action_items" TEXT NOT NULL CHECK (length(trim("action_items")) BETWEEN 1 AND 4000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);
