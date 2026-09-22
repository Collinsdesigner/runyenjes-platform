-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('PROGRAMME_CHANGE', 'CLEARANCE', 'GRADUATION', 'ACADEMIC_REQUISITION');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RequestStageStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "type" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "submitterId" TEXT NOT NULL,
    "payload" JSONB,
    "currentStage" INTEGER NOT NULL DEFAULT 0,
    "generatedDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestStage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "approverRole" "Role" NOT NULL,
    "status" "RequestStageStatus" NOT NULL DEFAULT 'PENDING',
    "actedById" TEXT,
    "actedAt" TIMESTAMP(3),
    "comment" TEXT,

    CONSTRAINT "RequestStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Request_generatedDocumentId_key" ON "Request"("generatedDocumentId");

-- CreateIndex
CREATE INDEX "Request_submitterId_idx" ON "Request"("submitterId");

-- CreateIndex
CREATE INDEX "RequestStage_requestId_idx" ON "RequestStage"("requestId");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_generatedDocumentId_fkey" FOREIGN KEY ("generatedDocumentId") REFERENCES "IssuedLetter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestStage" ADD CONSTRAINT "RequestStage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestStage" ADD CONSTRAINT "RequestStage_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

