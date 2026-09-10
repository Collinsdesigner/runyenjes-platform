#!/usr/bin/env python3
"""
Fixes both real remaining issues, using the EXACT text just confirmed via
grep (not an assumption about prior scripts having succeeded):

1. ai.routes.ts still has the very first version: maxTokens: 30 and a
   prompt framed around "given a file name" -- but the frontend actually
   sends the auto-generated TITLE as input now, not a raw filename, so
   the prompt no longer even matches how it's used. Rewritten to match
   reality and forbid clarifying questions.

2. RegistrarDocuments.tsx is still pointed at task="improve" (never
   switched back), which is why it keeps behaving like the generic
   rewrite-a-paragraph task. Switched to "suggest_document_title".
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
                          f"       Looked for:\n{old!r}\n"
                          f"       Run: grep -n '<a unique nearby phrase>' {path} and paste the output.")
    if count > 1:
        raise SystemExit(f"[FAIL] Anchor for '{label}' appears {count} times in {path} "
                          f"(expected exactly once) -- refusing to guess which one.")

    content = content.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[OK] {label} -> {path}")


# ------------------------------------------------------------------
# 1. ai.routes.ts -- exact text confirmed via grep just now
# ------------------------------------------------------------------
old_task = (
    "  suggest_document_title: {\n"
    "    systemPrompt:\n"
    "      'Given a file name, suggest a short, professional document title suitable for a student\\'s "
    "academic record (for example, \"transcript_2026_final.pdf\" becomes \"Academic Transcript 2026\"). "
    "Respond with ONLY the suggested title, nothing else -- no quotes, no explanation.',\n"
    "    maxTokens: 30,\n"
    "  },\n"
)
new_task = (
    "  suggest_document_title: {\n"
    "    systemPrompt:\n"
    "      'You polish short document titles for a student records system. The user message is a complete, "
    "already-existing title (a few words) -- treat it as the entire input, not a fragment, and there is "
    "nothing else to wait for. Reply with ONLY an improved, more professional version of that exact title. "
    "Never ask a question, never request more text, never add commentary -- output only the improved title.',\n"
    "    maxTokens: 200,\n"
    "  },\n"
)
replace_once(AI_ROUTES_PATH, old_task, new_task, "suggest_document_title prompt rewrite (confirmed anchor)")

# ------------------------------------------------------------------
# 2. RegistrarDocuments.tsx -- exact text confirmed via grep just now
# ------------------------------------------------------------------
old_box = (
    '                <AIAssistBox\n'
    '                  task="improve"\n'
    '                  label="Ask AI to polish this title"\n'
    '                  getInput={() => title}\n'
    '                  onApply={(result) => setTitle(result)}\n'
    '                  emptyMessage="Type or auto-fill a title first."\n'
    '                />\n'
)
new_box = (
    '                <AIAssistBox\n'
    '                  task="suggest_document_title"\n'
    '                  label="Ask AI to polish this title"\n'
    '                  getInput={() => title}\n'
    '                  onApply={(result) => setTitle(result)}\n'
    '                  emptyMessage="Type or auto-fill a title first."\n'
    '                />\n'
)
replace_once(DOCUMENTS_PAGE_PATH, old_box, new_box, "AIAssistBox task switched to suggest_document_title (confirmed anchor)")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/, commit, push, wait for Render, retest.")
