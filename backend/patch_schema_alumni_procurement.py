#!/usr/bin/env python3
"""
Patches prisma/schema.prisma to add:
  - ALUMNI and PROCUREMENT_OFFICER to the Role enum
  - AlumniProfile model (one-to-one with User) for graduated students
  - PurchaseRequest model, linked to InventoryItem (Stores) and User,
    so Procurement requests can be fulfilled through the existing
    Stores module rather than a separate parallel system.

Uses line-based anchors (not exact multi-line block matching) so it's
tolerant of whitespace differences, same approach as the frontend patch
scripts.

USAGE (run from ~/runyenjes-platform/backend):
    python3 patch_schema_alumni_procurement.py

Idempotent: skips if it looks already patched.
"""

import os
import sys

SCHEMA_PATH = os.path.join("prisma", "schema.prisma")


def read_lines(path):
    if not os.path.isfile(path):
        print("ERROR: '" + path + "' not found. Run this from ~/runyenjes-platform/backend.")
        sys.exit(1)
    with open(path, "r") as f:
        return f.readlines()


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def find_block_close(lines, open_idx):
    """Given the index of a '<Something> {' line, find the index of the
    line whose stripped content is exactly '}' that closes it. Assumes no
    nested multi-line brace blocks inside (true for this schema's style)."""
    for i in range(open_idx + 1, len(lines)):
        if lines[i].strip() == "}":
            return i
    return None


NEW_ROLE_VALUES = "  ALUMNI\n  PROCUREMENT_OFFICER\n"

NEW_USER_RELATIONS = """
  // Alumni
  alumniProfile AlumniProfile?

  // Procurement
  purchaseRequestsMade     PurchaseRequest[] @relation("PurchaseRequestedBy")
  purchaseRequestsApproved PurchaseRequest[] @relation("PurchaseRequestApprovedBy")
"""

NEW_INVENTORY_ITEM_RELATION = "  purchaseRequests PurchaseRequest[]\n"

NEW_MODELS = """
// ─────────────────────────────────────────────
// ALUMNI
// ─────────────────────────────────────────────
// A graduated student's account keeps its role changed from STUDENT to
// ALUMNI (preserving all existing enrollment/academic history) and gets
// this profile attached for post-graduation info.

model AlumniProfile {
  id               String   @id @default(uuid())
  userId           String   @unique
  user             User     @relation(fields: [userId], references: [id])
  graduationYear   Int?
  currentEmployer  String?
  currentPosition  String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ─────────────────────────────────────────────
// PROCUREMENT
// ─────────────────────────────────────────────
// Lean v1: a purchase request references an existing Stores InventoryItem
// (rather than free-text), so approving + receiving a request can restock
// that item directly through the existing Stores module.

enum PurchaseRequestStatus {
  PENDING
  APPROVED
  REJECTED
  ORDERED
  RECEIVED
}

model PurchaseRequest {
  id             String                @id @default(uuid())
  itemId         String
  item           InventoryItem         @relation(fields: [itemId], references: [id])
  quantity       Decimal
  justification  String?
  status         PurchaseRequestStatus @default(PENDING)
  requestedById  String
  requestedBy    User                  @relation("PurchaseRequestedBy", fields: [requestedById], references: [id])
  approvedById   String?
  approvedBy     User?                 @relation("PurchaseRequestApprovedBy", fields: [approvedById], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([itemId])
  @@index([requestedById])
}
"""


def main():
    lines = read_lines(SCHEMA_PATH)
    joined = "".join(lines)

    if "PROCUREMENT_OFFICER" in joined:
        print("SKIP  schema.prisma already patched.")
        return

    # 1. Role enum
    role_open = find_line_index(lines, "enum Role {")
    if role_open is None:
        print("ERROR: could not find 'enum Role {' in schema.prisma. Patch manually.")
        sys.exit(1)
    role_close = find_block_close(lines, role_open)
    if role_close is None:
        print("ERROR: could not find closing '}' for enum Role. Patch manually.")
        sys.exit(1)
    lines = lines[:role_close] + [NEW_ROLE_VALUES] + lines[role_close:]

    # 2. User model relations (insert before closing brace)
    user_open = find_line_index(lines, "model User {")
    if user_open is None:
        print("ERROR: could not find 'model User {' in schema.prisma. Patch manually.")
        sys.exit(1)
    user_close = find_block_close(lines, user_open)
    if user_close is None:
        print("ERROR: could not find closing '}' for model User. Patch manually.")
        sys.exit(1)
    lines = lines[:user_close] + [NEW_USER_RELATIONS] + lines[user_close:]

    # 3. InventoryItem model relation (insert before closing brace)
    item_open = find_line_index(lines, "model InventoryItem {")
    if item_open is None:
        print("ERROR: could not find 'model InventoryItem {' in schema.prisma. Patch manually.")
        sys.exit(1)
    item_close = find_block_close(lines, item_open)
    if item_close is None:
        print("ERROR: could not find closing '}' for model InventoryItem. Patch manually.")
        sys.exit(1)
    lines = lines[:item_close] + [NEW_INVENTORY_ITEM_RELATION] + lines[item_close:]

    # 4. Append new models at the end of the file
    lines.append(NEW_MODELS)

    with open(SCHEMA_PATH, "w") as f:
        f.writelines(lines)

    print("PATCHED " + SCHEMA_PATH)
    print(" - Added ALUMNI and PROCUREMENT_OFFICER to Role enum")
    print(" - Added AlumniProfile model + User.alumniProfile relation")
    print(" - Added PurchaseRequest model + relations to User and InventoryItem")
    print("")
    print("Next: npx prisma validate, then npx prisma migrate dev --name add_alumni_procurement")


if __name__ == "__main__":
    main()
