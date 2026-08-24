#!/usr/bin/env python3
"""
Adds 'PROCUREMENT_OFFICER' to admin.routes.ts's creatableRoles and
assignableRoles whitelists. This was missed when Procurement was built —
the role existed in the database and Procurement's own pages, but Admin
had no way to actually create or assign it.

USAGE (run from ~/runyenjes-platform/backend):
    python3 patch_procurement_role_whitelist.py

Idempotent: skips if already patched.
"""

import os
import sys

TARGET = os.path.join("src", "routes", "admin.routes.ts")


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def main():
    if not os.path.isfile(TARGET):
        print("ERROR: '" + TARGET + "' not found. Run this from ~/runyenjes-platform/backend.")
        sys.exit(1)
    with open(TARGET, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "PROCUREMENT_OFFICER" in joined:
        print("SKIP  " + TARGET + " already has PROCUREMENT_OFFICER.")
        return

    changed = False

    creatable_idx = find_line_index(lines, "const creatableRoles = [")
    if creatable_idx is not None:
        close_idx = None
        for i in range(creatable_idx + 1, len(lines)):
            if lines[i].strip().startswith("]"):
                close_idx = i
                break
        if close_idx is not None:
            lines = lines[:close_idx] + ["    'PROCUREMENT_OFFICER',\n"] + lines[close_idx:]
            changed = True

    assignable_idx = find_line_index(lines, "const assignableRoles = [")
    if assignable_idx is not None:
        close_idx = None
        for i in range(assignable_idx + 1, len(lines)):
            if lines[i].strip().startswith("]"):
                close_idx = i
                break
        if close_idx is not None:
            lines = lines[:close_idx] + ["    'PROCUREMENT_OFFICER',\n"] + lines[close_idx:]
            changed = True

    if not changed:
        print("ERROR: could not find creatableRoles/assignableRoles arrays in " + TARGET + ". Patch manually.")
        sys.exit(1)

    with open(TARGET, "w") as f:
        f.writelines(lines)
    print("PATCHED " + TARGET + " (added PROCUREMENT_OFFICER to creatableRoles + assignableRoles)")


if __name__ == "__main__":
    main()
