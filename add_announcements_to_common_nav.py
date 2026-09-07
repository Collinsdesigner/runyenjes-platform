#!/usr/bin/env python3
"""
Makes Announcements reachable by every logged-in role, not just Registrar/Admin:
  1. App.tsx           -> add a canonical shared route: /announcements
  2. PortalLayout.tsx  -> add "Announcements" to commonSections (shown to every role)
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")
FRONTEND = os.path.join(ROOT, "frontend", "src")

APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PORTAL_LAYOUT_PATH = os.path.join(FRONTEND, "components", "portal", "PortalLayout.tsx")


def replace_once(path, old, new, label):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    count = content.count(old)
    if count == 0:
        raise SystemExit(f"[FAIL] Anchor not found for '{label}' in {path}\n"
                          f"       Looked for:\n{old!r}")
    if count > 1:
        raise SystemExit(f"[FAIL] Anchor for '{label}' appears {count} times in {path} "
                          f"(expected exactly once) -- refusing to guess which one.")

    content = content.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[OK] {label} -> {path}")


# ------------------------------------------------------------------
# 1. App.tsx -- canonical shared route, reusing the same component
# ------------------------------------------------------------------
app_route_anchor = (
    '                <Route path="/registrar/announcements" element={<Announcements />} />\n'
)
app_route_new = (
    '                <Route path="/registrar/announcements" element={<Announcements />} />\n'
    '                <Route path="/announcements" element={<Announcements />} />\n'
)
replace_once(APP_TSX_PATH, app_route_anchor, app_route_new,
             "App.tsx shared /announcements route")

# ------------------------------------------------------------------
# 2. PortalLayout.tsx -- add to commonSections (Workspace), shown to every role
# ------------------------------------------------------------------
nav_anchor = "      { label: 'Notebook', path: '/notebook', icon: '📝' },\n"
nav_new = (
    "      { label: 'Notebook', path: '/notebook', icon: '📝' },\n"
    "      { label: 'Announcements', path: '/announcements', icon: '📢' },\n"
)
replace_once(PORTAL_LAYOUT_PATH, nav_anchor, nav_new,
             "PortalLayout.tsx commonSections nav item")

print("\nDone. Next: npx tsc --noEmit in frontend/, then check Student/Teacher/etc portals.")
