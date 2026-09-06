#!/usr/bin/env python3
"""
Generates the two Assignments pages that PortalLayout's nav already
references but had no page behind:
  src/pages/teacher/TeacherAssignments.tsx  (route: /teacher/assignments)
  src/pages/student/StudentAssignments.tsx  (route: /student/assignments)

Patches src/App.tsx with the imports + routes.

USAGE (run from ~/runyenjes-platform/frontend):
    python3 generate_assignments_pages.py

Idempotent: skips existing page files (use --force to overwrite), skips
App.tsx patch if already applied.
"""

import argparse
import os
import sys

TEACHER_PATH = os.path.join("src", "pages", "teacher", "TeacherAssignments.tsx")
STUDENT_PATH = os.path.join("src", "pages", "student", "StudentAssignments.tsx")
APP_PATH = os.path.join("src", "App.tsx")

TEACHER_ASSIGNMENTS_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Unit {
  id: string;
  name: string;
  program: { name: string; level: string | null; department: { name: string } };
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  maxScore: string;
}

interface Submission {
  id: string;
  textAnswer: string | null;
  fileUrl: string | null;
  submittedAt: string;
  score: string | null;
  feedback: string | null;
  student: { id: string; name: string; admissionNumber: string | null };
}

export default function TeacherAssignments() {
  const { token } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [maxScore, setMaxScore] = useState('100');

  const [openAssignmentId, setOpenAssignmentId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, { score: string; feedback: string }>>({});

  useEffect(() => {
    if (!token) return;
    api('/academic/units/mine', { token })
      .then((data) => setUnits(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your units'))
      .finally(() => setLoading(false));
  }, [token]);

  async function loadAssignments(unitId: string) {
    setSelectedUnitId(unitId);
    setOpenAssignmentId(null);
    if (!unitId) {
      setAssignments([]);
      return;
    }
    try {
      const data = await api(`/assignments/unit/${unitId}`, { token });
      setAssignments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load assignments');
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!selectedUnitId || !title) {
      setError('Select a unit and enter a title');
      return;
    }
    try {
      await api('/assignments', {
        method: 'POST',
        token,
        body: {
          unitId: selectedUnitId,
          title,
          description: description || undefined,
          dueDate: dueDate || undefined,
          maxScore: Number(maxScore) || 100,
        },
      });
      setMessage('Assignment created');
      setTitle('');
      setDescription('');
      setDueDate('');
      loadAssignments(selectedUnitId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create assignment');
    }
  }

  async function handleDelete(assignmentId: string) {
    setError('');
    setMessage('');
    try {
      await api(`/assignments/${assignmentId}`, { method: 'DELETE', token });
      setMessage('Assignment deleted');
      loadAssignments(selectedUnitId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete assignment');
    }
  }

  async function openSubmissions(assignmentId: string) {
    if (openAssignmentId === assignmentId) {
      setOpenAssignmentId(null);
      return;
    }
    setOpenAssignmentId(assignmentId);
    try {
      const data = await api(`/assignments/${assignmentId}/submissions`, { token });
      setSubmissions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load submissions');
    }
  }

  async function handleGrade(submissionId: string) {
    setError('');
    setMessage('');
    const draft = gradeDrafts[submissionId];
    if (!draft || !draft.score) {
      setError('Enter a score first');
      return;
    }
    try {
      await api(`/assignments/submissions/${submissionId}/grade`, {
        method: 'PATCH',
        token,
        body: { score: Number(draft.score), feedback: draft.feedback || undefined },
      });
      setMessage('Grade saved');
      if (openAssignmentId) {
        const data = await api(`/assignments/${openAssignmentId}/submissions`, { token });
        setSubmissions(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save grade');
    }
  }

  return (
    <PortalLayout title="Assignments">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Assignments</h2>
          <p className="text-sm text-gray-500 mt-1">Create assignments for your units and grade submissions.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full sm:w-96"
          value={selectedUnitId}
          onChange={(e) => loadAssignments(e.target.value)}
        >
          <option value="">{loading ? 'Loading your units...' : 'Select a unit'}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.program.department.name} \u2014 {u.name} ({u.program.name} {u.program.level || ''})
            </option>
          ))}
        </select>

        {selectedUnitId && (
          <>
            <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
              <h3 className="font-semibold text-gray-900">New Assignment</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2"
                  placeholder="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <textarea
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2"
                  placeholder="Description (optional)"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <input
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                <input
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Max score"
                  type="number"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                />
              </div>
              <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
                Create Assignment
              </button>
            </form>

            <div className="space-y-3">
              {assignments.length === 0 && <p className="text-sm text-gray-400">No assignments for this unit yet.</p>}
              {assignments.map((a) => (
                <div key={a.id} className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-900">{a.title}</h4>
                      {a.description && <p className="text-sm text-gray-600 mt-1">{a.description}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        {a.dueDate ? `Due ${new Date(a.dueDate).toLocaleDateString()}` : 'No due date'} \u2014 Max {a.maxScore}
                      </p>
                    </div>
                    <div className="space-x-3 text-xs">
                      <button className="text-rgreen font-medium" onClick={() => openSubmissions(a.id)}>
                        {openAssignmentId === a.id ? 'Hide submissions' : 'View submissions'}
                      </button>
                      <button className="text-red-600 font-medium" onClick={() => handleDelete(a.id)}>
                        Delete
                      </button>
                    </div>
                  </div>

                  {openAssignmentId === a.id && (
                    <div className="mt-3 border-t border-gray-100 pt-3 space-y-3">
                      {submissions.length === 0 && (
                        <p className="text-xs text-gray-400">No submissions yet.</p>
                      )}
                      {submissions.map((s) => (
                        <div key={s.id} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-900">
                              {s.student.name} {s.student.admissionNumber ? `(${s.student.admissionNumber})` : ''}
                            </p>
                            <span className="text-xs text-gray-400">
                              {new Date(s.submittedAt).toLocaleString()}
                            </span>
                          </div>
                          {s.textAnswer && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{s.textAnswer}</p>}
                          {s.fileUrl && (
                            <p className="text-xs text-gray-500 mt-1">File/link: {s.fileUrl}</p>
                          )}
                          {s.score !== null ? (
                            <p className="text-xs text-green-700 mt-2">
                              Graded: {s.score} {s.feedback ? `\u2014 ${s.feedback}` : ''}
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-2 items-center mt-2">
                              <input
                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-20"
                                placeholder="Score"
                                type="number"
                                value={gradeDrafts[s.id]?.score || ''}
                                onChange={(e) =>
                                  setGradeDrafts((prev) => ({
                                    ...prev,
                                    [s.id]: { score: e.target.value, feedback: prev[s.id]?.feedback || '' },
                                  }))
                                }
                              />
                              <input
                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs flex-1 min-w-[160px]"
                                placeholder="Feedback (optional)"
                                value={gradeDrafts[s.id]?.feedback || ''}
                                onChange={(e) =>
                                  setGradeDrafts((prev) => ({
                                    ...prev,
                                    [s.id]: { score: prev[s.id]?.score || '', feedback: e.target.value },
                                  }))
                                }
                              />
                              <button
                                className="bg-rgreen text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                                onClick={() => handleGrade(s.id)}
                              >
                                Save Grade
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
"""

STUDENT_ASSIGNMENTS_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Unit {
  id: string;
  name: string;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  maxScore: string;
  unit: { id: string; name: string };
}

interface MySubmission {
  id: string;
  assignmentId: string;
  textAnswer: string | null;
  fileUrl: string | null;
  score: string | null;
  feedback: string | null;
}

export default function StudentAssignments() {
  const { token } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [mySubmissions, setMySubmissions] = useState<MySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [openAssignmentId, setOpenAssignmentId] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [fileUrl, setFileUrl] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const unitsData = await api('/academic/units/mine', { token });
      setUnits(unitsData);

      const perUnit = await Promise.all(
        unitsData.map((u: Unit) => api(`/assignments/unit/${u.id}`, { token }))
      );
      setAssignments(perUnit.flat());

      const subs = await api('/assignments/my-submissions', { token });
      setMySubmissions(subs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load assignments');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function submissionFor(assignmentId: string) {
    return mySubmissions.find((s) => s.assignmentId === assignmentId);
  }

  async function handleSubmit(assignmentId: string) {
    setError('');
    setMessage('');
    if (!textAnswer && !fileUrl) {
      setError('Provide a text answer, a file/link, or both');
      return;
    }
    try {
      await api(`/assignments/${assignmentId}/submit`, {
        method: 'POST',
        token,
        body: { textAnswer: textAnswer || undefined, fileUrl: fileUrl || undefined },
      });
      setMessage('Submitted');
      setTextAnswer('');
      setFileUrl('');
      setOpenAssignmentId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit');
    }
  }

  return (
    <PortalLayout title="Assignments">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Assignments</h2>
          <p className="text-sm text-gray-500 mt-1">Assignments for your registered units this term.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        {!loading && assignments.length === 0 && (
          <p className="text-sm text-gray-400">No assignments yet for your units.</p>
        )}

        <div className="space-y-3">
          {assignments.map((a) => {
            const mySub = submissionFor(a.id);
            return (
              <div key={a.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-900">{a.title}</h4>
                    <p className="text-xs text-gray-400">{a.unit.name}</p>
                    {a.description && <p className="text-sm text-gray-600 mt-1">{a.description}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      {a.dueDate ? `Due ${new Date(a.dueDate).toLocaleDateString()}` : 'No due date'} \u2014 Max {a.maxScore}
                    </p>
                  </div>
                  {mySub ? (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">
                      {mySub.score !== null ? `Graded: ${mySub.score}` : 'Submitted'}
                    </span>
                  ) : (
                    <button
                      className="text-rgreen text-xs font-medium"
                      onClick={() => setOpenAssignmentId(openAssignmentId === a.id ? null : a.id)}
                    >
                      {openAssignmentId === a.id ? 'Cancel' : 'Submit'}
                    </button>
                  )}
                </div>

                {mySub?.feedback && (
                  <p className="text-xs text-green-700 mt-2">Feedback: {mySub.feedback}</p>
                )}

                {openAssignmentId === a.id && !mySub && (
                  <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
                    <textarea
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
                      placeholder="Your answer (optional if you're providing a file/link)"
                      rows={3}
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                    />
                    <input
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
                      placeholder="File/link URL (optional if you typed an answer above)"
                      value={fileUrl}
                      onChange={(e) => setFileUrl(e.target.value)}
                    />
                    <button
                      className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg"
                      onClick={() => handleSubmit(a.id)}
                    >
                      Submit
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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


def write_pages(force: bool) -> None:
    for path, content in [(TEACHER_PATH, TEACHER_ASSIGNMENTS_TSX), (STUDENT_PATH, STUDENT_ASSIGNMENTS_TSX)]:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if os.path.exists(path) and not force:
            print("SKIP  " + path + " already exists (use --force to overwrite)")
            continue
        with open(path, "w") as f:
            f.write(content)
        print("WROTE " + path)


def patch_app() -> None:
    if not os.path.isfile(APP_PATH):
        print("ERROR: '" + APP_PATH + "' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)
    with open(APP_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "TeacherAssignments" in joined:
        print("SKIP  " + APP_PATH + " already patched.")
        return

    import_idx = find_line_index(lines, "AdminBulkImport from './pages/admin/AdminBulkImport'")
    if import_idx is None:
        import_idx = find_line_index(lines, "TeacherPortal from './pages/portal/TeacherPortal'")
    if import_idx is None:
        print("ERROR: could not find an anchor import in " + APP_PATH + ". Patch manually.")
        sys.exit(1)

    route_idx = find_line_index(lines, '"/teacher"')
    if route_idx is None:
        print("ERROR: could not find the /teacher route in " + APP_PATH + ". Patch manually.")
        sys.exit(1)

    new_import = (
        "import TeacherAssignments from './pages/teacher/TeacherAssignments';\n"
        "import StudentAssignments from './pages/student/StudentAssignments';\n"
    )
    new_route = (
        '                <Route path="/teacher/assignments" element={<TeacherAssignments />} />\n'
        '                <Route path="/student/assignments" element={<StudentAssignments />} />\n'
    )

    if route_idx > import_idx:
        lines2 = lines[: route_idx + 1] + [new_route] + lines[route_idx + 1 :]
        lines3 = lines2[: import_idx + 1] + [new_import] + lines2[import_idx + 1 :]
    else:
        lines2 = lines[: import_idx + 1] + [new_import] + lines[import_idx + 1 :]
        route_idx2 = find_line_index(lines2, '"/teacher"')
        lines3 = lines2[: route_idx2 + 1] + [new_route] + lines2[route_idx2 + 1 :]

    with open(APP_PATH, "w") as f:
        f.writelines(lines3)
    print("PATCHED " + APP_PATH + " (added TeacherAssignments + StudentAssignments imports/routes)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    write_pages(args.force)
    patch_app()

    print("")
    print("Done.")


if __name__ == "__main__":
    main()
