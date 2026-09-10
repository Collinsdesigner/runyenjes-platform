-- CreateTable
CREATE TABLE "IssuedLetter" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "filePublicId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssuedLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IssuedLetter_studentId_idx" ON "IssuedLetter"("studentId");

-- AddForeignKey
ALTER TABLE "IssuedLetter" ADD CONSTRAINT "IssuedLetter_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedLetter" ADD CONSTRAINT "IssuedLetter_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
