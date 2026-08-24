#!/usr/bin/env python3
"""
Three fixes:

1. Unicode escape bug: several generated pages have literal `\\u2014` /
   `\\u2192` text (backslash-u-XXXX as 6 raw characters) instead of an
   actual em dash (\u2014) or arrow (\u2192), because JSX text content
   doesn't interpret \\u escapes the way JS string literals do. This scans
   every .tsx file under src/pages and src/components and replaces the
   literal escape sequences with the real characters.

2. Adds 'PROCUREMENT_OFFICER' to ALL_ROLES (AdminUsers.tsx) and
   STAFF_ROLES (AdminStaff.tsx) -- it was missing from both, so Admin
   couldn't create or assign that role from the UI.

3. Redesigns AdminAlumni.tsx's graduation form to fetch the student list
   and let you search/select by name instead of pasting a raw user ID.

USAGE (run from ~/runyenjes-platform/frontend):
    python3 fix_escape_role_alumni_form.py

Idempotent: unicode-escape fix and role additions are safe to re-run
(no-ops if already fixed). The AdminAlumni.tsx rewrite always overwrites
that one file with the corrected version.
"""

import os
import sys

SRC_DIR = "src"
ADMIN_USERS_PATH = os.path.join(SRC_DIR, "pages", "admin", "AdminUsers.tsx")
ADMIN_STAFF_PATH = os.path.join(SRC_DIR, "pages", "admin", "AdminStaff.tsx")
ADMIN_ALUMNI_PATH = os.path.join(SRC_DIR, "pages", "admin", "AdminAlumni.tsx")


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def fix_unicode_escapes():
    if not os.path.isdir(SRC_DIR):
        print("ERROR: '" + SRC_DIR + "' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)

    em_dash_escape = "\\u2014"
    arrow_escape = "\\u2192"
    em_dash_char = "\u2014"
    arrow_char = "\u2192"

    fixed_files = []
    for root, _dirs, files in os.walk(SRC_DIR):
        for name in files:
            if not name.endswith(".tsx"):
                continue
            path = os.path.join(root, name)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            if em_dash_escape not in content and arrow_escape not in content:
                continue
            new_content = content.replace(em_dash_escape, em_dash_char).replace(arrow_escape, arrow_char)
            if new_content != content:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(new_content)
                fixed_files.append(path)

    if fixed_files:
        print("FIXED unicode escapes in " + str(len(fixed_files)) + " file(s):")
        for p in fixed_files:
            print("  - " + p)
    else:
        print("SKIP  no literal \\u2014 / \\u2192 escapes found (already fixed).")


def add_role_to_array(path, const_name, role):
    if not os.path.isfile(path):
        print("ERROR: '" + path + "' not found.")
        sys.exit(1)
    with open(path, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if role in joined:
        print("SKIP  " + path + " already has " + role + ".")
        return

    idx = find_line_index(lines, const_name)
    if idx is None:
        print("ERROR: could not find '" + const_name + "' in " + path + ". Patch manually.")
        sys.exit(1)
    close_idx = None
    for i in range(idx + 1, len(lines)):
        if lines[i].strip().startswith("]"):
            close_idx = i
            break
    if close_idx is None:
        print("ERROR: could not find closing ']' for " + const_name + " in " + path + ". Patch manually.")
        sys.exit(1)

    lines = lines[:close_idx] + ["  '" + role + "',\n"] + lines[close_idx:]
    with open(path, "w") as f:
        f.writelines(lines)
    print("PATCHED " + path + " (added " + role + " to " + const_name + ")")


ADMIN_ALUMNI_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface AlumniRow {
  id: string;
  graduationYear: number | null;
  currentEmployer: string | null;
  currentPosition: string | null;
  user: { id: string; name: string; email: string; admissionNumber: string | null };
}

interface StudentOption {
  id: string;
  name: string;
  email: string;
  admissionNumber: string | null;
}

export default function AdminAlumni() {
  const { token } = useAuth();
  const [alumni, setAlumni] = useState<AlumniRow[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [graduationYear, setGraduationYear] = useState(String(new Date().getFullYear()));

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [alumniData, studentsData] = await Promise.all([
        api('/alumni', { token }),
        api('/admin/users?role=STUDENT&pageSize=200', { token }),
      ]);
      setAlumni(alumniData);
      setStudents(studentsData.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load alumni');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filteredStudents = studentSearch
    ? students.filter(
        (s) =>
          s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
          (s.admissionNumber || '').toLowerCase().includes(studentSearch.toLowerCase())
      )
    : students;

  async function handleGraduate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!selectedStudentId) {
      setError('Select a student first');
      return;
    }
    try {
      await api(`/alumni/graduate/${selectedStudentId}`, {
        method: 'POST',
        token,
        body: { graduationYear: Number(graduationYear) },
      });
      setMessage('Student graduated to Alumni');
      setSelectedStudentId('');
      setStudentSearch('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not graduate student');
    }
  }

  return (
    <PortalLayout title="Alumni">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Alumni</h2>
          <p className="text-sm text-gray-500 mt-1">
            Graduate a student to convert their account to Alumni \u2014 their history stays intact.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleGraduate} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">Graduate a Student</h3>

          <input
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
            placeholder="Search students by name or admission number..."
            value={studentSearch}
            onChange={(e) => {
              setStudentSearch(e.target.value);
              setSelectedStudentId('');
            }}
          />

          {studentSearch && !selectedStudentId && (
            <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
              {loading && <p className="text-sm text-gray-400 p-3">Loading students...</p>}
              {!loading && filteredStudents.length === 0 && (
                <p className="text-sm text-gray-400 p-3">No matching students</p>
              )}
              {filteredStudents.slice(0, 20).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    setSelectedStudentId(s.id);
                    setStudentSearch(`${s.name}${s.admissionNumber ? ` (${s.admissionNumber})` : ''}`);
                  }}
                >
                  {s.name} {s.admissionNumber ? `\u2014 ${s.admissionNumber}` : ''}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Graduation year"
              type="number"
              value={graduationYear}
              onChange={(e) => setGraduationYear(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={!selectedStudentId}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            Graduate to Alumni
          </button>
        </form>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Admission #</th>
                <th className="px-4 py-2">Graduation Year</th>
                <th className="px-4 py-2">Employer</th>
                <th className="px-4 py-2">Position</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && alumni.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No alumni yet</td></tr>
              )}
              {alumni.map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{a.user?.name}</td>
                  <td className="px-4 py-2">{a.user?.admissionNumber || '\u2014'}</td>
                  <td className="px-4 py-2">{a.graduationYear || '\u2014'}</td>
                  <td className="px-4 py-2">{a.currentEmployer || '\u2014'}</td>
                  <td className="px-4 py-2">{a.currentPosition || '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}
"""


def rewrite_admin_alumni():
    os.makedirs(os.path.dirname(ADMIN_ALUMNI_PATH), exist_ok=True)
    with open(ADMIN_ALUMNI_PATH, "w", encoding="utf-8") as f:
        f.write(ADMIN_ALUMNI_TSX)
    print("REWROTE " + ADMIN_ALUMNI_PATH + " (student search/select instead of raw ID entry)")


def main():
    fix_unicode_escapes()
    add_role_to_array(ADMIN_USERS_PATH, "const ALL_ROLES = [", "PROCUREMENT_OFFICER")
    add_role_to_array(ADMIN_STAFF_PATH, "const STAFF_ROLES = [", "PROCUREMENT_OFFICER")
    rewrite_admin_alumni()
    print("")
    print("Done.")


if __name__ == "__main__":
    main()
