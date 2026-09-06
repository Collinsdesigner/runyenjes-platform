#!/usr/bin/env python3
"""
Generates src/pages/UnitTutor.tsx -- a tabbed page with:
  - AI Tutor chat, scoped to a unit via POST /ai/chat { unitId, ... }
  - Practice Quiz, generated via POST /ai/quiz { unitId, questionCount }

Patches:
  src/pages/LibraryUnits.tsx -> adds "AI Tutor" and "Quiz" buttons to each
                                 unit card, next to the unit name
  src/App.tsx                -> import + route for /library/units/:unitId/tutor

USAGE (run from ~/runyenjes-platform/frontend):
    python3 generate_unit_tutor.py

Idempotent: skips existing page file (use --force to overwrite), skips
patches already applied.
"""

import argparse
import os
import sys

UNIT_TUTOR_PATH = os.path.join("src", "pages", "UnitTutor.tsx")
LIBRARY_UNITS_PATH = os.path.join("src", "pages", "LibraryUnits.tsx")
APP_PATH = os.path.join("src", "App.tsx")

UNIT_TUTOR_TSX = """import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface QuizOption {
  id: string;
  text: string;
}

interface QuizQuestion {
  prompt: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation: string;
}

export default function UnitTutor() {
  const { unitId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const unitName = (location.state as { unitName?: string } | null)?.unitName || 'this unit';
  const [tab, setTab] = useState<'tutor' | 'quiz'>(searchParams.get('tab') === 'quiz' ? 'quiz' : 'tutor');

  // ---- Tutor chat state ----
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !unitId) return;
    setChatError('');
    const userMessage = draft.trim();
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setDraft('');
    setSending(true);
    try {
      const data = await api('/ai/chat', {
        method: 'POST',
        token,
        body: { message: userMessage, conversationId: conversationId || undefined, unitId },
      });
      setConversationId(data.conversationId);
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Could not reach the AI tutor');
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  }

  // ---- Quiz state ----
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState('');

  async function handleGenerateQuiz() {
    if (!unitId) return;
    setQuizError('');
    setQuizLoading(true);
    setSubmitted(false);
    setAnswers({});
    try {
      const data = await api('/ai/quiz', { method: 'POST', token, body: { unitId, questionCount: 5 } });
      setQuestions(data.questions || []);
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : 'Could not generate a quiz');
    } finally {
      setQuizLoading(false);
    }
  }

  const score = questions.reduce((sum, q, i) => (answers[i] === q.correctOptionId ? sum + 1 : sum), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-sm text-gray-500 underline">
          \u2190 Back
        </button>
        <h1 className="font-bold text-rgreen text-sm truncate max-w-[60%]">{unitName}</h1>
      </header>

      <div className="max-w-md mx-auto px-4 pt-3">
        <div className="flex rounded-md overflow-hidden border border-gray-200">
          <button
            type="button"
            onClick={() => setTab('tutor')}
            className={`flex-1 py-2 text-sm font-medium ${tab === 'tutor' ? 'bg-rgreen text-white' : 'bg-white text-gray-600'}`}
          >
            \U0001f393 AI Tutor
          </button>
          <button
            type="button"
            onClick={() => setTab('quiz')}
            className={`flex-1 py-2 text-sm font-medium ${tab === 'quiz' ? 'bg-rgreen text-white' : 'bg-white text-gray-600'}`}
          >
            \U0001f4dd Practice Quiz
          </button>
        </div>
      </div>

      {tab === 'tutor' ? (
        <main className="max-w-md mx-auto p-4 flex flex-col" style={{ minHeight: 'calc(100vh - 140px)' }}>
          <p className="text-xs text-gray-400 mb-3">
            Ask anything about {unitName}. Answers draw on general subject knowledge plus the materials on file for this unit.
          </p>

          <div className="flex-1 space-y-3 mb-3">
            {messages.length === 0 && (
              <p className="text-sm text-gray-400 text-center mt-8">Ask your first question below.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                    m.role === 'user' ? 'bg-rgreen text-white' : 'bg-white shadow text-gray-800'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && <p className="text-xs text-gray-400">Thinking\u2026</p>}
            <div ref={bottomRef} />
          </div>

          {chatError && <p className="text-xs text-rmaroon mb-2">{chatError}</p>}

          <form onSubmit={handleSend} className="flex gap-2 sticky bottom-4">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask a question\u2026"
              className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm bg-white"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-full disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </main>
      ) : (
        <main className="max-w-md mx-auto p-4 space-y-3">
          {quizError && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{quizError}</div>}

          {questions.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <p className="text-sm text-gray-500 mb-4">
                Generate a 5-question practice quiz on {unitName}.
              </p>
              <button
                onClick={handleGenerateQuiz}
                disabled={quizLoading}
                className="bg-rgreen text-white text-sm font-medium px-5 py-2 rounded-md disabled:opacity-50"
              >
                {quizLoading ? 'Generating\u2026' : 'Generate Quiz'}
              </button>
            </div>
          ) : (
            <>
              {questions.map((q, i) => (
                <div key={i} className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm font-medium text-gray-900 mb-2">
                    {i + 1}. {q.prompt}
                  </p>
                  <div className="space-y-1">
                    {q.options.map((opt) => {
                      const isSelected = answers[i] === opt.id;
                      const isCorrect = submitted && opt.id === q.correctOptionId;
                      const isWrongSelected = submitted && isSelected && opt.id !== q.correctOptionId;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={submitted}
                          onClick={() => setAnswers((prev) => ({ ...prev, [i]: opt.id }))}
                          className={`w-full text-left text-sm px-3 py-2 rounded-md border ${
                            isCorrect
                              ? 'border-green-500 bg-green-50'
                              : isWrongSelected
                              ? 'border-red-400 bg-red-50'
                              : isSelected
                              ? 'border-rgreen bg-gray-50'
                              : 'border-gray-200'
                          }`}
                        >
                          {opt.text}
                        </button>
                      );
                    })}
                  </div>
                  {submitted && (
                    <p className="text-xs text-gray-500 mt-2">{q.explanation}</p>
                  )}
                </div>
              ))}

              {!submitted ? (
                <button
                  onClick={() => setSubmitted(true)}
                  disabled={Object.keys(answers).length < questions.length}
                  className="w-full bg-rgreen text-white text-sm font-medium py-2.5 rounded-md disabled:opacity-50"
                >
                  Submit Quiz
                </button>
              ) : (
                <div className="bg-white rounded-lg shadow p-4 text-center space-y-3">
                  <p className="font-semibold text-gray-900">
                    Score: {score} / {questions.length}
                  </p>
                  <button
                    onClick={handleGenerateQuiz}
                    className="text-sm text-rgreen underline"
                  >
                    Generate a new quiz
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      )}
    </div>
  );
}
"""


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def write_page(force: bool) -> None:
    os.makedirs(os.path.dirname(UNIT_TUTOR_PATH), exist_ok=True)
    if os.path.exists(UNIT_TUTOR_PATH) and not force:
        print("SKIP  " + UNIT_TUTOR_PATH + " already exists (use --force to overwrite)")
        return
    with open(UNIT_TUTOR_PATH, "w", encoding="utf-8") as f:
        f.write(UNIT_TUTOR_TSX)
    print("WROTE " + UNIT_TUTOR_PATH)


LIBRARY_UNITS_OLD = """              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">{unit.name}</p>
                {canManage && (
                  <button
                    onClick={() => handleDeleteUnit(unit.id)}
                    className="text-xs text-rmaroon underline"
                  >
                    Delete
                  </button>
                )}
              </div>"""

LIBRARY_UNITS_NEW = """              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">{unit.name}</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigate(`/library/units/${unit.id}/tutor`, { state: { unitName: unit.name } })}
                    className="text-xs text-rgreen underline"
                  >
                    \U0001f393 AI Tutor
                  </button>
                  <button
                    onClick={() =>
                      navigate(`/library/units/${unit.id}/tutor?tab=quiz`, { state: { unitName: unit.name } })
                    }
                    className="text-xs text-rgreen underline"
                  >
                    \U0001f4dd Quiz
                  </button>
                  {canManage && (
                    <button
                      onClick={() => handleDeleteUnit(unit.id)}
                      className="text-xs text-rmaroon underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>"""


def patch_library_units() -> None:
    if not os.path.isfile(LIBRARY_UNITS_PATH):
        print("ERROR: '" + LIBRARY_UNITS_PATH + "' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)
    with open(LIBRARY_UNITS_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    if "AI Tutor" in content:
        print("SKIP  " + LIBRARY_UNITS_PATH + " already patched.")
        return
    if LIBRARY_UNITS_OLD not in content:
        print("ERROR: could not find the expected unit card header block in " + LIBRARY_UNITS_PATH + ". Patch manually.")
        sys.exit(1)
    content = content.replace(LIBRARY_UNITS_OLD, LIBRARY_UNITS_NEW)
    with open(LIBRARY_UNITS_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print("PATCHED " + LIBRARY_UNITS_PATH + " (added AI Tutor + Quiz buttons to each unit)")


def patch_app() -> None:
    if not os.path.isfile(APP_PATH):
        print("ERROR: '" + APP_PATH + "' not found.")
        sys.exit(1)
    with open(APP_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "UnitTutor" in joined:
        print("SKIP  " + APP_PATH + " already patched.")
        return

    import_idx = find_line_index(lines, "LibraryUnits from './pages/LibraryUnits'")
    if import_idx is None:
        print("ERROR: could not find LibraryUnits import in " + APP_PATH + ". Patch manually.")
        sys.exit(1)

    route_idx = find_line_index(lines, '"/library/:programId"')
    if route_idx is None:
        print("ERROR: could not find the /library/:programId route in " + APP_PATH + ". Patch manually.")
        sys.exit(1)

    new_import = "import UnitTutor from './pages/UnitTutor';\n"
    new_route = '          <Route path="/library/units/:unitId/tutor" element={<UnitTutor />} />\n'

    if route_idx > import_idx:
        lines2 = lines[: route_idx + 1] + [new_route] + lines[route_idx + 1 :]
        lines3 = lines2[: import_idx + 1] + [new_import] + lines2[import_idx + 1 :]
    else:
        lines2 = lines[: import_idx + 1] + [new_import] + lines[import_idx + 1 :]
        route_idx2 = find_line_index(lines2, '"/library/:programId"')
        lines3 = lines2[: route_idx2 + 1] + [new_route] + lines2[route_idx2 + 1 :]

    with open(APP_PATH, "w") as f:
        f.writelines(lines3)
    print("PATCHED " + APP_PATH + " (added UnitTutor import + route)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    write_page(args.force)
    patch_library_units()
    patch_app()

    print("")
    print("Done.")


if __name__ == "__main__":
    main()
