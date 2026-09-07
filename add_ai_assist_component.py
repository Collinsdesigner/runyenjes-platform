#!/usr/bin/env python3
"""
Adds a reusable AI-assist capability:
  1. backend ai.routes.ts     -> new POST /ai/text-assist endpoint (free-text tasks)
  2. frontend AIAssistBox.tsx -> new reusable component
  3. Notebook.tsx             -> wired in (summarize / improve a note)
  4. Announcements.tsx        -> wired in (draft an announcement from bullets, posters only)

Safe to re-run: every step checks whether it was already applied before
touching a file, so an interrupted run (e.g. DB cold-start) can't duplicate
content the way the earlier notebook script did.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

BACKEND = os.path.join(ROOT, "backend", "src")
FRONTEND = os.path.join(ROOT, "frontend", "src")

AI_ROUTES_PATH = os.path.join(BACKEND, "routes", "ai.routes.ts")
AI_COMPONENT_DIR = os.path.join(FRONTEND, "components", "ai")
NOTEBOOK_PATH = os.path.join(FRONTEND, "pages", "notebook", "Notebook.tsx")
ANNOUNCEMENTS_PATH = os.path.join(FRONTEND, "pages", "announcements", "Announcements.tsx")


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
# 1. backend ai.routes.ts -- new /ai/text-assist endpoint
# ------------------------------------------------------------------
if already_applied(AI_ROUTES_PATH, "TEXT_ASSIST_TASKS"):
    print(f"[SKIP] /ai/text-assist already present -> {AI_ROUTES_PATH}")
else:
    anchor = "export default router;\n"
    new_block = '''// ─────────────────────────────────────────────
// AI TEXT ASSIST: reusable free-text helper (no DB context needed)
// ─────────────────────────────────────────────
// Unlike the quick actions above (which pull the user's own DB records),
// this takes whatever text the user typed and transforms it. Used by the
// reusable <AIAssistBox> component wherever a textarea could use AI help
// (Notebook, Announcements, and future tabs). Always a suggestion the
// user reviews and applies themselves -- nothing is auto-saved here.

const TEXT_ASSIST_TASKS: Record<string, { systemPrompt: string; maxTokens?: number }> = {
  summarize: {
    systemPrompt:
      'Summarize the following text into a few short, clear bullet points. Keep only the key ideas, nothing else.',
  },
  improve: {
    systemPrompt:
      'Rewrite the following text to be clearer, more polished, and well-organized, while keeping the same meaning, facts, and tone. Do not add new information.',
  },
  expand: {
    systemPrompt:
      'Expand the following rough notes/draft into fuller, well-organized prose, staying faithful to the original intent. Do not invent facts not implied by the original.',
  },
  draft_announcement: {
    systemPrompt:
      'Turn the following rough bullet points into a clear, professional announcement for a TVET college community (students and staff). Keep it concise, warm, and easy to read. Do not invent details not implied by the input.',
  },
};

router.post('/text-assist', requireAuth, async (req, res) => {
  const { task, input } = req.body;

  const taskDef = TEXT_ASSIST_TASKS[task];
  if (!taskDef) {
    return res.status(400).json({ error: 'Unknown text-assist task' });
  }
  if (!input || !input.trim()) {
    return res.status(400).json({ error: 'input is required' });
  }

  try {
    const reply = await callGroq(taskDef.systemPrompt, input.trim(), taskDef.maxTokens || 600);
    res.json({ reply });
  } catch (err) {
    handleGroqError(err, res);
  }
});

export default router;
'''
    replace_once(AI_ROUTES_PATH, anchor, new_block, "ai.routes.ts /ai/text-assist endpoint")

# ------------------------------------------------------------------
# 2. frontend AIAssistBox.tsx -- new reusable component
# ------------------------------------------------------------------
os.makedirs(AI_COMPONENT_DIR, exist_ok=True)
component_path = os.path.join(AI_COMPONENT_DIR, "AIAssistBox.tsx")

if os.path.exists(component_path):
    print(f"[SKIP] {component_path} already exists -- not overwriting")
else:
    component_content = '''import { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface AIAssistBoxProps {
  task: 'summarize' | 'improve' | 'expand' | 'draft_announcement';
  getInput: () => string;
  onApply: (result: string) => void;
  label?: string;
  emptyMessage?: string;
}

/**
 * Reusable "Ask AI" helper for any textarea-based tab. Sends whatever
 * getInput() returns to POST /ai/text-assist, shows the result, and lets
 * the user explicitly apply it via onApply -- nothing is auto-saved or
 * auto-applied. Safe to drop into any page (Notebook, Announcements,
 * future tabs) without duplicating this logic each time.
 */
export default function AIAssistBox({ task, getInput, onApply, label, emptyMessage }: AIAssistBoxProps) {
  const { token } = useAuth();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  async function handleAsk() {
    const input = getInput();
    if (!input || !input.trim()) {
      setError(emptyMessage || 'Write something first, then ask AI.');
      return;
    }

    setLoading(true);
    setError('');
    setResult('');
    try {
      const data = await api('/ai/text-assist', {
        method: 'POST',
        token,
        body: { task, input },
      });
      setResult(data.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI assist is unavailable right now');
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    onApply(result);
    setResult('');
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
      <button
        type="button"
        onClick={handleAsk}
        disabled={loading}
        className="text-xs font-medium text-rgreen disabled:opacity-50"
      >
        {loading ? 'Thinking...' : `✦ ${label || 'Ask AI'}`}
      </button>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {result && (
        <div className="space-y-2">
          <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded-lg p-3">
            {result}
          </p>
          <div className="space-x-3">
            <button type="button" onClick={handleApply} className="text-xs font-medium text-rgreen">
              Use this
            </button>
            <button type="button" onClick={() => setResult('')} className="text-xs font-medium text-gray-500">
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
'''
    with open(component_path, "w", encoding="utf-8") as f:
        f.write(component_content)
    print(f"[OK] Created {component_path}")

# ------------------------------------------------------------------
# 3. Notebook.tsx -- wire in AIAssistBox (summarize / improve the note)
# ------------------------------------------------------------------
if already_applied(NOTEBOOK_PATH, "AIAssistBox"):
    print(f"[SKIP] AIAssistBox already wired into {NOTEBOOK_PATH}")
else:
    nb_import_anchor = "import { useAuth } from '../../context/AuthContext';\n"
    nb_import_new = (
        "import { useAuth } from '../../context/AuthContext';\n"
        "import AIAssistBox from '../../components/ai/AIAssistBox';\n"
    )
    replace_once(NOTEBOOK_PATH, nb_import_anchor, nb_import_new, "Notebook.tsx AIAssistBox import")

    nb_jsx_anchor = '''            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Write your note here..."
              rows={12}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
'''
    nb_jsx_new = nb_jsx_anchor + '''
            <AIAssistBox
              task="improve"
              label="Ask AI to clean up or summarize this note"
              getInput={() => content}
              onApply={(result) => setContent(result)}
              emptyMessage="Write your note first, then ask AI."
            />
'''
    replace_once(NOTEBOOK_PATH, nb_jsx_anchor, nb_jsx_new, "Notebook.tsx AIAssistBox render")

# ------------------------------------------------------------------
# 4. Announcements.tsx -- wire in AIAssistBox (draft from bullets, posters only)
# ------------------------------------------------------------------
if already_applied(ANNOUNCEMENTS_PATH, "AIAssistBox"):
    print(f"[SKIP] AIAssistBox already wired into {ANNOUNCEMENTS_PATH}")
else:
    an_import_anchor = "import { useAuth } from '../../context/AuthContext';\n"
    an_import_new = (
        "import { useAuth } from '../../context/AuthContext';\n"
        "import AIAssistBox from '../../components/ai/AIAssistBox';\n"
    )
    replace_once(ANNOUNCEMENTS_PATH, an_import_anchor, an_import_new, "Announcements.tsx AIAssistBox import")

    an_jsx_anchor = '''            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Announcement body"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
'''
    an_jsx_new = an_jsx_anchor + '''
            <AIAssistBox
              task="draft_announcement"
              label="Ask AI to turn rough notes into an announcement"
              getInput={() => body}
              onApply={(result) => setBody(result)}
              emptyMessage="Jot down rough bullet points first, then ask AI to draft it."
            />
'''
    replace_once(ANNOUNCEMENTS_PATH, an_jsx_anchor, an_jsx_new, "Announcements.tsx AIAssistBox render")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/ (no migration needed -- no schema change this time).")
