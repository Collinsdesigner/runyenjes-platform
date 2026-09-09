#!/usr/bin/env python3
"""
Fixes the empty-reply bug on suggest_document_title: maxTokens: 30 was too
low -- openai/gpt-oss-120b can spend part of its budget on internal
reasoning before the visible answer, so a 30-token cap sometimes left
nothing but an empty string. Raised to 100.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")
AI_ROUTES_PATH = os.path.join(ROOT, "backend", "src", "routes", "ai.routes.ts")

with open(AI_ROUTES_PATH, "r", encoding="utf-8") as f:
    content = f.read()

old = (
    "'Respond with ONLY the suggested title, nothing else -- no quotes, no explanation.',\n"
    "    maxTokens: 30,\n"
)
new = (
    "'Respond with ONLY the suggested title, nothing else -- no quotes, no explanation.',\n"
    "    maxTokens: 100,\n"
)

count = content.count(old)
if count == 0:
    if "maxTokens: 100,\n  },\n};\n" in content or "suggest_document_title" not in content:
        raise SystemExit("[FAIL] Could not find the maxTokens: 30 line to fix -- paste `grep -n maxTokens ai.routes.ts` output.")
    else:
        print("[SKIP] Already fixed (maxTokens is no longer 30)")
elif count > 1:
    raise SystemExit("[FAIL] Anchor appears more than once -- refusing to guess which one.")
else:
    content = content.replace(old, new)
    with open(AI_ROUTES_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[OK] maxTokens 30 -> 100 for suggest_document_title -> {AI_ROUTES_PATH}")

print("\nDone. Next: npx tsc --noEmit in backend/, commit, push, then retest in the browser (Render needs to redeploy first).")
