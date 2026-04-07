-- Align database with schema: profile fields used by /auth/me and avatar upload.
-- IF NOT EXISTS: some environments already added these columns out-of-band.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
