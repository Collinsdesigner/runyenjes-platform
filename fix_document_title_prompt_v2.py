#!/usr/bin/env python3
"""
'improve' correctly returned real text (confirming reasoning_effort: low
fixed the actual bug) -- but its prompt assumes a full paragraph to
rewrite, so given only a short title, the model asked for more content
instead of just polishing the title. Fix: rewrite suggest_document_title's
prompt to be explicit that a short title IS the complete input, with no
questions allowed -- then point the frontend back at it.
"""
import os

ROOT = os.path.join(os.path.expanduser("~"), "runyenjes-platform")
AI_ROUTES_PATH = os.path.join(ROOT, "backend", "src", "routes", "ai.routes.ts")
DOCUMENTS_PAGE_PATH = os.path.join(ROOT, "frontend", "src", "pages", "registrar", "RegistrarDocuments.tsx")


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
# 1. ai.routes.ts -- rewrite the prompt to remove all ambiguity
# ------------------------------------------------------------------
old_task = (
    "  suggest_document_title: {\n"
    "    systemPrompt:\n"
    "      'Suggest one short, professional document title based on the file name given. "
    "For example, transcript_2026_final.pdf could become Academic Transcript 2026. Reply with just the title.',\n"
    "    maxTokens: 800,\n"
    "  },\n"
)
new_task = (
    "  suggest_document_title: {\n"
    "    systemPrompt:\n"
    "      'You polish short document titles for a student records system. The user message is a complete, "
    "already-existing title (a few words) -- it is the entire input, not a fragment, and there is nothing "
    "else to wait for. Reply with ONLY an improved, more professional version of that exact title. Never ask "
    "a question, never request more text, never add commentary -- output only the improved title.',\n"
    "    maxTokens: 800,\n"
    "  },\n"
)

with open(AI_ROUTES_PATH, "r", encoding="utf-8") as f:
    ai_content = f.read()

if new_task in ai_content:
    print(f"[SKIP] Prompt already updated -> {AI_ROUTES_PATH}")
else:
    replace_once(AI_ROUTES_PATH, old_task, new_task, "suggest_document_title prompt rewrite")

# ------------------------------------------------------------------
# 2. RegistrarDocuments.tsx -- point AIAssistBox back at this task
# ------------------------------------------------------------------
old_box = '''              {title && (
                <AIAssistBox
                  task="improve"
                  label="Ask AI to polish this title"
                  getInput={() => title}
                  onApply={(result) => setTitle(result)}
                  emptyMessage="Type or auto-fill a title first."
                />
              )}
'''
new_box = '''              {title && (
                <AIAssistBox
                  task="suggest_document_title"
                  label="Ask AI to polish this title"
                  getInput={() => title}
                  onApply={(result) => setTitle(result)}
                  emptyMessage="Type or auto-fill a title first."
                />
              )}
'''

with open(DOCUMENTS_PAGE_PATH, "r", encoding="utf-8") as f:
    page_content = f.read()

if new_box in page_content:
    print(f"[SKIP] Already pointed at suggest_document_title -> {DOCUMENTS_PAGE_PATH}")
else:
    replace_once(DOCUMENTS_PAGE_PATH, old_box, new_box, "AIAssistBox task switched back to suggest_document_title")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/, commit, push, wait for Render, retest.")
