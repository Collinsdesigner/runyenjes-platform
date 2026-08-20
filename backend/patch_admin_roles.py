#!/usr/bin/env python3
"""
Patches src/routes/admin.routes.ts so the admin can:
  1. Create a user directly with any of the new ERP roles
     (FINANCE_OFFICER, HR_OFFICER, EXAM_OFFICER, STORES_OFFICER), and
  2. Change an existing user's role at any time via a new
     PATCH /admin/users/:id/role endpoint.

This replaces the need for any hardcoded demo accounts for the new
roles — the admin grants/revokes them through the API (and eventually
the admin portal UI), exactly like Section 11 of the roadmap describes.

USAGE (run from ~/runyenjes-platform/backend):
    python3 patch_admin_roles.py

Idempotent: safe to re-run, it detects if the patch was already applied.
"""

import os
import sys

TARGET = os.path.join("src", "routes", "admin.routes.ts")

OLD_WHITELIST = """  if (!['TEACHER', 'ADMIN', 'REGISTRAR'].includes(role)) {
    return res.status(400).json({ error: 'Role must be TEACHER, ADMIN, or REGISTRAR' });
  }"""

NEW_WHITELIST = """  const creatableRoles = [
    'TEACHER',
    'ADMIN',
    'REGISTRAR',
    'FINANCE_OFFICER',
    'HR_OFFICER',
    'EXAM_OFFICER',
    'STORES_OFFICER',
  ];
  if (!creatableRoles.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${creatableRoles.join(', ')}` });
  }"""

# Anchor: the full "suspend or reactivate a user" route block. We insert
# the new role-assignment route immediately after it.
ANCHOR = """// ---------- Suspend or reactivate a user ----------
router.patch('/users/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ error: 'User not found' });

  const user = await prisma.user.update({
    where: { id },
    data: { status },
    select: { id: true, name: true, status: true },
  });
  res.json(user);
});"""

NEW_ROLE_ROUTE = """

// ---------- Grant or change a user's role ----------
// This is how privileges are granted/revoked from now on — through the
// platform, not by editing code or seed data. Any role, including the
// newer ERP officer roles, can be assigned here by an Admin.
router.patch('/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const assignableRoles = [
    'ADMIN',
    'REGISTRAR',
    'TEACHER',
    'STUDENT',
    'FINANCE_OFFICER',
    'HR_OFFICER',
    'EXAM_OFFICER',
    'STORES_OFFICER',
  ];
  if (!assignableRoles.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${assignableRoles.join(', ')}` });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ error: 'User not found' });

  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });

  res.json(user);
});"""


def main() -> None:
    if not os.path.isfile(TARGET):
        print(f"ERROR: '{TARGET}' not found. Run this from ~/runyenjes-platform/backend.")
        sys.exit(1)

    with open(TARGET, "r") as f:
        content = f.read()

    if "assignableRoles" in content:
        print("SKIP  admin.routes.ts already has the role-assignment endpoint — assuming already patched.")
        return

    if OLD_WHITELIST not in content:
        print("ERROR: could not find the expected role whitelist block to patch.")
        print("       The file may already differ from what this script expects — patch manually.")
        sys.exit(1)
    content = content.replace(OLD_WHITELIST, NEW_WHITELIST)

    if ANCHOR not in content:
        print("ERROR: could not find the expected 'suspend/reactivate user' block to anchor on.")
        print("       Patch manually — insert the role-assignment route yourself.")
        sys.exit(1)
    content = content.replace(ANCHOR, ANCHOR + NEW_ROLE_ROUTE)

    with open(TARGET, "w") as f:
        f.write(content)

    print(f"PATCHED {TARGET}")
    print(" - POST /users now accepts FINANCE_OFFICER, HR_OFFICER, EXAM_OFFICER, STORES_OFFICER")
    print(" - Added PATCH /users/:id/role for granting/changing any user's role")


if __name__ == "__main__":
    main()
