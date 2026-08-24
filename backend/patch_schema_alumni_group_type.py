#!/usr/bin/env python3
"""
Adds ALUMNI to the GroupType enum, so there can be a shared 'Alumni' group
that graduated students move into (replacing their Class/Department group
memberships).

USAGE (run from ~/runyenjes-platform/backend):
    python3 patch_schema_alumni_group_type.py

After running:
    npx prisma validate
    npx prisma migrate dev --name add_alumni_group_type

Idempotent: skips if already patched.
"""

import os
import sys

SCHEMA_PATH = os.path.join("prisma", "schema.prisma")


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def main():
    if not os.path.isfile(SCHEMA_PATH):
        print("ERROR: '" + SCHEMA_PATH + "' not found. Run this from ~/runyenjes-platform/backend.")
        sys.exit(1)
    with open(SCHEMA_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)

    if "ALUMNI" in joined and "enum GroupType" in joined:
        # Check specifically whether ALUMNI is inside the GroupType enum, not just the Role enum.
        gt_idx = find_line_index(lines, "enum GroupType {")
        if gt_idx is not None:
            gt_close = None
            for i in range(gt_idx + 1, len(lines)):
                if lines[i].strip() == "}":
                    gt_close = i
                    break
            if gt_close is not None:
                block = "".join(lines[gt_idx:gt_close])
                if "ALUMNI" in block:
                    print("SKIP  " + SCHEMA_PATH + " GroupType already has ALUMNI.")
                    return

    gt_idx = find_line_index(lines, "enum GroupType {")
    if gt_idx is None:
        print("ERROR: could not find 'enum GroupType {' in schema.prisma. Patch manually.")
        sys.exit(1)
    gt_close = None
    for i in range(gt_idx + 1, len(lines)):
        if lines[i].strip() == "}":
            gt_close = i
            break
    if gt_close is None:
        print("ERROR: could not find closing '}' for enum GroupType. Patch manually.")
        sys.exit(1)

    lines = lines[:gt_close] + ["  ALUMNI\n"] + lines[gt_close:]
    with open(SCHEMA_PATH, "w") as f:
        f.writelines(lines)
    print("PATCHED " + SCHEMA_PATH + " (added ALUMNI to enum GroupType)")
    print("")
    print("Next: npx prisma validate && npx prisma migrate dev --name add_alumni_group_type")


if __name__ == "__main__":
    main()
