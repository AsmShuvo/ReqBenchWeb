-- AlterTable: Add requestData and responseData to RequestHistory
ALTER TABLE "RequestHistory" ADD COLUMN "requestData" JSONB;
ALTER TABLE "RequestHistory" ADD COLUMN "responseData" JSONB;

-- AlterTable: Add sortOrder to CollectionFolder
ALTER TABLE "CollectionFolder" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Add sortOrder to SavedRequest
ALTER TABLE "SavedRequest" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: Unique constraint on (environmentId, key) for EnvironmentVariable
CREATE UNIQUE INDEX "EnvironmentVariable_environmentId_key_key" ON "EnvironmentVariable"("environmentId", "key");
