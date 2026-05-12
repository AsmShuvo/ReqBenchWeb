-- Drop everything from previous schema that is no longer needed
DROP TABLE IF EXISTS "BenchmarkRun" CASCADE;
DROP TABLE IF EXISTS "EnvironmentVariable" CASCADE;
DROP TABLE IF EXISTS "Environment" CASCADE;
DROP TABLE IF EXISTS "RequestHistory" CASCADE;
DROP TABLE IF EXISTS "CollectionFolder" CASCADE;
DROP TABLE IF EXISTS "SavedRequest" CASCADE;
DROP TABLE IF EXISTS "Collection" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;

-- User
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Collection
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Collection_userId_idx" ON "Collection"("userId");
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SavedRequest
CREATE TABLE "SavedRequest" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '[]',
    "body" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SavedRequest_collectionId_idx" ON "SavedRequest"("collectionId");
ALTER TABLE "SavedRequest" ADD CONSTRAINT "SavedRequest_collectionId_fkey"
    FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
