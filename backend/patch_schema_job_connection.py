#!/usr/bin/env python3
"""
Adds the Job Connection feature to the schema:
  - JobPostingStatus enum (OPEN, CLOSED)
  - JobPosting model: any staff member or alumnus can post; alumni (and
    admin, for moderation) browse; the poster or admin can close/delete.

USAGE (run from ~/runyenjes-platform/backend):
    python3 patch_schema_job_connection.py

After running:
    npx prisma validate
    npx prisma migrate dev --name add_job_connection

Idempotent: skips if already patched.
"""

import os
import sys

SCHEMA_PATH = os.path.join("prisma", "schema.prisma")

NEW_USER_RELATION = "  jobPostings JobPosting[] @relation(\"JobPostingPostedBy\")\n"

NEW_MODELS = """
// ─────────────────────────────────────────────
// JOB CONNECTION
// ─────────────────────────────────────────────
// Any staff member or alumnus can post an opening; alumni (and admin, for
// moderation) browse open postings; the poster or an admin can close or
// remove their own listing.

enum JobPostingStatus {
  OPEN
  CLOSED
}

model JobPosting {
  id           String           @id @default(uuid())
  title        String
  company      String
  location     String?
  description  String
  applyLink    String?
  contactEmail String?
  status       JobPostingStatus @default(OPEN)
  postedById   String
  postedBy     User             @relation("JobPostingPostedBy", fields: [postedById], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([postedById])
  @@index([status])
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

    if "JobPosting" in joined:
        print("SKIP  " + SCHEMA_PATH + " already has JobPosting.")
        return

    user_open = find_line_index(lines, "model User {")
    if user_open is None:
        print("ERROR: could not find 'model User {' in schema.prisma. Patch manually.")
        sys.exit(1)
    user_close = find_block_close(lines, user_open)
    if user_close is None:
        print("ERROR: could not find closing '}' for model User. Patch manually.")
        sys.exit(1)
    lines = lines[:user_close] + [NEW_USER_RELATION] + lines[user_close:]

    lines.append(NEW_MODELS)

    with open(SCHEMA_PATH, "w") as f:
        f.writelines(lines)

    print("PATCHED " + SCHEMA_PATH + " (added JobPosting model + User.jobPostings relation)")
    print("")
    print("Next: npx prisma validate && npx prisma migrate dev --name add_job_connection")


if __name__ == "__main__":
    main()
