#!/usr/bin/env python3
"""
Two real bugs from the last script:
1. ai.routes.ts: draft_letter's systemPrompt was written as adjacent
   string literals with no `+` between them -- valid in Python (where
   adjacent strings auto-concatenate), invalid in TypeScript. Fixed by
   adding explicit `+` at the end of each line.
2. AIAssistBox.tsx: task type union was never widened to include
   'draft_letter'. Fixed.
"""
import os

ROOT = os.path.join(os.path.expanduser("~"), "runyenjes-platform")
AI_ROUTES_PATH = os.path.join(ROOT, "backend", "src", "routes", "ai.routes.ts")
AI_ASSIST_BOX_PATH = os.path.join(ROOT, "frontend", "src", "components", "ai", "AIAssistBox.tsx")


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
# 1. ai.routes.ts -- fix missing + operators
# ------------------------------------------------------------------
old_block = (
    "  draft_letter: {\n"
    "    systemPrompt:\n"
    "      'Turn the following rough notes into a clear, formal letter/certificate body for a TVET college '\n"
    "      'registrar to issue to a student. Keep it professional and appropriately formal. Do not invent facts '\n"
    "      'not implied by the input. Do not include a greeting/salutation or signature block -- just the body '\n"
    "      'text itself.',\n"
    "  },\n"
)
new_block = (
    "  draft_letter: {\n"
    "    systemPrompt:\n"
    "      'Turn the following rough notes into a clear, formal letter/certificate body for a TVET college ' +\n"
    "      'registrar to issue to a student. Keep it professional and appropriately formal. Do not invent facts ' +\n"
    "      'not implied by the input. Do not include a greeting/salutation or signature block -- just the body ' +\n"
    "      'text itself.',\n"
    "  },\n"
)

with open(AI_ROUTES_PATH, "r", encoding="utf-8") as f:
    ai_content = f.read()

if new_block in ai_content:
    print(f"[SKIP] draft_letter already fixed -> {AI_ROUTES_PATH}")
else:
    replace_once(AI_ROUTES_PATH, old_block, new_block, "ai.routes.ts draft_letter string concatenation fix")

# ------------------------------------------------------------------
# 2. AIAssistBox.tsx -- widen task type
# ------------------------------------------------------------------
old_type = "  task: 'summarize' | 'improve' | 'expand' | 'draft_announcement' | 'suggest_document_title';\n"
new_type = "  task: 'summarize' | 'improve' | 'expand' | 'draft_announcement' | 'suggest_document_title' | 'draft_letter';\n"

with open(AI_ASSIST_BOX_PATH, "r", encoding="utf-8") as f:
    box_content = f.read()

if new_type in box_content:
    print(f"[SKIP] AIAssistBox task type already widened -> {AI_ASSIST_BOX_PATH}")
else:
    replace_once(AI_ASSIST_BOX_PATH, old_type, new_type, "AIAssistBox.tsx task type widened for draft_letter")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/, then commit+push.")
