-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "assignee_id" UUID,
    "sprint_id" UUID,
    "start_date" DATE,
    "due_date" DATE,
    "effort" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "task_id" UUID NOT NULL,
    "depends_on_task_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("task_id","depends_on_task_id")
);

-- CreateIndex
CREATE INDEX "tasks_project_id_status_idx" ON "tasks"("project_id", "status");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_status_idx" ON "tasks"("assignee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_id_project_id_key" ON "tasks"("id", "project_id");

-- CreateIndex
CREATE INDEX "task_dependencies_depends_on_task_id_project_id_idx" ON "task_dependencies"("depends_on_task_id", "project_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_project_id_fkey" FOREIGN KEY ("task_id", "project_id") REFERENCES "tasks"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_project_id_fkey" FOREIGN KEY ("depends_on_task_id", "project_id") REFERENCES "tasks"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Sprint linkage is enabled with its foreign key in step 9.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sprint_not_available_check" CHECK ("sprint_id" IS NULL);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_date_range_check" CHECK ("start_date" IS NULL OR "due_date" IS NULL OR "due_date" >= "start_date");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_effort_check" CHECK ("effort" IS NULL OR "effort" IN (1, 2, 3, 5, 8));
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_not_self_check" CHECK ("task_id" <> "depends_on_task_id");
