#!/usr/bin/env python3
"""
Adds AI assistance to the Assignments pages:

  StudentAssignments.tsx -> "Get AI Feedback" button in the submission
                             form, shows hints on the draft before the
                             student officially submits.
  TeacherAssignments.tsx -> "AI Suggest" button next to each ungraded
                             submission, pre-fills the score/feedback
                             inputs with an AI suggestion the teacher can
                             review and edit before saving.

USAGE (run from ~/runyenjes-platform/frontend):
    python3 add_ai_assignment_helpers.py

Idempotent: skips already-patched files.
"""

import os
import sys

STUDENT_PATH = os.path.join("src", "pages", "student", "StudentAssignments.tsx")
TEACHER_PATH = os.path.join("src", "pages", "teacher", "TeacherAssignments.tsx")


def patch_student():
    if not os.path.isfile(STUDENT_PATH):
        print("ERROR: '" + STUDENT_PATH + "' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)
    with open(STUDENT_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    if "Get AI Feedback" in content:
        print("SKIP  " + STUDENT_PATH + " already patched.")
        return

    old_state = "  const [openAssignmentId, setOpenAssignmentId] = useState<string | null>(null);\n  const [textAnswer, setTextAnswer] = useState('');\n  const [fileUrl, setFileUrl] = useState('');"
    new_state = (
        "  const [openAssignmentId, setOpenAssignmentId] = useState<string | null>(null);\n"
        "  const [textAnswer, setTextAnswer] = useState('');\n"
        "  const [fileUrl, setFileUrl] = useState('');\n"
        "  const [aiFeedback, setAiFeedback] = useState('');\n"
        "  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);\n"
        "  const [aiFeedbackError, setAiFeedbackError] = useState('');"
    )
    if old_state not in content:
        print("ERROR: could not find the expected state declarations in " + STUDENT_PATH + ". Patch manually.")
        sys.exit(1)
    content = content.replace(old_state, new_state)

    old_fn_anchor = "  async function handleSubmit(assignmentId: string) {"
    new_fn = """  async function handleGetFeedback(assignmentId: string) {
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

  async function handleSubmit(assignmentId: string) {"""
    if old_fn_anchor not in content:
        print("ERROR: could not find handleSubmit in " + STUDENT_PATH + ". Patch manually.")
        sys.exit(1)
    content = content.replace(old_fn_anchor, new_fn, 1)

    old_form = """                {openAssignmentId === a.id && !mySub && (
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
                )}"""
    new_form = """                {openAssignmentId === a.id && !mySub && (
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
                      {aiFeedbackLoading ? 'Thinking\\u2026' : '\\ud83c\\udf93 Get AI Feedback (before you submit)'}
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
                )}"""
    if old_form not in content:
        print("ERROR: could not find the submission form block in " + STUDENT_PATH + ". Patch manually.")
        sys.exit(1)
    content = content.replace(old_form, new_form)

    with open(STUDENT_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print("PATCHED " + STUDENT_PATH + " (added 'Get AI Feedback' before submission)")


def patch_teacher():
    if not os.path.isfile(TEACHER_PATH):
        print("ERROR: '" + TEACHER_PATH + "' not found.")
        sys.exit(1)
    with open(TEACHER_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    if "AI Suggest" in content:
        print("SKIP  " + TEACHER_PATH + " already patched.")
        return

    old_fn_anchor = "  return (\n    <PortalLayout title=\"Assignments\">"
    new_fn = """  async function handleSuggestGrade(submissionId: string) {
    setError('');
    try {
      const data = await api('/ai/grading-suggestion', { method: 'POST', token, body: { submissionId } });
      setGradeDrafts((prev) => ({
        ...prev,
        [submissionId]: {
          score: String(data.suggestedScore ?? ''),
          feedback: data.suggestedFeedback || '',
        },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get AI suggestion');
    }
  }

  return (
    <PortalLayout title="Assignments">"""
    if old_fn_anchor not in content:
        print("ERROR: could not find the return statement in " + TEACHER_PATH + ". Patch manually.")
        sys.exit(1)
    content = content.replace(old_fn_anchor, new_fn, 1)

    old_buttons = """                              <button
                                className="bg-rgreen text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                                onClick={() => handleGrade(s.id)}
                              >
                                Save Grade
                              </button>"""
    new_buttons = """                              <button
                                type="button"
                                className="text-rgreen text-xs font-medium underline"
                                onClick={() => handleSuggestGrade(s.id)}
                              >
                                {'\\ud83c\\udf93 AI Suggest'}
                              </button>
                              <button
                                className="bg-rgreen text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                                onClick={() => handleGrade(s.id)}
                              >
                                Save Grade
                              </button>"""
    if old_buttons not in content:
        print("ERROR: could not find the Save Grade button in " + TEACHER_PATH + ". Patch manually.")
        sys.exit(1)
    content = content.replace(old_buttons, new_buttons)

    with open(TEACHER_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print("PATCHED " + TEACHER_PATH + " (added 'AI Suggest' grading helper)")


def main():
    patch_student()
    patch_teacher()
    print("")
    print("Done.")


if __name__ == "__main__":
    main()
