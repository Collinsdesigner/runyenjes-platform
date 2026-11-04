-- CreateEnum
CREATE TYPE "PoeStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'COMPETENT', 'NOT_YET_COMPETENT', 'RESUBMIT_REQUESTED');

-- CreateEnum
CREATE TYPE "PoeMediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "PoeEntry" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "performedOn" TIMESTAMP(3) NOT NULL,
    "status" "PoeStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "assessedById" TEXT,
    "assessedAt" TIMESTAMP(3),
    "assessorFeedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoeMedia" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "kind" "PoeMediaKind" NOT NULL,
    "publicId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "bytes" INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoeMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PoeEntry_studentId_idx" ON "PoeEntry"("studentId");

-- CreateIndex
CREATE INDEX "PoeEntry_unitId_status_idx" ON "PoeEntry"("unitId", "status");

-- CreateIndex
CREATE INDEX "PoeMedia_entryId_idx" ON "PoeMedia"("entryId");

-- AddForeignKey
ALTER TABLE "PoeEntry" ADD CONSTRAINT "PoeEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoeEntry" ADD CONSTRAINT "PoeEntry_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoeEntry" ADD CONSTRAINT "PoeEntry_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoeMedia" ADD CONSTRAINT "PoeMedia_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PoeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

