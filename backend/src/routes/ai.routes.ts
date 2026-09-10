import { Router } from 'express';
import dns from 'dns';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';

// Some networks have flaky/unrouted IPv6, which makes Node's default
// "try IPv6 first" behavior hang until timeout before falling back to IPv4.
// Forcing IPv4-first avoids that entirely.
dns.setDefaultResultOrder('ipv4first');

const router = Router();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-120b';

const SYSTEM_PROMPT = `You are the Runyenjes Technical & Vocational College study assistant.
You help students and staff with study questions, explaining concepts from their coursework,
summarizing notes, and general TVET-related academic help. Be clear, concise, and encouraging.
If asked something completely unrelated to school/learning, you can still help, but gently
steer back toward being a helpful study companion. Keep answers reasonably short unless the
person asks for more detail.`;

// Shared helper: call Groq with a system prompt + a single user message,
// used by the stateless AI Learning endpoints below. Returns the reply
// text, or throws with a message suitable for a 502 response.
async function callGroq(systemPrompt: string, userMessage: string, maxTokens = 1000): Promise<string> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('NOT_CONFIGURED');
  }

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.6,
      max_tokens: maxTokens,
      reasoning_effort: 'low',
    }),
  });

  if (response.status === 429) {
    throw new Error('RATE_LIMITED');
  }
  if (!response.ok) {
    const errText = await response.text();
    console.error('Groq API error:', errText);
    throw new Error('UPSTREAM_ERROR');
  }

  const data: any = await response.json();
  return data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
}

function handleGroqError(err: unknown, res: any) {
  const message = err instanceof Error ? err.message : '';
  if (message === 'NOT_CONFIGURED') {
    return res.status(500).json({ error: 'AI assistant is not configured on the server yet' });
  }
  if (message === 'RATE_LIMITED') {
    return res
      .status(429)
      .json({ error: 'The AI assistant is busy right now (daily limit reached). Please try again shortly.' });
  }
  console.error('AI learning endpoint error:', err);
  return res.status(502).json({ error: 'The AI assistant is temporarily unavailable.' });
}

// Builds a short context block describing a unit -- name, programme,
// department, and its material titles/types -- for grounding AI prompts.
// Note: this uses material metadata (titles/types), not full file
// contents, so answers draw on general subject knowledge plus what's
// listed here, not a deep read of the actual uploaded files.
async function buildUnitContext(unitId: string): Promise<string> {
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    include: {
      program: { include: { department: true } },
      materials: { select: { type: true, fileUrl: true } },
    },
  });
  if (!unit) return '';

  const materialList = unit.materials.length
    ? unit.materials.map((m) => `- [${m.type}] ${m.fileUrl}`).join('\n')
    : 'No materials uploaded yet for this unit.';

  return `Unit: ${unit.name}
Programme: ${unit.program.name} ${unit.program.level ?? ''}
Department: ${unit.program.department.name}
Materials on file for this unit:
${materialList}`;
}

// ---------- List my past conversations ----------
router.get('/conversations', requireAuth, async (req, res) => {
  const conversations = await prisma.aIConversation.findMany({
    where: { userId: req.user!.userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, updatedAt: true, unitId: true },
  });
  res.json(conversations);
});

// ---------- Get messages in a specific conversation (mine only) ----------
router.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  const { id } = req.params;
  const convo = await prisma.aIConversation.findUnique({ where: { id } });
  if (!convo || convo.userId !== req.user!.userId) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  const messages = await prisma.aIMessage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'asc' },
  });
  res.json(messages);
});

// ---------- Delete a conversation ----------
router.delete('/conversations/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const convo = await prisma.aIConversation.findUnique({ where: { id } });
  if (!convo || convo.userId !== req.user!.userId) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  await prisma.aIMessage.deleteMany({ where: { conversationId: id } });
  await prisma.aIConversation.delete({ where: { id } });
  res.status(204).send();
});

// ---------- Send a message — creates a new conversation if conversationId is omitted ----------
// If unitId is provided on a NEW conversation, the conversation becomes a
// Unit Tutor scoped to that unit's context for every message going forward.
router.post('/chat', requireAuth, async (req, res) => {
  const { message, conversationId, unitId } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'A message is required' });
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'AI assistant is not configured on the server yet' });
  }

  let convo;
  if (conversationId) {
    convo = await prisma.aIConversation.findUnique({ where: { id: conversationId } });
    if (!convo || convo.userId !== req.user!.userId) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
  } else {
    convo = await prisma.aIConversation.create({
      data: {
        userId: req.user!.userId,
        title: message.trim().slice(0, 60),
        unitId: unitId || null,
      },
    });
  }

  // Save the user's message immediately
  await prisma.aIMessage.create({
    data: { conversationId: convo.id, role: 'user', content: message.trim() },
  });

  // Build full history for context
  const history = await prisma.aIMessage.findMany({
    where: { conversationId: convo.id },
    orderBy: { createdAt: 'asc' },
  });

  // If this conversation is scoped to a unit, ground the system prompt in
  // that unit's context (looked up fresh each time, cheap query).
  let systemPrompt = SYSTEM_PROMPT;
  if (convo.unitId) {
    const unitContext = await buildUnitContext(convo.unitId);
    if (unitContext) {
      systemPrompt = `${SYSTEM_PROMPT}

You are specifically tutoring this student on the following unit. Ground your answers in this
context where relevant, and reference the materials listed if they seem useful, but you may also
draw on your general subject knowledge of the topic.

${unitContext}`;
    }
  }

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map((h) => ({ role: h.role, content: h.content })),
        ],
        temperature: 0.6,
        max_tokens: 800,
      }),
    });

    if (response.status === 429) {
      return res
        .status(429)
        .json({ error: 'The AI assistant is busy right now (daily limit reached). Please try again shortly.' });
    }
    if (!response.ok) {
      const errText = await response.text();
      console.error('Groq API error:', errText);
      return res.status(502).json({ error: 'The AI assistant is temporarily unavailable.' });
    }

    const data: any = await response.json();
    const reply = data.choices?.[0]?.message?.content ?? 'Sorry, I could not generate a response.';

    await prisma.aIMessage.create({
      data: { conversationId: convo.id, role: 'assistant', content: reply },
    });
    await prisma.aIConversation.update({
      where: { id: convo.id },
      data: { updatedAt: new Date() },
    });

    res.json({ reply, conversationId: convo.id, unitId: convo.unitId });
  } catch (err) {
    console.error('AI assistant error:', err);
    res.status(502).json({ error: 'The AI assistant is temporarily unavailable.' });
  }
});

// ---------- AI Quiz Generator: practice questions for a unit ----------
router.post('/quiz', requireAuth, async (req, res) => {
  const { unitId, questionCount } = req.body;
  if (!unitId) return res.status(400).json({ error: 'unitId is required' });

  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  const count = Math.min(Math.max(Number(questionCount) || 5, 1), 10);
  const unitContext = await buildUnitContext(unitId);

  const prompt = `${unitContext}

Generate ${count} multiple-choice practice questions for a student studying this unit.
Respond with ONLY valid JSON (no markdown, no commentary), in exactly this shape:
{
  "questions": [
    {
      "prompt": "question text",
      "options": [{"id": "a", "text": "..."}, {"id": "b", "text": "..."}, {"id": "c", "text": "..."}, {"id": "d", "text": "..."}],
      "correctOptionId": "a",
      "explanation": "why this answer is correct"
    }
  ]
}`;

  try {
    const reply = await callGroq(
      'You generate exam-quality multiple-choice quizzes for TVET students. Respond with ONLY valid JSON, nothing else.',
      prompt,
      1500
    );
    const cleaned = reply.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    res.json(parsed);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: 'The AI returned an unexpected format. Please try again.' });
    }
    handleGroqError(err, res);
  }
});

// ---------- AI Assignment Feedback: hints on a draft before submitting ----------
router.post('/assignment-feedback', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const { assignmentId, draftText } = req.body;
  if (!assignmentId || !draftText || !draftText.trim()) {
    return res.status(400).json({ error: 'assignmentId and draftText are required' });
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { unit: true },
  });
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

  const prompt = `Assignment: ${assignment.title}
Unit: ${assignment.unit.name}
Assignment description: ${assignment.description || 'No description provided.'}

Student's draft answer:
${draftText.trim()}

Give constructive feedback and hints to help the student improve their answer before they submit
it for grading. Do NOT give them the final answer outright if this looks like a problem to solve
-- guide them. Keep it encouraging and specific. Do not assign a numeric score yourself; a
teacher will do that separately.`;

  try {
    const reply = await callGroq(
      'You are a supportive TVET tutor giving draft feedback, not a grader. Be specific and encouraging.',
      prompt,
      600
    );
    res.json({ feedback: reply });
  } catch (err) {
    handleGroqError(err, res);
  }
});

// ---------- AI Grading Suggestion: teacher gets a suggested score + comment ----------
router.post(
  '/grading-suggestion',
  requireAuth,
  requireRole('TEACHER', 'ADMIN'),
  async (req, res) => {
    const { submissionId } = req.body;
    if (!submissionId) return res.status(400).json({ error: 'submissionId is required' });

    const submission = await prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: { assignment: { include: { unit: true } }, student: { select: { name: true } } },
    });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    const prompt = `Assignment: ${submission.assignment.title}
Unit: ${submission.assignment.unit.name}
Assignment description: ${submission.assignment.description || 'No description provided.'}
Maximum score: ${submission.assignment.maxScore}

Student's submitted answer:
${submission.textAnswer || '(No text answer -- see file/link: ' + (submission.fileUrl || 'none provided') + ')'}

Suggest a score out of the maximum, and a short feedback comment. This is only a SUGGESTION --
the teacher will review and can change it before saving. Respond with ONLY valid JSON, in exactly
this shape: {"suggestedScore": <number>, "suggestedFeedback": "<comment>"}`;

    try {
      const reply = await callGroq(
        'You assist teachers by suggesting draft grades. Respond with ONLY valid JSON, nothing else.',
        prompt,
        400
      );
      const cleaned = reply.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      res.json(parsed);
    } catch (err) {
      if (err instanceof SyntaxError) {
        return res.status(502).json({ error: 'The AI returned an unexpected format. Please try again.' });
      }
      handleGroqError(err, res);
    }
  }
);

// ---------- AI Content Generator: draft a material description or assignment brief ----------
router.post(
  '/generate-content',
  requireAuth,
  requireRole('TEACHER', 'ADMIN'),
  async (req, res) => {
    const { unitId, contentType, topic } = req.body; // contentType: 'material' | 'assignment'
    if (!unitId || !contentType || !topic) {
      return res.status(400).json({ error: 'unitId, contentType and topic are required' });
    }
    if (contentType !== 'material' && contentType !== 'assignment') {
      return res.status(400).json({ error: "contentType must be 'material' or 'assignment'" });
    }

    const unit = await prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const prompt =
      contentType === 'material'
        ? `Unit: ${unit.name}
Topic: ${topic}

Draft a short learning material description/summary (a few paragraphs) a teacher could use as
lecture notes or a resource description for this topic. Keep it practical and TVET-appropriate.`
        : `Unit: ${unit.name}
Topic: ${topic}

Draft an assignment brief for this topic: a clear title, and a description explaining what
students should do. Respond with ONLY valid JSON in exactly this shape:
{"title": "...", "description": "..."}`;

    try {
      const reply = await callGroq(
        'You help TVET teachers draft course content quickly. Keep it practical and clear.',
        prompt,
        800
      );

      if (contentType === 'assignment') {
        const cleaned = reply.replace(/```json|```/g, '').trim();
        try {
          const parsed = JSON.parse(cleaned);
          return res.json(parsed);
        } catch {
          return res.json({ title: topic, description: reply });
        }
      }

      res.json({ content: reply });
    } catch (err) {
      handleGroqError(err, res);
    }
  }
);

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
        .join('\n');

      return `Here are the student's pending (not yet submitted) assignments:\n${list}\n\nSummarize and prioritize these for the student.`;
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

      return `Here is the student's invoice history:\n${lines.join('\n')}\n\nExplain their overall balance and what they should do next.`;
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
        .join('\n');

      return `Here are graded assignment scores across this teacher's units this term:\n${list}\n\nSummarize trends and flag any students who may need extra support.`;
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
        .join('\n');

      return `There are ${applications.length} pending applications. Here are up to 30 of them:\n${list}\n\nSummarize and suggest what to prioritize.`;
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

      return `Institution stats: ${students} active students, ${teachers} active teachers, ${departments} departments, ${pendingApplications} pending applications.\n\nWrite a short narrative summary with 2-3 suggested action items.`;
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
        .join('\n');

      return `Here are the pending/approved purchase requests:\n${list}\n\nSummarize and suggest what to prioritize.`;
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
        .join('\n');

      return `These items are at or below their reorder level:\n${list}\n\nSummarize and suggest reorder priorities.`;
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
        .join('\n');

      return `There are ${invoices.length} outstanding invoices. Here are up to 30 of them:\n${list}\n\nSummarize and suggest collection priorities.`;
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
        .join('\n');

      return `Here are the pending leave requests:\n${list}\n\nSummarize and suggest approval priority/coverage considerations.`;
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

      return `Here is a summary of exams this officer administers:\n${lines.join('\n')}\n\nSummarize trends and flag any concerns.`;
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

      return `${details}\n\nGive this alumnus 3-4 practical, encouraging career development suggestions.`;
    },
  },

  teacher_unit_results_summary: {
    roles: ['TEACHER'],
    systemPrompt:
      'You help a TVET teacher understand exam/assessment results across the units they teach. Identify trends and flag students who may need extra support. Be concise.',
    build: async (userId) => {
      const term = await prisma.term.findFirst({ where: { isActive: true } });
      if (!term) return 'No active academic term right now, so there is no results data to summarize.';

      const myUnits = await prisma.unitLecturer.findMany({
        where: { lecturerId: userId, termId: term.id },
      });
      const unitIds = myUnits.map((u) => u.unitId);
      if (unitIds.length === 0) return 'This teacher has no assigned units this term.';

      const exams = await prisma.exam.findMany({
        where: { unitId: { in: unitIds }, termId: term.id },
        include: { unit: true, results: { include: { student: { select: { name: true } } } } },
      });
      if (exams.length === 0) return 'No assessments recorded yet for this teacher\'s units this term.';

      const lines = exams.map((e) => {
        if (e.results.length === 0) return `- "${e.name}" (${e.unit.name}): no results recorded yet`;
        const scores = e.results.map((r) => Number(r.score));
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return `- "${e.name}" (${e.unit.name}): ${e.results.length} result(s), average ${avg.toFixed(1)}/${e.maxScore}`;
      });

      return `Here is a summary of assessments across this teacher's units this term:\n${lines.join('\n')}\n\nSummarize trends and flag any students who may need extra support.`;
    },
  },

  teacher_attendance_patterns: {
    roles: ['TEACHER'],
    systemPrompt:
      'You help a TVET teacher spot attendance patterns across the units they teach. Flag students with frequent absences and any noticeable trends. Be concise.',
    build: async (userId) => {
      const term = await prisma.term.findFirst({ where: { isActive: true } });
      if (!term) return 'No active academic term right now, so there is no attendance data to summarize.';

      const myUnits = await prisma.unitLecturer.findMany({ where: { lecturerId: userId, termId: term.id } });
      const unitIds = myUnits.map((u) => u.unitId);
      if (unitIds.length === 0) return 'This teacher has no assigned units this term.';

      const records = await prisma.attendanceRecord.findMany({
        where: { unitId: { in: unitIds }, termId: term.id },
        include: { student: { select: { name: true } } },
      });
      if (records.length === 0) return 'No attendance has been recorded yet for this teacher\'s units this term.';

      const absenceCounts = new Map<string, number>();
      const totalSessions = new Map<string, number>();
      for (const r of records) {
        const key = r.student.name;
        totalSessions.set(key, (totalSessions.get(key) || 0) + 1);
        if (r.status === 'ABSENT') absenceCounts.set(key, (absenceCounts.get(key) || 0) + 1);
      }

      const lines = Array.from(totalSessions.keys()).map((name) => {
        const absences = absenceCounts.get(name) || 0;
        const total = totalSessions.get(name) || 0;
        return `- ${name}: absent ${absences} of ${total} recorded sessions`;
      });

      return `Here is attendance across this teacher's units this term:\n${lines.join('\n')}\n\nFlag students with frequent absences and any noticeable trends.`;
    },
  },

  student_results_summary: {
    roles: ['STUDENT'],
    systemPrompt:
      'You help a TVET student understand their own exam results. Be encouraging, clear, and specific about strengths and areas to improve.',
    build: async (userId) => {
      const results = await prisma.examResult.findMany({
        where: { studentId: userId },
        include: { exam: { include: { unit: true } } },
        orderBy: { createdAt: 'desc' },
      });
      if (results.length === 0) return 'This student has no recorded exam results yet.';

      const lines = results.map(
        (r) => `- ${r.exam.name} (${r.exam.unit.name}): ${r.score}/${r.exam.maxScore}`
      );

      return `Here are this student's exam results:\n${lines.join('\n')}\n\nSummarize their performance, highlight strengths, and suggest 1-2 areas to focus on.`;
    },
  },

  institution_reports_summary: {
    roles: ['REGISTRAR', 'ADMIN'],
    systemPrompt:
      'You help TVET college leadership understand institution-wide reporting figures. Give a brief narrative summary with 2-3 suggested action items. Be concise and practical.',
    build: async () => {
      const [students, staffCounts, departments, programmes, units, admissionsByStatus, outstandingInvoices] = await Promise.all([
        prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
        prisma.user.groupBy({
          by: ['role'],
          where: { status: 'ACTIVE', role: { notIn: ['STUDENT', 'ALUMNI'] } },
          _count: { role: true },
        }),
        prisma.department.count(),
        prisma.program.count(),
        prisma.unit.count(),
        prisma.application.groupBy({ by: ['status'], _count: { status: true } }),
        prisma.invoice.findMany({
          where: { status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] } },
          include: { payments: true },
        }),
      ]);

      const staffLines = staffCounts.map((s) => `${s.role}: ${s._count.role}`).join(', ');
      const admissionLines = admissionsByStatus.map((a) => `${a.status}: ${a._count.status}`).join(', ');
      const outstandingBalance = outstandingInvoices.reduce((sum, inv) => {
        const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
        return sum + (Number(inv.amount) - paid);
      }, 0);

      return `Institution reporting figures:\n- Active students: ${students}\n- Active staff by role: ${staffLines || 'none'}\n- Departments: ${departments}, Programmes: ${programmes}, Units: ${units}\n- Applications by status: ${admissionLines || 'none'}\n- Outstanding invoices: ${outstandingInvoices.length}, total balance: KES ${outstandingBalance}\n\nWrite a short narrative summary with 2-3 suggested action items.`;
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

// ─────────────────────────────────────────────
// AI TEXT ASSIST: reusable free-text helper (no DB context needed)
// ─────────────────────────────────────────────
// Unlike the quick actions above (which pull the user's own DB records),
// this takes whatever text the user typed and transforms it. Used by the
// reusable <AIAssistBox> component wherever a textarea could use AI help
// (Notebook, Announcements, and future tabs). Always a suggestion the
// user reviews and applies themselves -- nothing is auto-saved here.

const TEXT_ASSIST_TASKS: Record<string, { systemPrompt: string; maxTokens?: number }> = {
  summarize: {
    systemPrompt:
      'Summarize the following text into a few short, clear bullet points. Keep only the key ideas, nothing else.',
  },
  improve: {
    systemPrompt:
      'Rewrite the following text to be clearer, more polished, and well-organized, while keeping the same meaning, facts, and tone. Do not add new information.',
  },
  expand: {
    systemPrompt:
      'Expand the following rough notes/draft into fuller, well-organized prose, staying faithful to the original intent. Do not invent facts not implied by the original.',
  },
  draft_announcement: {
    systemPrompt:
      'Turn the following rough bullet points into a clear, professional announcement for a TVET college community (students and staff). Keep it concise, warm, and easy to read. Do not invent details not implied by the input.',
  },
  suggest_document_title: {
    systemPrompt:
      'Given a file name, suggest a short, professional document title suitable for a student\'s academic record (for example, "transcript_2026_final.pdf" becomes "Academic Transcript 2026"). Respond with ONLY the suggested title, nothing else -- no quotes, no explanation.',
    maxTokens: 30,
  },
};

router.post('/text-assist', requireAuth, async (req, res) => {
  const { task, input } = req.body;

  const taskDef = TEXT_ASSIST_TASKS[task];
  if (!taskDef) {
    return res.status(400).json({ error: 'Unknown text-assist task' });
  }
  if (!input || !input.trim()) {
    return res.status(400).json({ error: 'input is required' });
  }

  try {
    const reply = await callGroq(taskDef.systemPrompt, input.trim(), taskDef.maxTokens || 600);
    res.json({ reply });
  } catch (err) {
    handleGroqError(err, res);
  }
});

export default router;

