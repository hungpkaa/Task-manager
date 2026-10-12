-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "closed_at" TIMESTAMPTZ(3);
