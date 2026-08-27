#!/usr/bin/env python3
"""
Fixes two PortalLayout.tsx issues:

1. Sign Out only lived inside the sidebar, which is `hidden` below the
   `md` breakpoint -- on narrower screens there was no way to sign out at
   all. Adds a Sign Out icon button to the header, always visible
   regardless of sidebar visibility.

2. Nothing was pinned -- the whole page (sidebar + header + content)
   scrolled together as one block, so the header/sidebar scrolled out of
   view on long pages like the Home feed. Fixed so the sidebar and header
   stay fixed in place and only the main content area scrolls.

USAGE (run from ~/runyenjes-platform/frontend):
    python3 fix_portal_layout_scroll_and_signout.py

Idempotent: skips already-patched pieces.
"""

import os
import sys

TARGET = os.path.join("src", "components", "portal", "PortalLayout.tsx")

REPLACEMENTS = [
    (
        '<div className="min-h-screen bg-gray-50 flex">',
        '<div className="h-screen bg-gray-50 flex overflow-hidden">',
    ),
    (
        '<aside className="hidden md:flex md:w-64 bg-white border-r border-gray-200 flex-col">',
        '<aside className="hidden md:flex md:w-64 bg-white border-r border-gray-200 flex-col h-full">',
    ),
    (
        '      <div className="flex-1 min-w-0">',
        '      <div className="flex-1 min-w-0 flex flex-col h-full">',
    ),
    (
        '<header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6">',
        '<header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6">',
    ),
    (
        '''        {/* Page */}
        <main className="p-4 md:p-6">
          {children}
        </main>''',
        '''        {/* Page */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>''',
    ),
    (
        '''              <span className="hidden sm:block text-sm font-medium text-gray-700">
                {user.name}
              </span>
            </button>

          </div>''',
        '''              <span className="hidden sm:block text-sm font-medium text-gray-700">
                {user.name}
              </span>
            </button>

            {/* Sign out -- always visible here, even when the sidebar is hidden on small screens */}
            <button
              type="button"
              onClick={handleLogout}
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition"
              aria-label="Sign out"
              title="Sign out"
            >
              🚪
            </button>

          </div>''',
    ),
]


def main():
    if not os.path.isfile(TARGET):
        print("ERROR: '" + TARGET + "' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)
    with open(TARGET, "r", encoding="utf-8") as f:
        content = f.read()

    if 'aria-label="Sign out"' in content and "overflow-y-auto p-4 md:p-6" in content:
        print("SKIP  " + TARGET + " already patched.")
        return

    applied = 0
    for old, new in REPLACEMENTS:
        if old in content:
            content = content.replace(old, new, 1)
            applied += 1
        elif new in content:
            applied += 1
        else:
            print("ERROR: could not find an expected block in " + TARGET + ":")
            print(old[:80] + ("..." if len(old) > 80 else ""))
            print("Patch manually or re-upload the current file.")
            sys.exit(1)

    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(content)

    print("PATCHED " + TARGET + " (" + str(applied) + "/6 pieces applied)")
    print(" - Sign Out now also in the header (visible on any screen size)")
    print(" - Sidebar + header now fixed; only the content area scrolls")


if __name__ == "__main__":
    main()
