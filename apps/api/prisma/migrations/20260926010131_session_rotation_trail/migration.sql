-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "previous_refresh_token_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_previous_refresh_token_hash_key" ON "sessions"("previous_refresh_token_hash");

