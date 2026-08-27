#!/usr/bin/env python3
"""
Generates src/pages/admin/AdminBulkImport.tsx -- a CSV-paste mass import
tool for existing students, using the backend endpoint that already
exists (POST /admin/programs/:programId/bulk-import-students) but had no
UI in front of it.

Patches:
  src/components/portal/PortalLayout.tsx -> adds 'Mass Import' to the
                                             ADMIN Administration section
  src/App.tsx                             -> import + route for
                                             /admin/bulk-import

USAGE (run from ~/runyenjes-platform/frontend):
    python3 generate_admin_bulk_import.py

Idempotent: skips existing page file (use --force to overwrite), skips
patches already applied.
"""

import argparse
import os
import sys

PAGES_DIR = os.path.join("src", "pages", "admin")
BULK_IMPORT_PATH = os.path.join(PAGES_DIR, "AdminBulkImport.tsx")
LAYOUT_PATH = os.path.join("src", "components", "portal", "PortalLayout.tsx")
APP_PATH = os.path.join("src", "App.tsx")

BULK_IMPORT_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Programme {
  id: string;
  name: string;
  level: string | null;
  department: { id: string; name: string };
}

interface ImportResult {
  createdCount: number;
  created: string[];
  skippedCount: number;
  skipped: { row: any; reason: string }[];
}

const SAMPLE_CSV = 'name,email,admissionNumber,phone\\nJane Wanjiru,jane.wanjiru@example.com,RT/2024/001,0712345678';

export default function AdminBulkImport() {
  const { token } = useAuth();
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [programId, setProgramId] = useState('');
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!token) return;
    api('/academic/programmes', { token })
      .then((data) => setProgrammes(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load programmes'))
      .finally(() => setLoading(false));
  }, [token]);

  function parseCsv(text: string) {
    const lines = text
      .trim()
      .split('\\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];

    const header = lines[0].toLowerCase().split(',').map((h) => h.trim());
    const nameIdx = header.indexOf('name');
    const emailIdx = header.indexOf('email');
    const admissionIdx = header.indexOf('admissionnumber');
    const phoneIdx = header.indexOf('phone');

    const dataLines = nameIdx === -1 || emailIdx === -1 ? lines : lines.slice(1);

    return dataLines.map((line) => {
      const cols = line.split(',').map((c) => c.trim());
      if (nameIdx !== -1 && emailIdx !== -1) {
        return {
          name: cols[nameIdx] || '',
          email: cols[emailIdx] || '',
          admissionNumber: admissionIdx !== -1 ? cols[admissionIdx] || '' : '',
          phone: phoneIdx !== -1 ? cols[phoneIdx] || '' : '',
        };
      }
      return { name: cols[0] || '', email: cols[1] || '', admissionNumber: cols[2] || '', phone: cols[3] || '' };
    });
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);

    if (!programId) {
      setError('Select a programme first');
      return;
    }
    const rows = parseCsv(csvText);
    if (rows.length === 0) {
      setError('Paste at least one student row');
      return;
    }

    setSubmitting(true);
    try {
      const data = await api(`/admin/programs/${programId}/bulk-import-students`, {
        method: 'POST',
        token,
        body: { rows },
      });
      setResult(data);
      setCsvText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalLayout title="Mass Import">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Mass Import</h2>
          <p className="text-sm text-gray-500 mt-1">
            Bulk-add existing students (launch day / migrating records) into a programme.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}

        {result && (
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Import Result</h3>
            <p className="text-sm text-green-700">{result.createdCount} student(s) created.</p>
            {result.created.length > 0 && (
              <ul className="text-xs text-gray-500 list-disc list-inside">
                {result.created.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
            {result.skippedCount > 0 && (
              <>
                <p className="text-sm text-amber-700">{result.skippedCount} row(s) skipped:</p>
                <ul className="text-xs text-gray-500 list-disc list-inside">
                  {result.skipped.map((s, i) => (
                    <li key={i}>
                      {JSON.stringify(s.row)} \u2014 {s.reason}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <form onSubmit={handleImport} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">New Import</h3>

          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
          >
            <option value="">{loading ? 'Loading programmes...' : 'Select a programme'}</option>
            {programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.department.name} \u2014 {p.name} {p.level || ''}
              </option>
            ))}
          </select>

          <div>
            <p className="text-xs text-gray-400 mb-1">
              Paste CSV with header <code>name,email,admissionNumber,phone</code> (phone optional). Example:
            </p>
            <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2 mb-2 overflow-x-auto">
              {SAMPLE_CSV}
            </pre>
            <textarea
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full font-mono"
              rows={8}
              placeholder={SAMPLE_CSV}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {submitting ? 'Importing...' : 'Import Students'}
          </button>
        </form>
      </div>
    </PortalLayout>
  );
}
"""


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def write_page(force: bool) -> None:
    os.makedirs(PAGES_DIR, exist_ok=True)
    if os.path.exists(BULK_IMPORT_PATH) and not force:
        print("SKIP  " + BULK_IMPORT_PATH + " already exists (use --force to overwrite)")
        return
    with open(BULK_IMPORT_PATH, "w") as f:
        f.write(BULK_IMPORT_TSX)
    print("WROTE " + BULK_IMPORT_PATH)


def patch_layout() -> None:
    if not os.path.isfile(LAYOUT_PATH):
        print("ERROR: '" + LAYOUT_PATH + "' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)
    with open(LAYOUT_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "/admin/bulk-import" in joined:
        print("SKIP  " + LAYOUT_PATH + " already has the Mass Import link.")
        return

    staff_idx = find_line_index(lines, "'/admin/staff'")
    if staff_idx is None:
        print("ERROR: could not find the '/admin/staff' nav item in " + LAYOUT_PATH + ". Patch manually.")
        sys.exit(1)
    new_line = "        { label: 'Mass Import', path: '/admin/bulk-import', icon: '\U0001f4e5' },\n"
    lines = lines[: staff_idx + 1] + [new_line] + lines[staff_idx + 1 :]

    with open(LAYOUT_PATH, "w") as f:
        f.writelines(lines)
    print("PATCHED " + LAYOUT_PATH + " (added Mass Import link to Admin sidebar)")


def patch_app() -> None:
    if not os.path.isfile(APP_PATH):
        print("ERROR: '" + APP_PATH + "' not found.")
        sys.exit(1)
    with open(APP_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "AdminBulkImport" in joined:
        print("SKIP  " + APP_PATH + " already patched.")
        return

    import_idx = find_line_index(lines, "AdminStaff from './pages/admin/AdminStaff'")
    if import_idx is None:
        import_idx = find_line_index(lines, "AdminPortal from './pages/portal/AdminPortal'")
    if import_idx is None:
        print("ERROR: could not find an anchor import in " + APP_PATH + ". Patch manually.")
        sys.exit(1)

    route_idx = find_line_index(lines, '"/admin/staff"')
    if route_idx is None:
        route_idx = find_line_index(lines, '"/admin"')
    if route_idx is None:
        print("ERROR: could not find an anchor route in " + APP_PATH + ". Patch manually.")
        sys.exit(1)

    new_import = "import AdminBulkImport from './pages/admin/AdminBulkImport';\n"
    new_route = '                <Route path="/admin/bulk-import" element={<AdminBulkImport />} />\n'

    if route_idx > import_idx:
        lines2 = lines[: route_idx + 1] + [new_route] + lines[route_idx + 1 :]
        lines3 = lines2[: import_idx + 1] + [new_import] + lines2[import_idx + 1 :]
    else:
        lines2 = lines[: import_idx + 1] + [new_import] + lines[import_idx + 1 :]
        route_idx2 = find_line_index(lines2, '"/admin/staff"')
        if route_idx2 is None:
            route_idx2 = find_line_index(lines2, '"/admin"')
        lines3 = lines2[: route_idx2 + 1] + [new_route] + lines2[route_idx2 + 1 :]

    with open(APP_PATH, "w") as f:
        f.writelines(lines3)
    print("PATCHED " + APP_PATH + " (added AdminBulkImport import + route)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    write_page(args.force)
    patch_layout()
    patch_app()

    print("")
    print("Done.")


if __name__ == "__main__":
    main()
