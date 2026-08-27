#!/usr/bin/env python3
"""
Fixes the "Continue to Home feed without logging in" button on the Login
page. It navigated to '/portal', which requires an authenticated user and
immediately redirects back to '/login' -- looking like the button does
nothing. Fixed to navigate to '/' (the actual public home feed).

USAGE (run from ~/runyenjes-platform/frontend):
    python3 fix_login_continue_button.py

Idempotent: skips if already patched.
"""

import os
import sys

TARGET = os.path.join("src", "pages", "Login.tsx")

OLD_BLOCK = """        <button
          type="button"
          onClick={() => navigate('/portal')}
          className="w-full text-center text-sm text-gray-500 mt-4 underline"
        >
          Continue to Home feed without logging in
        </button>"""

NEW_BLOCK = """        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full text-center text-sm text-gray-500 mt-4 underline"
        >
          Continue to Home feed without logging in
        </button>"""


def main():
    if not os.path.isfile(TARGET):
        print("ERROR: '" + TARGET + "' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)
    with open(TARGET, "r") as f:
        content = f.read()

    if "navigate('/')" in content and "Continue to Home feed" in content:
        print("SKIP  " + TARGET + " already patched.")
        return

    if OLD_BLOCK not in content:
        print("ERROR: could not find the expected button block in " + TARGET + ". Patch manually:")
        print("       change navigate('/portal') to navigate('/') on the 'Continue to Home feed' button.")
        sys.exit(1)

    content = content.replace(OLD_BLOCK, NEW_BLOCK)
    with open(TARGET, "w") as f:
        f.write(content)

    print("PATCHED " + TARGET + " ('Continue to Home feed' now goes to / instead of the dead-end /portal)")


if __name__ == "__main__":
    main()
