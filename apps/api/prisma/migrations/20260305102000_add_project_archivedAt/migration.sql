-- Add archivedAt column to Project for soft deletes
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP;

