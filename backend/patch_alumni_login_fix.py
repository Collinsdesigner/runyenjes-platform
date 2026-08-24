#!/usr/bin/env python3
"""
CRITICAL FIX: /auth/student-login only accepted role === 'STUDENT'. Once
graduate/:studentId changes a user's role to ALUMNI, their email +
admission number (unchanged) would be rejected -- permanently locking
them out, since staff-login requires a password they never had, and
reset-password refuses to set a first password for someone who doesn't
already have one.

This patches student-login to also accept ALUMNI, so a graduated user
keeps logging in exactly the way they always did.

USAGE (run from ~/runyenjes-platform/backend):
    python3 patch_alumni_login_fix.py

Idempotent: skips if already patched.
"""

import os
import sys

TARGET = os.path.join("src", "routes", "auth.routes.ts")

OLD_CHECK = """    if (
      !user ||
      user.role !== 'STUDENT' ||
      user.admissionNumber !== admissionNumber
    ) {"""

NEW_CHECK = """    if (
      !user ||
      (user.role !== 'STUDENT' && user.role !== 'ALUMNI') ||
      user.admissionNumber !== admissionNumber
    ) {"""


def main():
    if not os.path.isfile(TARGET):
        print("ERROR: '" + TARGET + "' not found. Run this from ~/runyenjes-platform/backend.")
        sys.exit(1)
    with open(TARGET, "r") as f:
        content = f.read()

    if "role !== 'ALUMNI'" in content:
        print("SKIP  " + TARGET + " already patched.")
        return

    if OLD_CHECK not in content:
        print("ERROR: could not find the expected student-login role check in " + TARGET + ".")
        print("       The file may differ from what this script expects -- patch manually:")
        print("       change `user.role !== 'STUDENT'` to also allow `'ALUMNI'`.")
        sys.exit(1)

    content = content.replace(OLD_CHECK, NEW_CHECK)
    with open(TARGET, "w") as f:
        f.write(content)

    print("PATCHED " + TARGET + " (ALUMNI can now log in via student-login, same as before graduating)")


if __name__ == "__main__":
    main()
