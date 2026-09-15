#!/usr/bin/env python3
"""
The previous anchor likely failed due to invisible variation-selector
bytes in the emoji character (visually identical, different bytes).
This uses a regex that matches around the icon value instead of on it,
so the exact emoji bytes don't matter.
"""
import os
import re

ROOT = os.path.join(os.path.expanduser("~"), "runyenjes-platform")
PORTAL_LAYOUT_PATH = os.path.join(ROOT, "frontend", "src", "components", "portal", "PortalLayout.tsx")

with open(PORTAL_LAYOUT_PATH, "r", encoding="utf-8") as f:
    content = f.read()

if "/registrar/structure" in content:
    print("[SKIP] Nav item already present")
else:
    pattern = re.compile(
        r"(        \{ label: 'Programmes & Departments', path: '/registrar/programmes', icon: '.*?' \},\n)"
    )
    matches = pattern.findall(content)
    if len(matches) == 0:
        raise SystemExit("[FAIL] Regex still did not match -- paste `cat -A` output of that line (shows all hidden characters) so we can see exactly what's there.")
    if len(matches) > 1:
        raise SystemExit(f"[FAIL] Regex matched {len(matches)} times -- refusing to guess which one.")

    new_line = "        { label: 'Manage Academic Structure', path: '/registrar/structure', icon: '\U0001F6E0' },\n"
    content = pattern.sub(lambda m: m.group(1) + new_line, content, count=1)

    with open(PORTAL_LAYOUT_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[OK] Nav item added via regex -> {PORTAL_LAYOUT_PATH}")

print("\nDone. Next: npx tsc --noEmit in frontend/, then commit+push.")
