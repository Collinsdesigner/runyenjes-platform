#!/usr/bin/env python3
"""
Two real bugs, one platform-wide and one specific:

1. PLATFORM-WIDE: callGroq's fallback used `??`, which only catches
   null/undefined -- not an empty string. If Groq ever returns
   content: "" (as it's doing here), every AI feature using callGroq
   would silently show nothing instead of a visible error. Fixed to `||`
   so an empty string now correctly falls back to a visible message.

2. SPECIFIC: suggest_document_title's prompt is simplified (the "no
   quotes, no explanation" meta-instruction may be pushing this reasoning
   model to deliberate more than needed for such a trivial task), and
   maxTokens raised further as a second safety margin.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")
AI_ROUTES_PATH = os.path.join(ROOT, "backend", "src", "routes", "ai.routes.ts")

with open(AI_ROUTES_PATH, "r", encoding="utf-8") as f:
    content = f.read()

changed = False

# ------------------------------------------------------------------
# Fix 1: callGroq fallback -- ?? does not catch empty string, || does
# ------------------------------------------------------------------
old_fallback = "  return data.choices?.[0]?.message?.content ?? 'Sorry, I could not generate a response.';\n"
new_fallback = "  return data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';\n"

count = content.count(old_fallback)
if count == 1:
    content = content.replace(old_fallback, new_fallback)
    print("[OK] callGroq fallback: ?? -> || (empty string now shows a visible message)")
    changed = True
elif count == 0:
    print("[SKIP] callGroq fallback already fixed or not found as expected")
else:
    raise SystemExit("[FAIL] callGroq fallback line appears more than once -- refusing to guess which one.")

# ------------------------------------------------------------------
# Fix 2: simplify suggest_document_title prompt + raise tokens further
# ------------------------------------------------------------------
old_task = (
    "  suggest_document_title: {\n"
    "    systemPrompt:\n"
    "      'Given a file name, suggest a short, professional document title suitable for a student\\'s "
    "academic record (for example, \"transcript_2026_final.pdf\" becomes \"Academic Transcript 2026\"). "
    "Respond with ONLY the suggested title, nothing else -- no quotes, no explanation.',\n"
    "  },\n"
)
new_task = (
    "  suggest_document_title: {\n"
    "    systemPrompt:\n"
    "      'Suggest one short, professional document title based on the file name given. "
    "For example, transcript_2026_final.pdf could become Academic Transcript 2026. Reply with just the title.',\n"
    "    maxTokens: 800,\n"
    "  },\n"
)

count = content.count(old_task)
if count == 1:
    content = content.replace(old_task, new_task)
    print("[OK] suggest_document_title: simplified prompt, maxTokens -> 800")
    changed = True
elif count == 0:
    print("[SKIP] suggest_document_title task not found in expected form (already changed?)")
else:
    raise SystemExit("[FAIL] suggest_document_title block appears more than once -- refusing to guess which one.")

if changed:
    with open(AI_ROUTES_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"\nWrote changes to {AI_ROUTES_PATH}")
else:
    print("\nNo changes made.")

print("\nDone. Next: npx tsc --noEmit in backend/, commit, push, wait for Render to redeploy, then retest.")
