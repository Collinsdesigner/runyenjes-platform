#!/usr/bin/env python3
"""
100 tokens still wasn't enough -- gpt-oss-120b via Groq can burn a large,
variable amount of its token budget on internal reasoning before writing
the visible answer, and none of that counts toward `content`. Rather than
guess another number, remove the custom maxTokens entirely so this task
falls back to the endpoint's default of 600 -- the same budget
'draft_announcement' uses, which is already confirmed working.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")
AI_ROUTES_PATH = os.path.join(ROOT, "backend", "src", "routes", "ai.routes.ts")

with open(AI_ROUTES_PATH, "r", encoding="utf-8") as f:
    content = f.read()

old = (
    "'Respond with ONLY the suggested title, nothing else -- no quotes, no explanation.',\n"
    "    maxTokens: 100,\n"
)
new = (
    "'Respond with ONLY the suggested title, nothing else -- no quotes, no explanation.',\n"
)

count = content.count(old)
if count == 0:
    if "maxTokens: 100,\n" not in content and "suggest_document_title" in content:
        print("[SKIP] maxTokens override already removed")
    else:
        raise SystemExit("[FAIL] Could not find the maxTokens: 100 line to remove -- paste `grep -n maxTokens ai.routes.ts` output.")
elif count > 1:
    raise SystemExit("[FAIL] Anchor appears more than once -- refusing to guess which one.")
else:
    content = content.replace(old, new)
    with open(AI_ROUTES_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[OK] Removed maxTokens override for suggest_document_title (now defaults to 600) -> {AI_ROUTES_PATH}")

print("\nDone. Next: npx tsc --noEmit in backend/, commit, push, wait for Render to redeploy, then retest.")
