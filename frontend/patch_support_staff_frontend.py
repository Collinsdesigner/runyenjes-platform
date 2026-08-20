#!/usr/bin/env python3
"""
Wires SUPPORT_STAFF into the frontend. Their portal IS the existing Workers
self-service page (staff profile + leave requests) — no separate dashboard
needed, so their nav 'Dashboard' link and their PortalRedirect both point
straight to /workers.

Patches:
  src/components/portal/PortalLayout.tsx -> adds SUPPORT_STAFF to
                                             STAFF_SELF_SERVICE_ROLES and
                                             adds a SUPPORT_STAFF roleSection
                                             pointing to /workers
  src/pages/PortalRedirect.tsx           -> adds SUPPORT_STAFF case -> /workers
  src/pages/admin/AdminStaff.tsx         -> adds 'SUPPORT_STAFF' to STAFF_ROLES

USAGE (run from ~/runyenjes-platform/frontend):
    python3 patch_support_staff_frontend.py

Idempotent: skips already-patched files.
"""

import os
import sys

LAYOUT_PATH = os.path.join("src", "components", "portal", "PortalLayout.tsx")
REDIRECT_PATH = os.path.join("src", "pages", "PortalRedirect.tsx")
ADMIN_STAFF_PATH = os.path.join("src", "pages", "admin", "AdminStaff.tsx")


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
    if "SUPPORT_STAFF" in joined:
        print("SKIP  " + LAYOUT_PATH + " already patched.")
        return

    # 1. Add SUPPORT_STAFF to STAFF_SELF_SERVICE_ROLES array
    const_idx = find_line_index(lines, "const STAFF_SELF_SERVICE_ROLES = [")
    if const_idx is None:
        print("ERROR: could not find STAFF_SELF_SERVICE_ROLES in " + LAYOUT_PATH + ". Patch manually.")
        sys.exit(1)
    close_idx = None
    for i in range(const_idx + 1, len(lines)):
        if lines[i].strip().startswith("]"):
            close_idx = i
            break
    if close_idx is None:
        print("ERROR: could not find closing ']' for STAFF_SELF_SERVICE_ROLES. Patch manually.")
        sys.exit(1)
    lines = lines[:close_idx] + ["  'SUPPORT_STAFF',\n"] + lines[close_idx:]

    # 2. Add a SUPPORT_STAFF roleSection pointing straight to /workers.
    # Insert right before the closing "};" of roleSections (after PROCUREMENT_OFFICER block).
    proc_idx = find_line_index(lines, "PROCUREMENT_OFFICER: [")
    if proc_idx is None:
        print("ERROR: could not find 'PROCUREMENT_OFFICER: [' in " + LAYOUT_PATH + ". Patch manually.")
        sys.exit(1)
    close_brace_idx = None
    for i in range(proc_idx, len(lines)):
        if lines[i].strip() == "};":
            close_brace_idx = i
            break
    if close_brace_idx is None:
        print("ERROR: could not find closing '};' for roleSections. Patch manually.")
        sys.exit(1)

    new_section = (
        "\n"
        "  SUPPORT_STAFF: [\n"
        "    {\n"
        "      title: 'Overview',\n"
        "      items: [{ label: 'Dashboard', path: '/workers', icon: '\u2302' }],\n"
        "    },\n"
        "  ],\n"
    )
    lines = lines[:close_brace_idx] + [new_section] + lines[close_brace_idx:]

    with open(LAYOUT_PATH, "w") as f:
        f.writelines(lines)
    print("PATCHED " + LAYOUT_PATH + " (added SUPPORT_STAFF, dashboard points to /workers)")


def patch_redirect():
    if not os.path.isfile(REDIRECT_PATH):
        print("ERROR: '" + REDIRECT_PATH + "' not found.")
        sys.exit(1)
    with open(REDIRECT_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "SUPPORT_STAFF" in joined:
        print("SKIP  " + REDIRECT_PATH + " already patched.")
        return

    default_idx = find_line_index(lines, "default:")
    if default_idx is None:
        print("ERROR: could not find 'default:' in " + REDIRECT_PATH + ". Patch manually.")
        sys.exit(1)

    new_case = "\n    case 'SUPPORT_STAFF':\n      return <Navigate to=\"/workers\" replace />;\n"
    lines = lines[:default_idx] + [new_case] + lines[default_idx:]
    with open(REDIRECT_PATH, "w") as f:
        f.writelines(lines)
    print("PATCHED " + REDIRECT_PATH + " (added SUPPORT_STAFF -> /workers)")


def patch_admin_staff():
    if not os.path.isfile(ADMIN_STAFF_PATH):
        print("ERROR: '" + ADMIN_STAFF_PATH + "' not found.")
        sys.exit(1)
    with open(ADMIN_STAFF_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "SUPPORT_STAFF" in joined:
        print("SKIP  " + ADMIN_STAFF_PATH + " already patched.")
        return

    const_idx = find_line_index(lines, "const STAFF_ROLES = [")
    if const_idx is None:
        print("ERROR: could not find STAFF_ROLES in " + ADMIN_STAFF_PATH + ". Patch manually.")
        sys.exit(1)
    close_idx = None
    for i in range(const_idx + 1, len(lines)):
        if lines[i].strip().startswith("]"):
            close_idx = i
            break
    if close_idx is None:
        print("ERROR: could not find closing ']' for STAFF_ROLES. Patch manually.")
        sys.exit(1)
    lines = lines[:close_idx] + ["  'SUPPORT_STAFF',\n"] + lines[close_idx:]

    with open(ADMIN_STAFF_PATH, "w") as f:
        f.writelines(lines)
    print("PATCHED " + ADMIN_STAFF_PATH + " (added SUPPORT_STAFF to STAFF_ROLES)")


def main():
    patch_layout()
    patch_redirect()
    patch_admin_staff()
    print("")
    print("Done. Support staff accounts now redirect straight to the existing Workers self-service page.")


if __name__ == "__main__":
    main()
