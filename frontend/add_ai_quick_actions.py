#!/usr/bin/env python3
"""
Adds role-specific quick-action buttons to AIAssistant.tsx. Shown only on
a fresh/new chat (messages.length === 0, no activeId). Clicking one calls
POST /ai/assist with that action and displays the result inline.

USAGE (run from ~/runyenjes-platform/frontend):
    python3 add_ai_quick_actions.py

Idempotent: skips if already patched.
"""

import os
import sys

TARGET = os.path.join("src", "pages", "AIAssistant.tsx")

QUICK_ACTIONS_CONST = """
const QUICK_ACTIONS: Record<string, { action: string; label: string; icon: string }[]> = {
  STUDENT: [
    { action: 'student_deadlines', label: 'Summarize my upcoming deadlines', icon: '\\ud83d\\udcc5' },
    { action: 'student_fees', label: 'Explain my fee balance', icon: '\\ud83d\\udcb0' },
  ],
  TEACHER: [
    { action: 'teacher_class_performance', label: "Summarize my classes' performance", icon: '\\ud83d\\udcca' },
  ],
  REGISTRAR: [
    { action: 'registrar_pending_applications', label: 'Summarize pending applications', icon: '\\ud83d\\udcdd' },
  ],
  ADMIN: [
    { action: 'admin_stats_summary', label: 'Summarize institution stats', icon: '\\ud83d\\udcc8' },
  ],
  PROCUREMENT_OFFICER: [
    { action: 'procurement_pending_requests', label: 'Summarize pending purchase requests', icon: '\\ud83d\\udcc4' },
  ],
  STORES_OFFICER: [
    { action: 'stores_low_stock', label: "What's low on stock right now", icon: '\\ud83d\\udce6' },
  ],
  FINANCE_OFFICER: [
    { action: 'finance_outstanding_invoices', label: 'Summarize outstanding invoices', icon: '\\ud83d\\udcb3' },
  ],
  HR_OFFICER: [
    { action: 'hr_pending_leave', label: 'Summarize pending leave requests', icon: '\\ud83d\\udc65' },
  ],
  EXAM_OFFICER: [
    { action: 'examofficer_results_summary', label: 'Summarize my exam results', icon: '\\ud83d\\udcca' },
  ],
  ALUMNI: [
    { action: 'alumni_career_tips', label: 'Give me career advice', icon: '\\ud83c\\udf93' },
  ],
};
"""

IMPORT_ANCHOR = "import { api } from '../api/client';"

HANDLER_ANCHOR = "  function startNewChat() {"

NEW_HANDLER = """  async function handleQuickAction(action: string, label: string) {
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: label }]);
    setSending(true);
    try {
      const data = await api('/ai/assist', { method: 'POST', token, body: { action } });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete that request');
    } finally {
      setSending(false);
    }
  }

  function startNewChat() {"""

OLD_EMPTY_STATE = """            {messages.length === 0 && (
              <div className="text-center text-sm text-gray-400 mt-10">
                Ask me anything about your coursework — explain a concept, summarize notes,
                or help you study for an upcoming test.
              </div>
            )}"""

NEW_EMPTY_STATE = """            {messages.length === 0 && !activeId && (
              <div className="mt-6 space-y-4">
                {(QUICK_ACTIONS[user.role] ?? []).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400 text-center">Quick actions for your role:</p>
                    {(QUICK_ACTIONS[user.role] ?? []).map((qa) => (
                      <button
                        key={qa.action}
                        onClick={() => handleQuickAction(qa.action, `${qa.icon} ${qa.label}`)}
                        disabled={sending}
                        className="w-full text-left bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 hover:border-rgreen hover:shadow-sm transition disabled:opacity-50"
                      >
                        <span className="mr-2">{qa.icon}</span>
                        {qa.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="text-center text-sm text-gray-400">
                  Or ask me anything about your coursework — explain a concept, summarize notes,
                  or help you study for an upcoming test.
                </div>
              </div>
            )}"""


def main():
    if not os.path.isfile(TARGET):
        print("ERROR: '" + TARGET + "' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)
    with open(TARGET, "r", encoding="utf-8") as f:
        content = f.read()

    if "QUICK_ACTIONS" in content:
        print("SKIP  " + TARGET + " already patched.")
        return

    if IMPORT_ANCHOR not in content:
        print("ERROR: could not find the api import in " + TARGET + ". Patch manually.")
        sys.exit(1)
    content = content.replace(IMPORT_ANCHOR, IMPORT_ANCHOR + "\n" + QUICK_ACTIONS_CONST, 1)

    if HANDLER_ANCHOR not in content:
        print("ERROR: could not find startNewChat in " + TARGET + ". Patch manually.")
        sys.exit(1)
    content = content.replace(HANDLER_ANCHOR, NEW_HANDLER, 1)

    if OLD_EMPTY_STATE not in content:
        print("ERROR: could not find the empty-state message block in " + TARGET + ". Patch manually.")
        sys.exit(1)
    content = content.replace(OLD_EMPTY_STATE, NEW_EMPTY_STATE, 1)

    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(content)

    print("PATCHED " + TARGET + " (added role-specific quick actions to a fresh chat)")


if __name__ == "__main__":
    main()
