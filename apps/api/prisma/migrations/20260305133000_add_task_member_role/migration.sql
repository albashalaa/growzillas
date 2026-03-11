-- Add TaskMemberRole enum and role column for task memberships
DO $$ BEGIN
  CREATE TYPE "TaskMemberRole" AS ENUM ('ASSIGNEE', 'WATCHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "TaskMembership"
  ADD COLUMN IF NOT EXISTS "role" "TaskMemberRole" NOT NULL DEFAULT 'ASSIGNEE';

