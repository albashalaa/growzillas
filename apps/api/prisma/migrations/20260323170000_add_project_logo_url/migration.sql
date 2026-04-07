-- Add persisted project logo URL for client branding
ALTER TABLE "Project"
ADD COLUMN "logoUrl" TEXT;
