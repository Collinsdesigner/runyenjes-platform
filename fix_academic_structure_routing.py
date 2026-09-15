#!/usr/bin/env python3
"""
AcademicStructure.tsx (department/programme/unit management, now with
bulk unit import) has never had a route -- it's been dead, unreachable
code this whole time. This wires it up:
  1. App.tsx -> import + route at /registrar/structure
  2. PortalLayout.tsx -> new nav item under Academic Administration
"""
import os

ROOT = os.path.join(os.path.expanduser("~"), "runyenjes-platform")
FRONTEND = os.path.join(ROOT, "frontend", "src")
APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PORTAL_LAYOUT_PATH = os.path.join(FRONTEND, "components", "portal", "PortalLayout.tsx")


def already_applied(path, marker):
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        return marker in f.read()


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
# 1. App.tsx -- import + route
# ------------------------------------------------------------------
if already_applied(APP_TSX_PATH, "AcademicStructure"):
    print(f"[SKIP] AcademicStructure already wired into {APP_TSX_PATH}")
else:
    import_anchor = "import RegistrarProgrammes from './pages/registrar/RegistrarProgrammes';\n"
    import_new = (
        "import RegistrarProgrammes from './pages/registrar/RegistrarProgrammes';\n"
        "import AcademicStructure from './pages/registrar/AcademicStructure';\n"
    )
    replace_once(APP_TSX_PATH, import_anchor, import_new, "App.tsx import")

    route_anchor = '          <Route path="/registrar/programmes" element={<RegistrarProgrammes />} />\n'
    route_new = (
        '          <Route path="/registrar/programmes" element={<RegistrarProgrammes />} />\n'
        '                <Route path="/registrar/structure" element={<AcademicStructure />} />\n'
    )
    replace_once(APP_TSX_PATH, route_anchor, route_new, "App.tsx route")

# ------------------------------------------------------------------
# 2. PortalLayout.tsx -- new nav item
# ------------------------------------------------------------------
if already_applied(PORTAL_LAYOUT_PATH, "/registrar/structure"):
    print(f"[SKIP] Nav item already present -> {PORTAL_LAYOUT_PATH}")
else:
    anchor = "        { label: 'Programmes & Departments', path: '/registrar/programmes', icon: '🏛' },\n"
    new = (
        "        { label: 'Programmes & Departments', path: '/registrar/programmes', icon: '🏛' },\n"
        "        { label: 'Manage Academic Structure', path: '/registrar/structure', icon: '🛠' },\n"
    )
    replace_once(PORTAL_LAYOUT_PATH, anchor, new, "PortalLayout.tsx nav item")

print("\nDone. Next: npx tsc --noEmit in frontend/, then commit+push.")
