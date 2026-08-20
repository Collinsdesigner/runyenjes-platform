#!/usr/bin/env python3
"""
Patches src/routes/hr.routes.ts to add GET /hr/my-staff-profile — lets any
authenticated staff member view their own StaffProfile. Currently only
HR_OFFICER/ADMIN can view a profile (via GET /hr/staff/:id), which isn't
usable for a general staff self-service page.

USAGE (run from ~/runyenjes-platform/backend):
    python3 patch_hr_self_service.py

Idempotent: skips if already patched.
"""

import os
import sys

TARGET = os.path.join("src", "routes", "hr.routes.ts")

ANCHOR = "const router = Router();"

NEW_ROUTE = """

// ---------- Any authenticated staff member: view own staff profile ----------
router.get('/my-staff-profile', requireAuth, async (req, res) => {
  const profile = await prisma.staffProfile.findUnique({ where: { userId: req.user!.userId } });
  if (!profile) return res.status(404).json({ error: 'No staff profile found for your account yet' });
  res.json(profile);
});
"""


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
    if "my-staff-profile" in joined:
        print("SKIP  " + TARGET + " already patched.")
        return

    anchor_idx = find_line_index(lines, ANCHOR)
    if anchor_idx is None:
        print("ERROR: could not find 'const router = Router();' in " + TARGET + ". Patch manually.")
        sys.exit(1)

    lines = lines[: anchor_idx + 1] + [NEW_ROUTE] + lines[anchor_idx + 1 :]
    with open(TARGET, "w") as f:
        f.writelines(lines)
    print("PATCHED " + TARGET + " (added GET /hr/my-staff-profile)")


if __name__ == "__main__":
    main()
