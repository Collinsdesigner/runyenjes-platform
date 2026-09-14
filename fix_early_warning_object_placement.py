#!/usr/bin/env python3
"""
The last script anchored on the route comment AFTER ASSIST_ACTIONS' closing
'};', not on the closing brace itself -- so teacher_early_warning_summary
ended up sitting outside the object as an orphaned block (invalid syntax).
Fix: move the '};' to after the new block instead of before it.
"""
import os

ROOT = os.path.join(os.path.expanduser("~"), "runyenjes-platform")
AI_ROUTES_PATH = os.path.join(ROOT, "backend", "src", "routes", "ai.routes.ts")

with open(AI_ROUTES_PATH, "r", encoding="utf-8") as f:
    content = f.read()

changed = False

# Step 1: remove the erroneous '};' that currently closes the object
# too early, right before our new block starts.
old1 = "};\n\n  teacher_early_warning_summary: {"
new1 = "  teacher_early_warning_summary: {"
count1 = content.count(old1)
if count1 == 1:
    content = content.replace(old1, new1)
    print("[OK] Removed premature '};' before teacher_early_warning_summary")
    changed = True
elif count1 == 0:
    print("[SKIP] Premature '};' not found (already fixed?)")
else:
    raise SystemExit("[FAIL] That pattern appears more than once -- refusing to guess which one.")

# Step 2: add '};' back in the correct place -- right after our new
# block's closing '},', before the route comment.
old2 = "  },\n\n// ---------- Role-specific one-click AI assist actions ----------\n"
new2 = "  },\n};\n\n// ---------- Role-specific one-click AI assist actions ----------\n"
count2 = content.count(old2)
if count2 == 1:
    content = content.replace(old2, new2)
    print("[OK] Added '};' back in the correct place, closing the object properly")
    changed = True
elif count2 == 0:
    print("[SKIP] Target closing point not found (already fixed?)")
else:
    raise SystemExit("[FAIL] That pattern appears more than once -- refusing to guess which one.")

if changed:
    with open(AI_ROUTES_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"\nWrote changes to {AI_ROUTES_PATH}")

print("\nDone. Next: npx tsc --noEmit in backend/, then commit+push.")
