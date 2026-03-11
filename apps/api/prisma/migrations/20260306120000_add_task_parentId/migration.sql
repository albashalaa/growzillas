-- Add parentId column to Task for subtasks
ALTER TABLE "Task"
ADD COLUMN "parentId" TEXT REFERENCES "Task"("id") ON DELETE CASCADE;

-- Index to efficiently query tasks by project and parent
CREATE INDEX "Task_projectId_parentId_idx" ON "Task"("projectId", "parentId");

