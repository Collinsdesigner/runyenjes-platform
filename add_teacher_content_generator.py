#!/usr/bin/env python3
"""
Adds Teacher -> AI Content Generator:
  1. PortalLayout.tsx -> new nav item under TEACHER's Teaching section
  2. TeacherContentGenerator.tsx -> new page (reuses EXISTING
     POST /ai/generate-content -- no backend change needed)
  3. App.tsx -> import + route at /teacher/content-generator

No schema change, no migration needed.
Safe to re-run: every step checks whether it was already applied first.
"""
import os

ROOT = os.path.join(os.path.expanduser("~"), "runyenjes-platform")
FRONTEND = os.path.join(ROOT, "frontend", "src")

PORTAL_LAYOUT_PATH = os.path.join(FRONTEND, "components", "portal", "PortalLayout.tsx")
APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PAGES_DIR = os.path.join(FRONTEND, "pages", "teacher")
CONTENT_PAGE_PATH = os.path.join(PAGES_DIR, "TeacherContentGenerator.tsx")


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
# 1. PortalLayout.tsx -- new nav item for TEACHER
# ------------------------------------------------------------------
if already_applied(PORTAL_LAYOUT_PATH, "AI Content Generator"):
    print(f"[SKIP] Nav item already present -> {PORTAL_LAYOUT_PATH}")
else:
    anchor = "        { label: 'Learning Materials', path: '/library', icon: '📚' },\n      ],\n    },\n  ],\n\n  REGISTRAR: ["
    new = (
        "        { label: 'Learning Materials', path: '/library', icon: '📚' },\n"
        "        { label: 'AI Content Generator', path: '/teacher/content-generator', icon: '✨' },\n"
        "      ],\n    },\n  ],\n\n  REGISTRAR: ["
    )
    replace_once(PORTAL_LAYOUT_PATH, anchor, new, "PortalLayout.tsx TEACHER nav item")

# ------------------------------------------------------------------
# 2. TeacherContentGenerator.tsx -- new page
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)

if os.path.exists(CONTENT_PAGE_PATH):
    print(f"[SKIP] {CONTENT_PAGE_PATH} already exists -- not overwriting")
else:
    content_page_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface UnitOption {
  unitId: string;
  unitName: string;
}

export default function TeacherContentGenerator() {
  const { token } = useAuth();

  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitId, setUnitId] = useState('');
  const [contentType, setContentType] = useState<'material' | 'assignment'>('material');
  const [topic, setTopic] = useState('');

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  const [materialResult, setMaterialResult] = useState('');
  const [assignmentResult, setAssignmentResult] = useState<{ title: string; description: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    api('/teacher/units', { token })
      .then((data) => setUnits(data.units.map((u: any) => ({ unitId: u.unitId, unitName: u.unitName }))))
      .catch(() => {});
  }, [token]);

  async function handleGenerate() {
    if (!unitId || !topic.trim()) {
      setError('Select a unit and enter a topic first');
      return;
    }
    setGenerating(true);
    setError('');
    setMaterialResult('');
    setAssignmentResult(null);
    try {
      const data = await api('/ai/generate-content', {
        method: 'POST',
        token,
        body: { unitId, contentType, topic: topic.trim() },
      });
      if (contentType === 'material') {
        setMaterialResult(data.content);
      } else {
        setAssignmentResult({ title: data.title, description: data.description });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate content');
    } finally {
      setGenerating(false);
    }
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopyMessage('Copied to clipboard');
      setTimeout(() => setCopyMessage(''), 2000);
    });
  }

  return (
    <PortalLayout title="AI Content Generator">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">AI Content Generator</h2>
          <p className="text-sm text-gray-500 mt-1">
            Draft lecture material or an assignment brief for one of your units. Review and copy the result to use wherever you need it.
          </p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select unit</option>
            {units.map((u) => (
              <option key={u.unitId} value={u.unitId}>{u.unitName}</option>
            ))}
          </select>

          <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
            <button
              type="button"
              onClick={() => setContentType('material')}
              className={`px-3 py-1.5 text-sm rounded-md ${contentType === 'material' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
            >
              Learning Material
            </button>
            <button
              type="button"
              onClick={() => setContentType('assignment')}
              className={`px-3 py-1.5 text-sm rounded-md ${contentType === 'assignment' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
            >
              Assignment Brief
            </button>
          </div>

          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder='Topic (e.g. "Introduction to Ohm\\'s Law")'
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>

        {copyMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-2 text-xs">{copyMessage}</div>
        )}

        {materialResult && (
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Draft Material</h3>
              <button type="button" onClick={() => copyText(materialResult)} className="text-xs font-medium text-rgreen">
                Copy
              </button>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{materialResult}</p>
          </div>
        )}

        {assignmentResult && (
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Draft Assignment</h3>
              <button
                type="button"
                onClick={() => copyText(`${assignmentResult.title}\\n\\n${assignmentResult.description}`)}
                className="text-xs font-medium text-rgreen"
              >
                Copy Both
              </button>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Title</div>
              <p className="text-sm font-medium text-gray-900">{assignmentResult.title}</p>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Description</div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{assignmentResult.description}</p>
            </div>
            <p className="text-xs text-gray-400">
              Copy this into the Assignments tab to actually create it for students.
            </p>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
"""
    with open(CONTENT_PAGE_PATH, "w", encoding="utf-8") as f:
        f.write(content_page_content)
    print(f"[OK] Created {CONTENT_PAGE_PATH}")

# ------------------------------------------------------------------
# 3. App.tsx -- import + route
# ------------------------------------------------------------------
if already_applied(APP_TSX_PATH, "TeacherContentGenerator"):
    print(f"[SKIP] TeacherContentGenerator already wired into {APP_TSX_PATH}")
else:
    with open(APP_TSX_PATH, "r", encoding="utf-8") as f:
        app_content = f.read()

    import_marker = "import TeacherAttendance from './pages/teacher/TeacherAttendance';\n"
    if import_marker not in app_content:
        raise SystemExit(
            "[FAIL] Could not find the TeacherAttendance import line in App.tsx.\n"
            "       Run: grep -n 'TeacherAttendance' App.tsx and paste the output."
        )
    app_content = app_content.replace(
        import_marker,
        import_marker + "import TeacherContentGenerator from './pages/teacher/TeacherContentGenerator';\n",
        1,
    )

    route_marker = '<Route path="/teacher/attendance" element={<TeacherAttendance />} />\n'
    if app_content.count(route_marker) != 1:
        raise SystemExit(
            "[FAIL] Could not find exactly one /teacher/attendance route line in App.tsx."
        )
    app_content = app_content.replace(
        route_marker,
        route_marker + '                <Route path="/teacher/content-generator" element={<TeacherContentGenerator />} />\n',
        1,
    )

    with open(APP_TSX_PATH, "w", encoding="utf-8") as f:
        f.write(app_content)
    print(f"[OK] App.tsx import + route -> {APP_TSX_PATH}")

print("\nDone. Next: npx tsc --noEmit in frontend/ (no backend change, no migration).")
