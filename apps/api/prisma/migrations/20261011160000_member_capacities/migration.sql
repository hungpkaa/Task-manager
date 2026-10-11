CREATE TABLE "member_capacities" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "capacity_points" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "member_capacities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "member_capacities_positive" CHECK ("capacity_points" > 0),
  CONSTRAINT "member_capacities_dates" CHECK ("period_end" >= "period_start"),
  CONSTRAINT "member_capacities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "member_capacities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "member_capacities_project_id_user_id_period_start_period_end_key" ON "member_capacities"("project_id", "user_id", "period_start", "period_end");
CREATE INDEX "member_capacities_project_id_period_start_period_end_idx" ON "member_capacities"("project_id", "period_start", "period_end");
