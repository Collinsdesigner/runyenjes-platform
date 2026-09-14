#!/usr/bin/env python3
"""
JSX attribute strings (placeholder='...') don't support backslash escapes
the way JS string literals do -- \\' terminated the string early. Fixed
by rewording the example to avoid an apostrophe entirely.
"""
import os

ROOT = os.path.join(os.path.expanduser("~"), "runyenjes-platform")
PAGE_PATH = os.path.join(ROOT, "frontend", "src", "pages", "teacher", "TeacherContentGenerator.tsx")

with open(PAGE_PATH, "r", encoding="utf-8") as f:
    content = f.read()

old = "placeholder='Topic (e.g. \"Introduction to Ohm\\'s Law\")'"
new = 'placeholder=\'Topic (e.g. "Introduction to Newtons Second Law")\''

count = content.count(old)
if count == 0:
    if new in content:
        print("[SKIP] Already fixed")
    else:
        raise SystemExit("[FAIL] Could not find the broken placeholder line -- paste `grep -n placeholder= TeacherContentGenerator.tsx` output.")
elif count > 1:
    raise SystemExit("[FAIL] That line appears more than once -- refusing to guess which one.")
else:
    content = content.replace(old, new)
    with open(PAGE_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[OK] Fixed placeholder apostrophe issue -> {PAGE_PATH}")

print("\nDone. Next: npx tsc --noEmit in frontend/, then commit+push.")
