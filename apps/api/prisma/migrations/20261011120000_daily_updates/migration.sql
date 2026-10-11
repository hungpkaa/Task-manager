CREATE TABLE "daily_updates" (
 "id" UUID PRIMARY KEY, "sprint_id" UUID NOT NULL REFERENCES "sprints"("id") ON DELETE CASCADE,
 "author_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
 "progress" TEXT NOT NULL CHECK (length(trim("progress")) BETWEEN 1 AND 2000),
 "next_plan" TEXT NOT NULL CHECK (length(trim("next_plan")) BETWEEN 1 AND 2000),
 "blockers" TEXT NOT NULL DEFAULT '' CHECK (length("blockers") <= 2000),
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "daily_updates_sprint_id_created_at_id_idx" ON "daily_updates"("sprint_id", "created_at", "id");
