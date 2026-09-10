#!/usr/bin/env python3
"""
Sidesteps the broken 'suggest_document_title' task entirely:
  1. Auto-fill the title instantly from the filename using plain JS
     (strip extension, replace _/- with spaces, title-case) -- no AI
     call needed for the baseline, so it can never fail.
  2. Repurpose the AIAssistBox to use the already-proven-working 'improve'
     task (same one Notebook uses successfully) to let AI polish that
     title further, instead of the task-specific prompt that keeps
     returning empty content for this input shape.

Frontend-only change -- no backend edits, no migration.
"""
import os

ROOT = os.path.join(os.path.expanduser("~"), "runyenjes-platform")
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


if already_applied(DOCUMENTS_PAGE_PATH, "titleFromFilename"):
    print(f"[SKIP] Already applied -> {DOCUMENTS_PAGE_PATH}")
else:
    # 1. Add the helper function and auto-fill logic
    handler_anchor = "export default function RegistrarDocuments() {\n"
    handler_new = (
        "function titleFromFilename(filename: string): string {\n"
        "  const base = filename.replace(/\\.[^/.]+$/, '');\n"
        "  const spaced = base.replace(/[_-]+/g, ' ').replace(/\\s+/g, ' ').trim();\n"
        "  return spaced.replace(/\\w\\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());\n"
        "}\n\n"
        "export default function RegistrarDocuments() {\n"
    )
    replace_once(DOCUMENTS_PAGE_PATH, handler_anchor, handler_new, "titleFromFilename helper")

    # 2. Auto-fill title when a file is chosen (only if title is currently empty)
    file_input_anchor = (
        '                onChange={(e) => setFile(e.target.files?.[0] || null)}\n'
    )
    file_input_new = (
        '                onChange={(e) => {\n'
        '                  const chosen = e.target.files?.[0] || null;\n'
        '                  setFile(chosen);\n'
        '                  if (chosen && !title.trim()) setTitle(titleFromFilename(chosen.name));\n'
        '                }}\n'
    )
    replace_once(DOCUMENTS_PAGE_PATH, file_input_anchor, file_input_new, "auto-fill title on file select")

    # 3. Point AIAssistBox at the proven-working 'improve' task, operating on the title field
    box_anchor = '''              {file && (
                <AIAssistBox
                  task="suggest_document_title"
                  label="Suggest title from filename"
                  getInput={() => file.name}
                  onApply={(result) => setTitle(result)}
                  emptyMessage="Choose a file first."
                />
              )}
'''
    box_new = '''              {title && (
                <AIAssistBox
                  task="improve"
                  label="Ask AI to polish this title"
                  getInput={() => title}
                  onApply={(result) => setTitle(result)}
                  emptyMessage="Type or auto-fill a title first."
                />
              )}
'''
    replace_once(DOCUMENTS_PAGE_PATH, box_anchor, box_new, "AIAssistBox switched to 'improve' task")

print("\nDone. Next: npx tsc --noEmit in frontend/ (no backend change, no migration).")
