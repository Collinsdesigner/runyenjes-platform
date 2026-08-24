#!/usr/bin/env python3
"""
Fixes AdminUsers.tsx:
  1. 'ALUMNI' was missing from ALL_ROLES entirely -- meaning you couldn't
     filter/search users by role=ALUMNI even though alumni existed in the
     full unfiltered list.
  2. Adds it to ALL_ROLES, but excludes it (same as STUDENT) from the
     create-new-user dropdown, since the only way to become Alumni should
     be graduating a student, not raw account creation.

USAGE (run from ~/runyenjes-platform/frontend):
    python3 patch_admin_users_alumni_filter.py

Idempotent: skips if already patched.
"""

import os
import sys

TARGET = os.path.join("src", "pages", "admin", "AdminUsers.tsx")


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def main():
    if not os.path.isfile(TARGET):
        print("ERROR: '" + TARGET + "' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)
    with open(TARGET, "r") as f:
        lines = f.readlines()

    changed = False

    all_roles_idx = find_line_index(lines, "const ALL_ROLES = [")
    if all_roles_idx is None:
        print("ERROR: could not find ALL_ROLES in " + TARGET + ". Patch manually.")
        sys.exit(1)
    close_idx = None
    for i in range(all_roles_idx + 1, len(lines)):
        if lines[i].strip().startswith("]"):
            close_idx = i
            break
    if close_idx is None:
        print("ERROR: could not find closing ']' for ALL_ROLES. Patch manually.")
        sys.exit(1)
    block = "".join(lines[all_roles_idx:close_idx])
    if "'ALUMNI'" not in block:
        lines = lines[:close_idx] + ["  'ALUMNI',\n"] + lines[close_idx:]
        changed = True
        print("PATCHED " + TARGET + " (added ALUMNI to ALL_ROLES)")
    else:
        print("SKIP  " + TARGET + " ALL_ROLES already has ALUMNI.")

    joined = "".join(lines)
    old_filter = "{ALL_ROLES.filter((r) => r !== 'STUDENT').map((r) => ("
    new_filter = "{ALL_ROLES.filter((r) => r !== 'STUDENT' && r !== 'ALUMNI').map((r) => ("
    if old_filter in joined:
        joined = joined.replace(old_filter, new_filter)
        lines = joined.splitlines(keepends=True)
        changed = True
        print("PATCHED " + TARGET + " (excluded ALUMNI from create-new-user dropdown)")
    elif new_filter in joined:
        print("SKIP  " + TARGET + " create-new-user filter already excludes ALUMNI.")
    else:
        print("WARNING: could not find the create-new-user role filter to update.")
        print("         ALUMNI was still added to ALL_ROLES, but may now appear as a")
        print("         selectable option when creating a new user. Check manually.")

    if changed:
        with open(TARGET, "w") as f:
            f.writelines(lines)

    print("")
    print("Done.")


if __name__ == "__main__":
    main()
