#!/usr/bin/env python3
"""
Adds Student -> My Records (own Documents + Letters combined):
  1. PortalLayout.tsx -> new nav item under STUDENT's Student Services
  2. StudentRecords.tsx -> new page (reuses EXISTING /documents/students/:id
                            and /letters/students/:id -- both already allow
                            self-access, no backend change needed)
  3. App.tsx -> import + route at /student/records

No schema change, no migration needed.
Safe to re-run: every step checks whether it was already applied first.
"""
import os

ROOT = os.path.join(os.path.expanduser("~"), "runyenjes-platform")
FRONTEND = os.path.join(ROOT, "frontend", "src")

PORTAL_LAYOUT_PATH = os.path.join(FRONTEND, "components", "portal", "PortalLayout.tsx")
APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PAGES_DIR = os.path.join(FRONTEND, "pages", "student")
RECORDS_PAGE_PATH = os.path.join(PAGES_DIR, "StudentRecords.tsx")


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
# 1. PortalLayout.tsx -- new nav item for STUDENT
# ------------------------------------------------------------------
if already_applied(PORTAL_LAYOUT_PATH, "My Documents & Letters"):
    print(f"[SKIP] Nav item already present -> {PORTAL_LAYOUT_PATH}")
else:
    anchor = (
        "    {\n"
        "      title: 'Student Services',\n"
        "      items: [\n"
        "        { label: 'Fees & Payments', path: '/student/fees', icon: '💰' },\n"
        "      ],\n"
        "    },\n"
    )
    new = (
        "    {\n"
        "      title: 'Student Services',\n"
        "      items: [\n"
        "        { label: 'Fees & Payments', path: '/student/fees', icon: '💰' },\n"
        "        { label: 'My Documents & Letters', path: '/student/records', icon: '📄' },\n"
        "      ],\n"
        "    },\n"
    )
    replace_once(PORTAL_LAYOUT_PATH, anchor, new, "PortalLayout.tsx STUDENT nav item")

# ------------------------------------------------------------------
# 2. StudentRecords.tsx -- new page
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)

if os.path.exists(RECORDS_PAGE_PATH):
    print(f"[SKIP] {RECORDS_PAGE_PATH} already exists -- not overwriting")
else:
    records_page_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface DocumentRow {
  id: string;
  title: string;
  fileUrl: string;
  createdAt: string;
  uploadedBy: { name: string };
}

interface LetterRow {
  id: string;
  type: string;
  title: string;
  fileUrl: string;
  createdAt: string;
  issuedBy: { name: string };
}

export default function StudentRecords() {
  const { token, user } = useAuth();

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !user) return;
    setLoading(true);
    Promise.all([
      api(`/documents/students/${user.id}`, { token }),
      api(`/letters/students/${user.id}`, { token }),
    ])
      .then(([docsData, lettersData]) => {
        setDocuments(docsData);
        setLetters(lettersData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your records'))
      .finally(() => setLoading(false));
  }, [token, user]);

  return (
    <PortalLayout title="My Documents & Letters">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Documents & Letters</h2>
          <p className="text-sm text-gray-500 mt-1">Documents and letters issued to you by the Registrar.</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-gray-200 rounded-lg">
              <div className="p-4 border-b border-gray-200 font-semibold text-gray-900">Documents</div>
              {documents.length === 0 ? (
                <p className="text-sm text-gray-400 p-4">No documents on file yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {documents.map((d) => (
                    <a
                      key={d.id}
                      href={d.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block px-4 py-3 hover:bg-gray-50"
                    >
                      <div className="text-sm font-medium text-rgreen">{d.title}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        Uploaded by {d.uploadedBy.name} · {new Date(d.createdAt).toLocaleDateString()}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white border border-gray-200 rounded-lg">
              <div className="p-4 border-b border-gray-200 font-semibold text-gray-900">Letters & Certificates</div>
              {letters.length === 0 ? (
                <p className="text-sm text-gray-400 p-4">No letters issued yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {letters.map((l) => (
                    <a
                      key={l.id}
                      href={l.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block px-4 py-3 hover:bg-gray-50"
                    >
                      <div className="text-sm font-medium text-rgreen">{l.title}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {l.type} · Issued by {l.issuedBy.name} · {new Date(l.createdAt).toLocaleDateString()}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
"""
    with open(RECORDS_PAGE_PATH, "w", encoding="utf-8") as f:
        f.write(records_page_content)
    print(f"[OK] Created {RECORDS_PAGE_PATH}")

# ------------------------------------------------------------------
# 3. App.tsx -- import + route
# ------------------------------------------------------------------
if already_applied(APP_TSX_PATH, "StudentRecords"):
    print(f"[SKIP] StudentRecords already wired into {APP_TSX_PATH}")
else:
    with open(APP_TSX_PATH, "r", encoding="utf-8") as f:
        app_content = f.read()

    import_marker = "import StudentResults from './pages/student/StudentResults';\n"
    if import_marker not in app_content:
        raise SystemExit(
            "[FAIL] Could not find the StudentResults import line in App.tsx.\n"
            "       Run: grep -n 'StudentResults' App.tsx and paste the output."
        )
    app_content = app_content.replace(
        import_marker,
        import_marker + "import StudentRecords from './pages/student/StudentRecords';\n",
        1,
    )

    route_marker = '<Route path="/student/results" element={<StudentResults />} />\n'
    if app_content.count(route_marker) != 1:
        raise SystemExit(
            "[FAIL] Could not find exactly one /student/results route line in App.tsx."
        )
    app_content = app_content.replace(
        route_marker,
        route_marker + '                <Route path="/student/records" element={<StudentRecords />} />\n',
        1,
    )

    with open(APP_TSX_PATH, "w", encoding="utf-8") as f:
        f.write(app_content)
    print(f"[OK] App.tsx import + route -> {APP_TSX_PATH}")

print("\nDone. Next: npx tsc --noEmit in frontend/ (no backend change, no migration).")
