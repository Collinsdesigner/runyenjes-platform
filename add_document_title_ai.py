#!/usr/bin/env python3
"""
Adds an AI title-suggestion to Registrar -> Student Documents:
  1. ai.routes.ts    -> new 'suggest_document_title' text-assist task
  2. AIAssistBox.tsx -> widen the task prop type to include it
  3. RegistrarDocuments.tsx -> wire in AIAssistBox after the file input

Reuses the existing /ai/text-assist endpoint and <AIAssistBox> component
built earlier -- no new infrastructure, just a new task.
Safe to re-run: every step checks whether it was already applied first.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

AI_ROUTES_PATH = os.path.join(ROOT, "backend", "src", "routes", "ai.routes.ts")
AI_ASSIST_BOX_PATH = os.path.join(ROOT, "frontend", "src", "components", "ai", "AIAssistBox.tsx")
DOCUMENTS_PAGE_PATH = os.path.join(ROOT, "frontend", "src", "pages", "registrar", "RegistrarDocuments.tsx")


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
# 1. ai.routes.ts -- new text-assist task
# ------------------------------------------------------------------
if already_applied(AI_ROUTES_PATH, "suggest_document_title"):
    print(f"[SKIP] suggest_document_title already present -> {AI_ROUTES_PATH}")
else:
    anchor = (
        "  draft_announcement: {\n"
        "    systemPrompt:\n"
        "      'Turn the following rough bullet points into a clear, professional announcement for a TVET "
        "college community (students and staff). Keep it concise, warm, and easy to read. Do not invent "
        "details not implied by the input.',\n"
        "  },\n"
        "};\n"
    )
    new_block = (
        "  draft_announcement: {\n"
        "    systemPrompt:\n"
        "      'Turn the following rough bullet points into a clear, professional announcement for a TVET "
        "college community (students and staff). Keep it concise, warm, and easy to read. Do not invent "
        "details not implied by the input.',\n"
        "  },\n"
        "  suggest_document_title: {\n"
        "    systemPrompt:\n"
        "      'Given a file name, suggest a short, professional document title suitable for a student\\'s "
        "academic record (for example, \"transcript_2026_final.pdf\" becomes \"Academic Transcript 2026\"). "
        "Respond with ONLY the suggested title, nothing else -- no quotes, no explanation.',\n"
        "    maxTokens: 30,\n"
        "  },\n"
        "};\n"
    )
    replace_once(AI_ROUTES_PATH, anchor, new_block, "ai.routes.ts suggest_document_title task")

# ------------------------------------------------------------------
# 2. AIAssistBox.tsx -- widen task type
# ------------------------------------------------------------------
if already_applied(AI_ASSIST_BOX_PATH, "suggest_document_title"):
    print(f"[SKIP] AIAssistBox task type already widened -> {AI_ASSIST_BOX_PATH}")
else:
    anchor = "  task: 'summarize' | 'improve' | 'expand' | 'draft_announcement';\n"
    new = "  task: 'summarize' | 'improve' | 'expand' | 'draft_announcement' | 'suggest_document_title';\n"
    replace_once(AI_ASSIST_BOX_PATH, anchor, new, "AIAssistBox.tsx task type")

# ------------------------------------------------------------------
# 3. RegistrarDocuments.tsx -- wire in AIAssistBox
# ------------------------------------------------------------------
if already_applied(DOCUMENTS_PAGE_PATH, "AIAssistBox"):
    print(f"[SKIP] AIAssistBox already wired into {DOCUMENTS_PAGE_PATH}")
else:
    import_anchor = "import { api, uploadStudentDocument } from '../../api/client';\n"
    import_new = (
        "import { api, uploadStudentDocument } from '../../api/client';\n"
        "import AIAssistBox from '../../components/ai/AIAssistBox';\n"
    )
    replace_once(DOCUMENTS_PAGE_PATH, import_anchor, import_new, "RegistrarDocuments.tsx AIAssistBox import")

    jsx_anchor = '''              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-sm"
              />
'''
    jsx_new = jsx_anchor + '''
              {file && (
                <AIAssistBox
                  task="suggest_document_title"
                  label="Suggest title from filename"
                  getInput={() => file.name}
                  onApply={(result) => setTitle(result)}
                  emptyMessage="Choose a file first."
                />
              )}
'''
    replace_once(DOCUMENTS_PAGE_PATH, jsx_anchor, jsx_new, "RegistrarDocuments.tsx AIAssistBox render")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/ (no migration needed -- no schema change).")
