#!/usr/bin/env python3
"""
Adds POST /ai/assist to ai.routes.ts: a single endpoint with a small
action registry. Each action is scoped to a role (Admin can trigger any
action too), gathers real data for that user, and asks AI to
summarize/advise -- reusing the existing callGroq/handleGroqError helpers.

Actions in this first pass (all zero-parameter, one-click):
  student_deadlines            (STUDENT)   - upcoming/pending assignments
  student_fees                 (STUDENT)   - invoice/payment balance explainer
  teacher_class_performance     (TEACHER)   - scores across their units this term
  registrar_pending_applications(REGISTRAR) - submitted applications needing action
  admin_stats_summary          (ADMIN)     - narrative institution stats summary
  procurement_pending_requests (PROCUREMENT_OFFICER) - pending/approved purchase requests
  stores_low_stock             (STORES_OFFICER)      - items at/below reorder level
  finance_outstanding_invoices (FINANCE_OFFICER)      - unpaid/partial invoices
  hr_pending_leave             (HR_OFFICER)           - pending leave requests
  examofficer_results_summary  (EXAM_OFFICER)         - results across exams they created
  alumni_career_tips           (ALUMNI)    - general career advice from their profile

USAGE (run from ~/runyenjes-platform/backend):
    python3 add_ai_assist_endpoint.py

Idempotent: skips if already patched.
"""

import os
import sys

TARGET = os.path.join("src", "routes", "ai.routes.ts")

INSERT_ANCHOR = "export default router;"

NEW_ASSIST_CODE = '''
// ─────────────────────────────────────────────
// AI ASSIST: role-specific one-click quick actions
// ─────────────────────────────────────────────
// Each action gathers real data for the requesting user and asks AI to
// summarize/advise on it. Admin can trigger any action, in addition to
// its own primary role.

type AssistAction = {
  roles: string[];
  systemPrompt: string;
  maxTokens?: number;
  build: (userId: string) => Promise<string>;
};

const ASSIST_ACTIONS: Record<string, AssistAction> = {
  student_deadlines: {
    roles: ['STUDENT'],
    systemPrompt:
      'You help a TVET student stay on top of their coursework. Summarize and prioritize what needs attention, keep it short and actionable.',
    build: async (userId) => {
      const term = await prisma.term.findFirst({ where: { isActive: true } });
      if (!term) return 'No active academic term right now, so there are no tracked deadlines.';

      const registrations = await prisma.unitRegistration.findMany({
        where: { studentId: userId, termId: term.id, status: 'REGISTERED' },
        include: { unit: true },
      });
      const unitIds = registrations.map((r) => r.unitId);
      if (unitIds.length === 0) return 'This student is not registered for any units this term.';

      const assignments = await prisma.assignment.findMany({
        where: { unitId: { in: unitIds } },
        include: { unit: true },
      });
      const mySubs = await prisma.assignmentSubmission.findMany({ where: { studentId: userId } });
      const submittedIds = new Set(mySubs.map((s) => s.assignmentId));
      const pending = assignments.filter((a) => !submittedIds.has(a.id));

      if (pending.length === 0) return 'The student has no pending (unsubmitted) assignments right now. Congratulate them.';

      const list = pending
        .map((a) => `- "${a.title}" (${a.unit.name})${a.dueDate ? ` -- due ${a.dueDate.toDateString()}` : ' -- no due date set'}`)
        .join('\\n');

      return `Here are the student's pending (not yet submitted) assignments:\\n${list}\\n\\nSummarize and prioritize these for the student.`;
    },
  },

  student_fees: {
    roles: ['STUDENT'],
    systemPrompt:
      'You explain fee/billing situations to a TVET student in plain, reassuring, non-alarming language. Be factual and clear about what they owe and what to do next.',
    build: async (userId) => {
      const invoices = await prisma.invoice.findMany({
        where: { studentId: userId },
        include: { payments: true },
        orderBy: { createdAt: 'desc' },
      });
      if (invoices.length === 0) return 'This student has no invoices on record. Tell them their account has no billed fees yet.';

      const lines = invoices.map((inv) => {
        const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const balance = Number(inv.amount) - paid;
        return `- ${inv.description}: billed KES ${inv.amount}, paid KES ${paid}, balance KES ${balance} (status: ${inv.status})`;
      });

      return `Here is the student's invoice history:\\n${lines.join('\\n')}\\n\\nExplain their overall balance and what they should do next.`;
    },
  },

  teacher_class_performance: {
    roles: ['TEACHER'],
    systemPrompt:
      'You help a TVET teacher understand how their classes are performing. Identify trends and flag students who may need extra support. Be concise.',
    build: async (userId) => {
      const term = await prisma.term.findFirst({ where: { isActive: true } });
      if (!term) return 'No active academic term right now, so there is no performance data to summarize.';

      const myUnits = await prisma.unitLecturer.findMany({
        where: { lecturerId: userId, termId: term.id },
        include: { unit: true },
      });
      const unitIds = myUnits.map((u) => u.unitId);
      if (unitIds.length === 0) return 'This teacher has no assigned units this term.';

      const assignments = await prisma.assignment.findMany({ where: { unitId: { in: unitIds } } });
      const assignmentIds = assignments.map((a) => a.id);

      const submissions = assignmentIds.length
        ? await prisma.assignmentSubmission.findMany({
            where: { assignmentId: { in: assignmentIds }, score: { not: null } },
            include: {
              student: { select: { name: true } },
              assignment: { select: { title: true, maxScore: true } },
            },
          })
        : [];

      if (submissions.length === 0) return "No graded assignment submissions yet across this teacher's units.";

      const list = submissions
        .map((s) => `- ${s.student.name}: ${s.score}/${s.assignment.maxScore} on "${s.assignment.title}"`)
        .join('\\n');

      return `Here are graded assignment scores across this teacher's units this term:\\n${list}\\n\\nSummarize trends and flag any students who may need extra support.`;
    },
  },

  registrar_pending_applications: {
    roles: ['REGISTRAR'],
    systemPrompt:
      'You help a TVET registrar triage pending admissions applications. Prioritize what needs attention first (e.g. oldest, payment issues). Be concise.',
    build: async () => {
      const applications = await prisma.application.findMany({
        where: { status: 'SUBMITTED' },
        include: { program: true },
        orderBy: { createdAt: 'asc' },
      });
      if (applications.length === 0) return 'There are no pending (SUBMITTED) applications right now.';

      const list = applications
        .slice(0, 30)
        .map((a) => `- ${a.applicantName} -> ${a.program.name} (applied ${a.createdAt.toDateString()})`)
        .join('\\n');

      return `There are ${applications.length} pending applications. Here are up to 30 of them:\\n${list}\\n\\nSummarize and suggest what to prioritize.`;
    },
  },

  admin_stats_summary: {
    roles: ['ADMIN'],
    systemPrompt:
      'You give a TVET college administrator a brief narrative summary of institution stats, with 2-3 suggested action items. Be concise and practical.',
    build: async () => {
      const [students, teachers, departments, pendingApplications] = await Promise.all([
        prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
        prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE' } }),
        prisma.department.count(),
        prisma.application.count({ where: { status: 'SUBMITTED' } }),
      ]);

      return `Institution stats: ${students} active students, ${teachers} active teachers, ${departments} departments, ${pendingApplications} pending applications.\\n\\nWrite a short narrative summary with 2-3 suggested action items.`;
    },
  },

  procurement_pending_requests: {
    roles: ['PROCUREMENT_OFFICER'],
    systemPrompt:
      'You help a procurement officer prioritize purchase requests. Flag anything urgent (e.g. large quantities, items likely critical). Be concise.',
    build: async () => {
      const requests = await prisma.purchaseRequest.findMany({
        where: { status: { in: ['PENDING', 'APPROVED'] } },
        include: { item: true, requestedBy: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      });
      if (requests.length === 0) return 'There are no pending or approved purchase requests right now.';

      const list = requests
        .map((r) => `- ${r.requestedBy.name} requested ${r.quantity} x ${r.item.name} (status: ${r.status})`)
        .join('\\n');

      return `Here are the pending/approved purchase requests:\\n${list}\\n\\nSummarize and suggest what to prioritize.`;
    },
  },

  stores_low_stock: {
    roles: ['STORES_OFFICER'],
    systemPrompt:
      'You help a stores/inventory officer know what needs reordering soon. Be concise and practical.',
    build: async () => {
      const items = await prisma.inventoryItem.findMany();
      const low = items.filter((i) => Number(i.quantityOnHand) <= Number(i.reorderLevel));
      if (low.length === 0) return 'No items are currently at or below their reorder level. Everything looks fine.';

      const list = low
        .map((i) => `- ${i.name}: ${i.quantityOnHand} ${i.uom} on hand (reorder level: ${i.reorderLevel})`)
        .join('\\n');

      return `These items are at or below their reorder level:\\n${list}\\n\\nSummarize and suggest reorder priorities.`;
    },
  },

  finance_outstanding_invoices: {
    roles: ['FINANCE_OFFICER'],
    systemPrompt:
      'You help a finance officer prioritize fee collection. Be concise and practical, focused on the largest/oldest balances first.',
    build: async () => {
      const invoices = await prisma.invoice.findMany({
        where: { status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] } },
        include: { student: { select: { name: true } }, payments: true },
        orderBy: { createdAt: 'asc' },
      });
      if (invoices.length === 0) return 'There are no outstanding invoices right now.';

      const list = invoices
        .slice(0, 30)
        .map((inv) => {
          const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
          const balance = Number(inv.amount) - paid;
          return `- ${inv.student.name}: balance KES ${balance} (status: ${inv.status})`;
        })
        .join('\\n');

      return `There are ${invoices.length} outstanding invoices. Here are up to 30 of them:\\n${list}\\n\\nSummarize and suggest collection priorities.`;
    },
  },

  hr_pending_leave: {
    roles: ['HR_OFFICER'],
    systemPrompt:
      'You help an HR officer review pending staff leave requests. Be concise, note any coverage considerations if types/dates suggest overlap.',
    build: async () => {
      const requests = await prisma.leaveRequest.findMany({
        where: { status: 'PENDING' },
        include: { staff: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      });
      if (requests.length === 0) return 'There are no pending leave requests right now.';

      const list = requests
        .map(
          (r) =>
            `- ${r.staff.name}: ${r.type} leave, ${r.startDate.toDateString()} to ${r.endDate.toDateString()}`
        )
        .join('\\n');

      return `Here are the pending leave requests:\\n${list}\\n\\nSummarize and suggest approval priority/coverage considerations.`;
    },
  },

  examofficer_results_summary: {
    roles: ['EXAM_OFFICER'],
    systemPrompt:
      'You help an exams officer understand results trends across the exams they administer. Flag low pass rates or struggling students. Be concise.',
    build: async (userId) => {
      const exams = await prisma.exam.findMany({
        where: { createdById: userId },
        include: { unit: true, results: { include: { student: { select: { name: true } } } } },
      });
      if (exams.length === 0) return 'This exam officer has not created any exams yet.';

      const lines = exams.map((e) => {
        if (e.results.length === 0) return `- "${e.name}" (${e.unit.name}): no results recorded yet`;
        const scores = e.results.map((r) => Number(r.score));
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return `- "${e.name}" (${e.unit.name}): ${e.results.length} result(s), average ${avg.toFixed(1)}/${e.maxScore}`;
      });

      return `Here is a summary of exams this officer administers:\\n${lines.join('\\n')}\\n\\nSummarize trends and flag any concerns.`;
    },
  },

  alumni_career_tips: {
    roles: ['ALUMNI'],
    systemPrompt:
      'You give a TVET college graduate practical, encouraging career development advice for the trade/field they trained in.',
    build: async (userId) => {
      const profile = await prisma.alumniProfile.findUnique({ where: { userId } });
      const details = profile
        ? `Graduation year: ${profile.graduationYear ?? 'unknown'}. Current employer: ${profile.currentEmployer ?? 'not set'}. Current position: ${profile.currentPosition ?? 'not set'}.`
        : 'No further profile details on file.';

      return `${details}\\n\\nGive this alumnus 3-4 practical, encouraging career development suggestions.`;
    },
  },
};

// ---------- Role-specific one-click AI assist actions ----------
router.post('/assist', requireAuth, async (req, res) => {
  const { action } = req.body;
  const actionDef = ASSIST_ACTIONS[action];
  if (!actionDef) {
    return res.status(400).json({ error: 'Unknown assist action' });
  }

  const allowed = actionDef.roles.includes(req.user!.role) || req.user!.role === 'ADMIN';
  if (!allowed) {
    return res.status(403).json({ error: 'This assistant action is not available for your role' });
  }

  try {
    const context = await actionDef.build(req.user!.userId);
    const reply = await callGroq(actionDef.systemPrompt, context, actionDef.maxTokens || 700);
    res.json({ reply });
  } catch (err) {
    handleGroqError(err, res);
  }
});

export default router;
'''


def main():
    if not os.path.isfile(TARGET):
        print("ERROR: '" + TARGET + "' not found. Run this from ~/runyenjes-platform/backend.")
        sys.exit(1)
    with open(TARGET, "r", encoding="utf-8") as f:
        content = f.read()

    if "ASSIST_ACTIONS" in content:
        print("SKIP  " + TARGET + " already patched.")
        return

    if INSERT_ANCHOR not in content:
        print("ERROR: could not find 'export default router;' in " + TARGET + ". Patch manually.")
        sys.exit(1)

    content = content.replace(INSERT_ANCHOR, NEW_ASSIST_CODE.strip() + "\n", 1)

    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(content)

    print("PATCHED " + TARGET + " (added POST /ai/assist with 11 role-specific actions)")


if __name__ == "__main__":
    main()
