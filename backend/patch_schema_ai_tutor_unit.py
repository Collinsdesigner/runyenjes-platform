#!/usr/bin/env python3
"""
Adds an optional unitId to AIConversation, so a Tutor conversation (scoped
to a specific unit) stays scoped across follow-up messages, instead of
only working for a single message.

USAGE (run from ~/runyenjes-platform/backend):
    python3 patch_schema_ai_tutor_unit.py

After running:
    npx prisma validate
    npx prisma migrate dev --name add_ai_conversation_unit

Idempotent: skips if already patched.
"""

import os
import sys

SCHEMA_PATH = os.path.join("prisma", "schema.prisma")

OLD_MODEL = """model AIConversation {
  id        String      @id @default(uuid())
  userId    String
  user      User        @relation(fields: [userId], references: [id])
  title     String      @default("New chat")
  messages  AIMessage[]
  createdAt DateTime    @default(now())
  updatedAt DateTime    @default(now()) @updatedAt
}"""

NEW_MODEL = """model AIConversation {
  id        String      @id @default(uuid())
  userId    String
  user      User        @relation(fields: [userId], references: [id])
  unitId    String?
  unit      Unit?       @relation(fields: [unitId], references: [id])
  title     String      @default("New chat")
  messages  AIMessage[]
  createdAt DateTime    @default(now())
  updatedAt DateTime    @default(now()) @updatedAt
}"""

NEW_UNIT_RELATION = "  aiConversations AIConversation[]\n"


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
        content = f.read()

    if "aiConversations AIConversation[]" in content:
        print("SKIP  " + SCHEMA_PATH + " already patched.")
        return

    if OLD_MODEL not in content:
        print("ERROR: could not find the expected AIConversation model in schema.prisma. Patch manually.")
        sys.exit(1)
    content = content.replace(OLD_MODEL, NEW_MODEL)

    lines = content.splitlines(keepends=True)
    unit_open = find_line_index(lines, "model Unit {")
    if unit_open is None:
        print("ERROR: could not find 'model Unit {' in schema.prisma. Patch manually.")
        sys.exit(1)
    unit_close = find_block_close(lines, unit_open)
    if unit_close is None:
        print("ERROR: could not find closing '}' for model Unit. Patch manually.")
        sys.exit(1)
    lines = lines[:unit_close] + [NEW_UNIT_RELATION] + lines[unit_close:]

    with open(SCHEMA_PATH, "w") as f:
        f.writelines(lines)

    print("PATCHED " + SCHEMA_PATH + " (AIConversation.unitId + Unit.aiConversations)")
    print("")
    print("Next: npx prisma validate && npx prisma migrate dev --name add_ai_conversation_unit")


if __name__ == "__main__":
    main()
