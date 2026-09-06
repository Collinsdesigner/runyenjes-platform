import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

const QUICK_ACTIONS: Record<string, { action: string; label: string; icon: string }[]> = {
  STUDENT: [
    { action: 'student_deadlines', label: 'Summarize my upcoming deadlines', icon: '\ud83d\udcc5' },
    { action: 'student_fees', label: 'Explain my fee balance', icon: '\ud83d\udcb0' },
  ],
  TEACHER: [
    { action: 'teacher_class_performance', label: "Summarize my classes' performance", icon: '\ud83d\udcca' },
  ],
  REGISTRAR: [
    { action: 'registrar_pending_applications', label: 'Summarize pending applications', icon: '\ud83d\udcdd' },
  ],
  ADMIN: [
    { action: 'admin_stats_summary', label: 'Summarize institution stats', icon: '\ud83d\udcc8' },
  ],
  PROCUREMENT_OFFICER: [
    { action: 'procurement_pending_requests', label: 'Summarize pending purchase requests', icon: '\ud83d\udcc4' },
  ],
  STORES_OFFICER: [
    { action: 'stores_low_stock', label: "What's low on stock right now", icon: '\ud83d\udce6' },
  ],
  FINANCE_OFFICER: [
    { action: 'finance_outstanding_invoices', label: 'Summarize outstanding invoices', icon: '\ud83d\udcb3' },
  ],
  HR_OFFICER: [
    { action: 'hr_pending_leave', label: 'Summarize pending leave requests', icon: '\ud83d\udc65' },
  ],
  EXAM_OFFICER: [
    { action: 'examofficer_results_summary', label: 'Summarize my exam results', icon: '\ud83d\udcca' },
  ],
  ALUMNI: [
    { action: 'alumni_career_tips', label: 'Give me career advice', icon: '\ud83c\udf93' },
  ],
};


interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

export default function AIAssistant() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadConversations() {
    try {
      const data = await api('/ai/conversations', { token });
      setConversations(data);
    } catch {
      // non-fatal — sidebar just stays empty
    }
  }

  useEffect(() => {
    if (user) loadConversations();
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  async function openConversation(id: string) {
    setActiveId(id);
    setError(null);
    try {
      const data = await api(`/ai/conversations/${id}/messages`, { token });
      setMessages(data.map((m: any) => ({ role: m.role, content: m.content })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that conversation');
    }
  }

  async function handleQuickAction(action: string, label: string) {
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

  function startNewChat() {
    setActiveId(null);
    setMessages([]);
    setError(null);
  }

  async function handleDeleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try {
      await api(`/ai/conversations/${id}`, { method: 'DELETE', token });
      if (activeId === id) startNewChat();
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete conversation');
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Please{' '}
        <button onClick={() => navigate('/login')} className="text-rgreen underline mx-1">
          sign in
        </button>{' '}
        to use the AI assistant.
      </div>
    );
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;

    const userMsg = draft.trim();
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setDraft('');
    setError(null);
    setSending(true);

    try {
      const data = await api('/ai/chat', {
        method: 'POST',
        body: { message: userMsg, conversationId: activeId || undefined },
        token,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      if (!activeId) {
        setActiveId(data.conversationId);
        await loadConversations();
      } else {
        await loadConversations(); // refresh "updated" ordering
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the AI assistant');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="h-screen bg-gray-50 flex">
      {/* Sidebar */}
      {showSidebar && (
        <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-3 border-b border-gray-100">
            <button
              onClick={startNewChat}
              className="w-full bg-rgreen text-white text-sm py-2 rounded-md"
            >
              + New chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="text-xs text-gray-400 text-center p-4">No past chats yet.</p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openConversation(c.id)}
                  className={`w-full text-left px-3 py-2 text-xs border-b border-gray-50 flex items-center justify-between group ${
                    activeId === c.id ? 'bg-green-50 text-rgreen' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate">{c.title}</span>
                  <span
                    onClick={(e) => handleDeleteConversation(c.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-rmaroon ml-1"
                  >
                    ✕
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSidebar((s) => !s)}
              className="text-gray-400 text-sm"
              title="Toggle chat history"
            >
              ☰
            </button>
            <h1 className="font-bold text-rgreen">RTVC AI Assistance</h1>
          </div>
          <button onClick={() => navigate('/')} className="text-sm text-gray-500 underline">
            Back to Home
          </button>
        </header>

        <main className="flex-1 max-w-xl w-full mx-auto p-4 flex flex-col min-h-0">
          <div className="flex-1 space-y-3 overflow-y-auto mb-3">
            {messages.length === 0 && !activeId && (
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
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-rgreen text-white rounded-br-sm'
                      : 'bg-white shadow text-gray-800 rounded-bl-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-white shadow rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-gray-400">
                  Thinking…
                </div>
              </div>
            )}

            {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSend} className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask a study question…"
              className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rgreen"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="bg-rgreen text-white text-sm px-5 py-2 rounded-full disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}
