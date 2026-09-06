#!/usr/bin/env python3
"""
Extends ai.routes.ts with the AI Learning feature set:

  POST /ai/chat                       -> now accepts optional unitId when
                                          starting a new conversation, scoping
                                          the tutor to that unit's context
  POST /ai/quiz                       -> generate a practice quiz for a unit
  POST /ai/assignment-feedback        -> student gets hints on a draft before submitting
  POST /ai/grading-suggestion         -> teacher gets a suggested score + comment
  POST /ai/generate-content           -> teacher drafts a material or assignment brief

All four new endpoints are stateless (nothing persisted) and reuse the
exact same Groq call pattern (GROQ_URL, MODEL, error handling) as the
existing /chat endpoint. Open to any unit -- not restricted to a
student's own enrolled units.

USAGE (run from ~/runyenjes-platform/backend):
    python3 upgrade_ai_learning_routes.py

Always overwrites ai.routes.ts (safe to re-run).
"""

import os

TARGET = os.path.join("src", "routes", "ai.routes.ts")

NEW_AI_ROUTES_TS = """import { Router } from 'express';
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
  return data.choices?.[0]?.message?.content ?? 'Sorry, I could not generate a response.';
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
    ? unit.materials.map((m) => `- [${m.type}] ${m.fileUrl}`).join('\\n')
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

export default router;
"""


def main():
    if not os.path.isdir(os.path.dirname(TARGET)):
        print("ERROR: '" + os.path.dirname(TARGET) + "' not found. Run this from ~/runyenjes-platform/backend.")
        return
    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(NEW_AI_ROUTES_TS)
    print("REWROTE " + TARGET)
    print(" - /chat now accepts optional unitId to scope a Tutor conversation")
    print(" - Added /quiz, /assignment-feedback, /grading-suggestion, /generate-content")


if __name__ == "__main__":
    main()
