CREATE TABLE "task_attachments" (
  "id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "uploaded_by" UUID NOT NULL,
  "filename" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_attachments_size_check" CHECK ("size_bytes" BETWEEN 1 AND 10485760 AND octet_length("data") = "size_bytes"),
  CONSTRAINT "task_attachments_filename_check" CHECK (length("filename") BETWEEN 1 AND 255)
);
CREATE INDEX "task_attachments_task_id_created_at_idx" ON "task_attachments"("task_id", "created_at");
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
