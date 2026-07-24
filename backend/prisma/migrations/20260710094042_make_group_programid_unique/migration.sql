/*
  Warnings:

  - A unique constraint covering the columns `[programId]` on the table `Group` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Group_programId_key" ON "Group"("programId");
