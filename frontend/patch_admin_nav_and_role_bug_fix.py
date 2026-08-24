#!/usr/bin/env python3
"""
Fixes three issues:
  1. Admin sidebar had no link to Alumni management (page/route existed,
     just no nav entry) -> adds 'Alumni' under Administration.
  2. Admin sidebar had no link to Procurement management -> adds
     'Procurement' under Operations, pointing at the same
     ProcurementRequests page staff use (Admin sees the management table
     there because the backend already allows ADMIN, not just
     PROCUREMENT_OFFICER).
  3. AdminUsers.tsx role-change bug: clicking "Save" without first
     interacting with the dropdown silently did nothing, because
     roleEdits[userId] was undefined until onChange fired at least once.
     Fixed by passing the resolved value (roleEdits[u.id] ?? u.role)
     directly into the handler instead of re-reading state by id.
  Also adds SUPPORT_STAFF to AdminUsers.tsx's ALL_ROLES list, which was
  missed earlier.

Patches:
  src/components/portal/PortalLayout.tsx
  src/pages/admin/AdminUsers.tsx

USAGE (run from ~/runyenjes-platform/frontend):
    python3 patch_admin_nav_and_role_bug_fix.py

Idempotent: skips already-patched files.
"""

import os
import sys

LAYOUT_PATH = os.path.join("src", "components", "portal", "PortalLayout.tsx")
ADMIN_USERS_PATH = os.path.join("src", "pages", "admin", "AdminUsers.tsx")


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def patch_layout():
    if not os.path.isfile(LAYOUT_PATH):
        print("ERROR: '" + LAYOUT_PATH + "' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)
    with open(LAYOUT_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "/admin/alumni" in joined:
        print("SKIP  " + LAYOUT_PATH + " already has the Alumni nav link.")
        return

    staff_idx = find_line_index(lines, "'/admin/staff'")
    if staff_idx is None:
        print("ERROR: could not find the '/admin/staff' nav item in " + LAYOUT_PATH + ". Patch manually.")
        sys.exit(1)
    alumni_line = "        { label: 'Alumni', path: '/admin/alumni', icon: '\U0001f393' },\n"
    lines = lines[: staff_idx + 1] + [alumni_line] + lines[staff_idx + 1 :]

    comm_idx = find_line_index(lines, "'/admin/communication'")
    if comm_idx is None:
        print("ERROR: could not find the '/admin/communication' nav item in " + LAYOUT_PATH + ". Patch manually.")
        sys.exit(1)
    procurement_line = "        { label: 'Procurement', path: '/procurement/requests', icon: '\U0001f4c4' },\n"
    lines = lines[: comm_idx + 1] + [procurement_line] + lines[comm_idx + 1 :]

    with open(LAYOUT_PATH, "w") as f:
        f.writelines(lines)
    print("PATCHED " + LAYOUT_PATH + " (added Alumni + Procurement links to Admin sidebar)")


def patch_admin_users():
    if not os.path.isfile(ADMIN_USERS_PATH):
        print("ERROR: '" + ADMIN_USERS_PATH + "' not found.")
        sys.exit(1)
    with open(ADMIN_USERS_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)

    changed = False

    if "SUPPORT_STAFF" not in joined:
        all_roles_idx = find_line_index(lines, "const ALL_ROLES = [")
        if all_roles_idx is None:
            print("ERROR: could not find ALL_ROLES in " + ADMIN_USERS_PATH + ". Patch manually.")
            sys.exit(1)
        close_idx = None
        for i in range(all_roles_idx + 1, len(lines)):
            if lines[i].strip().startswith("]"):
                close_idx = i
                break
        if close_idx is None:
            print("ERROR: could not find closing ']' for ALL_ROLES. Patch manually.")
            sys.exit(1)
        lines = lines[:close_idx] + ["  'SUPPORT_STAFF',\n"] + lines[close_idx:]
        changed = True
        print("PATCHED " + ADMIN_USERS_PATH + " (added SUPPORT_STAFF to ALL_ROLES)")

    joined = "".join(lines)

    if "handleRoleChange(u.id, roleEdits[u.id]" in joined:
        print("SKIP  " + ADMIN_USERS_PATH + " role-change bug already fixed.")
    else:
        func_idx = find_line_index(lines, "async function handleRoleChange(userId: string)")
        if func_idx is None:
            print("ERROR: could not find handleRoleChange in " + ADMIN_USERS_PATH + ". Patch manually.")
            sys.exit(1)
        func_close = None
        depth = 0
        for i in range(func_idx, len(lines)):
            depth += lines[i].count("{") - lines[i].count("}")
            if depth == 0 and i > func_idx:
                func_close = i
                break
        if func_close is None:
            print("ERROR: could not find end of handleRoleChange. Patch manually.")
            sys.exit(1)

        new_func = (
            "  async function handleRoleChange(userId: string, role: string) {\n"
            "    setError('');\n"
            "    setMessage('');\n"
            "    if (!role) return;\n"
            "    try {\n"
            "      await api(`/admin/users/${userId}/role`, { method: 'PATCH', token, body: { role } });\n"
            "      setMessage('Role updated');\n"
            "      load();\n"
            "    } catch (err) {\n"
            "      setError(err instanceof Error ? err.message : 'Could not update role');\n"
            "    }\n"
            "  }\n"
        )
        lines = lines[:func_idx] + [new_func] + lines[func_close + 1 :]

        joined = "".join(lines)
        old_button = "onClick={() => handleRoleChange(u.id)}"
        new_button = "onClick={() => handleRoleChange(u.id, roleEdits[u.id] ?? u.role)}"
        if old_button not in joined:
            print("ERROR: could not find the Save button's onClick in " + ADMIN_USERS_PATH + ". Patch manually.")
            sys.exit(1)
        joined = joined.replace(old_button, new_button)
        lines = joined.splitlines(keepends=True)

        changed = True
        print("PATCHED " + ADMIN_USERS_PATH + " (fixed silent no-op when Save clicked without changing dropdown)")

    if changed:
        with open(ADMIN_USERS_PATH, "w") as f:
            f.writelines(lines)


def main():
    patch_layout()
    patch_admin_users()
    print("")
    print("Done.")


if __name__ == "__main__":
    main()
