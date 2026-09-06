#!/usr/bin/env python3
"""
Adds Assignment + AssignmentSubmission models:
  - Assignment belongs to a Unit + Term (reuses existing academic
    structure), created by a Teacher or Admin.
  - AssignmentSubmission: one per student per assignment, either text
    and/or a file/link URL, graded with a score + optional feedback.

USAGE (run from ~/runyenjes-platform/backend):
    python3 patch_schema_assignments.py

After running:
    npx prisma validate
    npx prisma migrate dev --name add_assignments

Idempotent: skips if already patched.
"""

import os
import sys

SCHEMA_PATH = os.path.join("prisma", "schema.prisma")

NEW_USER_RELATIONS = """  assignmentsCreated     Assignment[]           @relation("AssignmentCreatedBy")
  assignmentSubmissions  AssignmentSubmission[] @relation("AssignmentSubmittedBy")
  assignmentsGraded      AssignmentSubmission[] @relation("AssignmentGradedBy")
"""

NEW_UNIT_RELATION = "  assignments Assignment[]\n"
NEW_TERM_RELATION = "  assignments         Assignment[]\n"

NEW_MODELS = """
// ─────────────────────────────────────────────
// ASSIGNMENTS
// ─────────────────────────────────────────────
// Lean v1: an Assignment belongs to a Unit + Term (same pattern as Exam).
// A student submits text and/or a file/link; a Teacher or Admin grades it
// with a score and optional feedback comment.

model Assignment {
  id          String   @id @default(uuid())
  unitId      String
  unit        Unit     @relation(fields: [unitId], references: [id])
  termId      String
  term        Term     @relation(fields: [termId], references: [id])
  title       String
  description String?
  dueDate     DateTime?
  maxScore    Decimal  @default(100)
  createdById String
  createdBy   User     @relation("AssignmentCreatedBy", fields: [createdById], references: [id])

  submissions AssignmentSubmission[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([unitId])
  @@index([termId])
}

model AssignmentSubmission {
  id           String    @id @default(uuid())
  assignmentId String
  assignment   Assignment @relation(fields: [assignmentId], references: [id])
  studentId    String
  student      User      @relation("AssignmentSubmittedBy", fields: [studentId], references: [id])
  textAnswer   String?
  fileUrl      String?
  submittedAt  DateTime  @default(now())
  score        Decimal?
  feedback     String?
  gradedById   String?
  gradedBy     User?     @relation("AssignmentGradedBy", fields: [gradedById], references: [id])
  gradedAt     DateTime?

  updatedAt DateTime @updatedAt

  @@unique([assignmentId, studentId])
  @@index([studentId])
}
"""


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def find_block_close(lines, open_idx):
    for i in range(open_idx + 1, len(lines)):
        if lines[i].strip() == "}":
            return i
    return None


def main():
    if not os.path.isfile(SCHEMA_PATH):
        print("ERROR: '" + SCHEMA_PATH + "' not found. Run this from ~/runyenjes-platform/backend.")
        sys.exit(1)
    with open(SCHEMA_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)

    if "model Assignment " in joined or "model Assignment {" in joined:
        print("SKIP  " + SCHEMA_PATH + " already has Assignment.")
        return

    user_open = find_line_index(lines, "model User {")
    if user_open is None:
        print("ERROR: could not find 'model User {' in schema.prisma. Patch manually.")
        sys.exit(1)
    user_close = find_block_close(lines, user_open)
    if user_close is None:
        print("ERROR: could not find closing '}' for model User. Patch manually.")
        sys.exit(1)
    lines = lines[:user_close] + [NEW_USER_RELATIONS] + lines[user_close:]

    unit_open = find_line_index(lines, "model Unit {")
    if unit_open is None:
        print("ERROR: could not find 'model Unit {' in schema.prisma. Patch manually.")
        sys.exit(1)
    unit_close = find_block_close(lines, unit_open)
    if unit_close is None:
        print("ERROR: could not find closing '}' for model Unit. Patch manually.")
        sys.exit(1)
    lines = lines[:unit_close] + [NEW_UNIT_RELATION] + lines[unit_close:]

    term_open = find_line_index(lines, "model Term {")
    if term_open is None:
        print("ERROR: could not find 'model Term {' in schema.prisma. Patch manually.")
        sys.exit(1)
    term_close = find_block_close(lines, term_open)
    if term_close is None:
        print("ERROR: could not find closing '}' for model Term. Patch manually.")
        sys.exit(1)
    lines = lines[:term_close] + [NEW_TERM_RELATION] + lines[term_close:]

    lines.append(NEW_MODELS)

    with open(SCHEMA_PATH, "w") as f:
        f.writelines(lines)

    print("PATCHED " + SCHEMA_PATH)
    print(" - Added Assignment + AssignmentSubmission models")
    print(" - Added relations to User, Unit, Term")
    print("")
    print("Next: npx prisma validate && npx prisma migrate dev --name add_assignments")


if __name__ == "__main__":
    main()
