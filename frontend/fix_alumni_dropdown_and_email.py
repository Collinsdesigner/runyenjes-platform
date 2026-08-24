#!/usr/bin/env python3
"""
Fixes two AdminAlumni.tsx issues:
  1. Email wasn't shown anywhere -- added to both the student search
     results and the final Alumni table, so you have what you need to log
     in as that person for testing.
  2. The student search box had no visible indication it was a dropdown --
     added a visible chevron arrow, and the suggestion list now opens on
     focus/click as well as while typing, closer to how a real dropdown
     behaves.

USAGE (run from ~/runyenjes-platform/frontend):
    python3 fix_alumni_dropdown_and_email.py

Always overwrites AdminAlumni.tsx with the corrected version (safe to
re-run).
"""

import os

ADMIN_ALUMNI_PATH = os.path.join("src", "pages", "admin", "AdminAlumni.tsx")

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
  const [dropdownOpen, setDropdownOpen] = useState(false);
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
          s.email.toLowerCase().includes(studentSearch.toLowerCase()) ||
          (s.admissionNumber || '').toLowerCase().includes(studentSearch.toLowerCase())
      )
    : students;

  function selectStudent(s: StudentOption) {
    setSelectedStudentId(s.id);
    setStudentSearch(`${s.name} \u2014 ${s.email}`);
    setDropdownOpen(false);
  }

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

          <div className="relative">
            <input
              className="border border-gray-300 rounded-lg pl-3 pr-9 py-2 text-sm w-full"
              placeholder="Click to browse, or search by name / email / admission number..."
              value={studentSearch}
              onFocus={() => setDropdownOpen(true)}
              onChange={(e) => {
                setStudentSearch(e.target.value);
                setSelectedStudentId('');
                setDropdownOpen(true);
              }}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {dropdownOpen ? '\u25b4' : '\u25be'}
            </span>

            {dropdownOpen && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto divide-y divide-gray-100">
                {loading && <p className="text-sm text-gray-400 p-3">Loading students...</p>}
                {!loading && filteredStudents.length === 0 && (
                  <p className="text-sm text-gray-400 p-3">No matching students</p>
                )}
                {!loading &&
                  filteredStudents.slice(0, 30).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      onClick={() => selectStudent(s)}
                    >
                      <div className="font-medium text-gray-900">{s.name}</div>
                      <div className="text-xs text-gray-400">
                        {s.email}
                        {s.admissionNumber ? ` \u2014 ${s.admissionNumber}` : ''}
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {dropdownOpen && (
            <button
              type="button"
              className="text-xs text-gray-400 underline"
              onClick={() => setDropdownOpen(false)}
            >
              Close list
            </button>
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
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Admission #</th>
                <th className="px-4 py-2">Graduation Year</th>
                <th className="px-4 py-2">Employer</th>
                <th className="px-4 py-2">Position</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && alumni.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No alumni yet</td></tr>
              )}
              {alumni.map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{a.user?.name}</td>
                  <td className="px-4 py-2">{a.user?.email}</td>
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


def main():
    os.makedirs(os.path.dirname(ADMIN_ALUMNI_PATH), exist_ok=True)
    with open(ADMIN_ALUMNI_PATH, "w", encoding="utf-8") as f:
        f.write(ADMIN_ALUMNI_TSX)
    print("REWROTE " + ADMIN_ALUMNI_PATH + " (added Email column + visible dropdown arrow)")


if __name__ == "__main__":
    main()
