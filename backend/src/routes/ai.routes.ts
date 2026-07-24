import { Router } from 'express';
import dns from 'dns';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

// Some networks have flaky/unrouted IPv6, which makes Node's default
// "try IPv6 first" behavior hang until timeout before falling back to IPv4.
// Forcing IPv4-first avoids that entirely.
dns.setDefaultResultOrder('ipv4first');

const router = Router();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `You are the Runyenjes Technical & Vocational College study assistant.
You help students and staff with study questions, explaining concepts from their coursework,
summarizing notes, and general TVET-related academic help. Be clear, concise, and encouraging.
If asked something completely unrelated to school/learning, you can still help, but gently
steer back toward being a helpful study companion. Keep answers reasonably short unless the
person asks for more detail.`;

// ---------- List my past conversations ----------
router.get('/conversations', requireAuth, async (req, res) => {
  const conversations = await prisma.aIConversation.findMany({
    where: { userId: req.user!.userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, updatedAt: true },
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
router.post('/chat', requireAuth, async (req, res) => {
  const { message, conversationId } = req.body;

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
          { role: 'system', content: SYSTEM_PROMPT },
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

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content ?? 'Sorry, I could not generate a response.';

    await prisma.aIMessage.create({
      data: { conversationId: convo.id, role: 'assistant', content: reply },
    });
    await prisma.aIConversation.update({
      where: { id: convo.id },
      data: { updatedAt: new Date() },
    });

    res.json({ reply, conversationId: convo.id });
  } catch (err) {
    console.error('AI assistant error:', err);
    res.status(502).json({ error: 'The AI assistant is temporarily unavailable.' });
  }
});

export default router;
