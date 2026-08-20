#!/usr/bin/env python3
"""
Adds a SUPPORT_STAFF role (cleaners, security, groundskeepers, cooks, etc.
— informal/support workers who should still be able to log in and use the
existing Workers self-service page as their portal).

Patches:
  prisma/schema.prisma       -> adds SUPPORT_STAFF to enum Role
  src/routes/admin.routes.ts -> adds 'SUPPORT_STAFF' to the creatableRoles
                                 and assignableRoles whitelists

USAGE (run from ~/runyenjes-platform/backend):
    python3 patch_add_support_staff_role.py

After running, you still need to:
    npx prisma validate
    npx prisma migrate dev --name add_support_staff_role

Idempotent: skips already-patched files.
"""

import os
import sys

SCHEMA_PATH = os.path.join("prisma", "schema.prisma")
ADMIN_ROUTES_PATH = os.path.join("src", "routes", "admin.routes.ts")


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def patch_schema():
    if not os.path.isfile(SCHEMA_PATH):
        print("ERROR: '" + SCHEMA_PATH + "' not found. Run this from ~/runyenjes-platform/backend.")
        sys.exit(1)
    with open(SCHEMA_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "SUPPORT_STAFF" in joined:
        print("SKIP  " + SCHEMA_PATH + " already has SUPPORT_STAFF.")
        return

    role_open = find_line_index(lines, "enum Role {")
    if role_open is None:
        print("ERROR: could not find 'enum Role {' in schema.prisma. Patch manually.")
        sys.exit(1)
    role_close = None
    for i in range(role_open + 1, len(lines)):
        if lines[i].strip() == "}":
            role_close = i
            break
    if role_close is None:
        print("ERROR: could not find closing '}' for enum Role. Patch manually.")
        sys.exit(1)

    lines = lines[:role_close] + ["  SUPPORT_STAFF\n"] + lines[role_close:]
    with open(SCHEMA_PATH, "w") as f:
        f.writelines(lines)
    print("PATCHED " + SCHEMA_PATH + " (added SUPPORT_STAFF to enum Role)")


def patch_admin_routes():
    if not os.path.isfile(ADMIN_ROUTES_PATH):
        print("ERROR: '" + ADMIN_ROUTES_PATH + "' not found.")
        sys.exit(1)
    with open(ADMIN_ROUTES_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "SUPPORT_STAFF" in joined:
        print("SKIP  " + ADMIN_ROUTES_PATH + " already has SUPPORT_STAFF.")
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
            lines = lines[:close_idx] + ["    'SUPPORT_STAFF',\n"] + lines[close_idx:]
            changed = True

    assignable_idx = find_line_index(lines, "const assignableRoles = [")
    if assignable_idx is not None:
        close_idx = None
        for i in range(assignable_idx + 1, len(lines)):
            if lines[i].strip().startswith("]"):
                close_idx = i
                break
        if close_idx is not None:
            lines = lines[:close_idx] + ["    'SUPPORT_STAFF',\n"] + lines[close_idx:]
            changed = True

    if not changed:
        print("ERROR: could not find creatableRoles/assignableRoles arrays in " + ADMIN_ROUTES_PATH)
        print("       (patch_admin_roles.py may not have been run yet). Patch manually or run that first.")
        sys.exit(1)

    with open(ADMIN_ROUTES_PATH, "w") as f:
        f.writelines(lines)
    print("PATCHED " + ADMIN_ROUTES_PATH + " (added SUPPORT_STAFF to creatableRoles + assignableRoles)")


def main():
    patch_schema()
    patch_admin_routes()
    print("")
    print("Next: npx prisma validate && npx prisma migrate dev --name add_support_staff_role")


if __name__ == "__main__":
    main()
