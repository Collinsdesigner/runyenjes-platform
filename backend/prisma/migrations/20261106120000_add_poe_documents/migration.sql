-- AlterEnum
ALTER TYPE "PoeMediaKind" ADD VALUE 'DOCUMENT';

-- AlterTable
ALTER TABLE "PoeMedia" ADD COLUMN     "fileName" TEXT;

