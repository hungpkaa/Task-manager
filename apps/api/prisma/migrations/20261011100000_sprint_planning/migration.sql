CREATE TYPE "SprintStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');
CREATE TABLE "sprints" (
  "id" UUID NOT NULL PRIMARY KEY,
  "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "status" "SprintStatus" NOT NULL DEFAULT 'PLANNED',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "sprints_date_range_check" CHECK ("end_date" >= "start_date"),
  CONSTRAINT "sprints_name_goal_check" CHECK (length(trim("name")) BETWEEN 1 AND 100 AND length(trim("goal")) BETWEEN 1 AND 2000)
);
CREATE UNIQUE INDEX "sprints_id_project_id_key" ON "sprints"("id", "project_id");
CREATE INDEX "sprints_project_id_start_date_idx" ON "sprints"("project_id", "start_date");
CREATE UNIQUE INDEX "sprints_one_active_per_project" ON "sprints"("project_id") WHERE "status" = 'ACTIVE';
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_sprint_not_available_check";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sprint_id_project_id_fkey" FOREIGN KEY ("sprint_id", "project_id") REFERENCES "sprints"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "tasks_project_id_sprint_id_idx" ON "tasks"("project_id", "sprint_id");
