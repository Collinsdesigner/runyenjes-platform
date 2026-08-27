#!/usr/bin/env python3
"""
Adds a 'Home Feed' link (path: '/') to the shared Workspace nav section
that every logged-in role already sees, so nobody has to sign out just to
check the public home feed.

USAGE (run from ~/runyenjes-platform/frontend):
    python3 patch_home_feed_nav_link.py

Idempotent: skips if already patched.
"""

import os
import sys

LAYOUT_PATH = os.path.join("src", "components", "portal", "PortalLayout.tsx")


def main():
    if not os.path.isfile(LAYOUT_PATH):
        print("ERROR: '" + LAYOUT_PATH + "' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)
    with open(LAYOUT_PATH, "r") as f:
        content = f.read()

    if "Home Feed" in content:
        print("SKIP  " + LAYOUT_PATH + " already has a Home Feed link.")
        return

    anchor = "{ label: 'AI Assistant', path: '/ai', icon: '\u2726' },"
    if anchor not in content:
        print("ERROR: could not find the AI Assistant nav item in " + LAYOUT_PATH + ". Patch manually.")
        print("       Add: { label: 'Home Feed', path: '/', icon: '\U0001f3e0' }, to the Workspace section.")
        sys.exit(1)

    new_line = "{ label: 'Home Feed', path: '/', icon: '\U0001f3e0' },\n      "
    content = content.replace(anchor, new_line + anchor, 1)

    with open(LAYOUT_PATH, "w") as f:
        f.write(content)
    print("PATCHED " + LAYOUT_PATH + " (added Home Feed link, visible to every logged-in role)")


if __name__ == "__main__":
    main()
