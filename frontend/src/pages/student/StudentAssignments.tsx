import { useEffect, useState } from 'react';
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
  const [aiFeedback, setAiFeedback] = useState('');
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);
  const [aiFeedbackError, setAiFeedbackError] = useState('');

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

  async function handleGetFeedback(assignmentId: string) {
    setAiFeedbackError('');
    setAiFeedback('');
    if (!textAnswer.trim()) {
      setAiFeedbackError('Type a draft answer first');
      return;
    }
    setAiFeedbackLoading(true);
    try {
      const data = await api('/ai/assignment-feedback', {
        method: 'POST',
        token,
        body: { assignmentId, draftText: textAnswer },
      });
      setAiFeedback(data.feedback);
    } catch (err) {
      setAiFeedbackError(err instanceof Error ? err.message : 'Could not get AI feedback');
    } finally {
      setAiFeedbackLoading(false);
    }
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
                      {a.dueDate ? `Due ${new Date(a.dueDate).toLocaleDateString()}` : 'No due date'} — Max {a.maxScore}
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

                    <button
                      type="button"
                      className="text-xs text-rgreen font-medium underline"
                      onClick={() => handleGetFeedback(a.id)}
                      disabled={aiFeedbackLoading}
                    >
                      {aiFeedbackLoading ? 'Thinking\u2026' : '\ud83c\udf93 Get AI Feedback (before you submit)'}
                    </button>
                    {aiFeedbackError && <p className="text-xs text-rmaroon">{aiFeedbackError}</p>}
                    {aiFeedback && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap">
                        {aiFeedback}
                      </div>
                    )}

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
