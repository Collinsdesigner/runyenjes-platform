import { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface AIAssistBoxProps {
  task: 'summarize' | 'improve' | 'expand' | 'draft_announcement';
  getInput: () => string;
  onApply: (result: string) => void;
  label?: string;
  emptyMessage?: string;
}

/**
 * Reusable "Ask AI" helper for any textarea-based tab. Sends whatever
 * getInput() returns to POST /ai/text-assist, shows the result, and lets
 * the user explicitly apply it via onApply -- nothing is auto-saved or
 * auto-applied. Safe to drop into any page (Notebook, Announcements,
 * future tabs) without duplicating this logic each time.
 */
export default function AIAssistBox({ task, getInput, onApply, label, emptyMessage }: AIAssistBoxProps) {
  const { token } = useAuth();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  async function handleAsk() {
    const input = getInput();
    if (!input || !input.trim()) {
      setError(emptyMessage || 'Write something first, then ask AI.');
      return;
    }

    setLoading(true);
    setError('');
    setResult('');
    try {
      const data = await api('/ai/text-assist', {
        method: 'POST',
        token,
        body: { task, input },
      });
      setResult(data.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI assist is unavailable right now');
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    onApply(result);
    setResult('');
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
      <button
        type="button"
        onClick={handleAsk}
        disabled={loading}
        className="text-xs font-medium text-rgreen disabled:opacity-50"
      >
        {loading ? 'Thinking...' : `✦ ${label || 'Ask AI'}`}
      </button>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {result && (
        <div className="space-y-2">
          <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded-lg p-3">
            {result}
          </p>
          <div className="space-x-3">
            <button type="button" onClick={handleApply} className="text-xs font-medium text-rgreen">
              Use this
            </button>
            <button type="button" onClick={() => setResult('')} className="text-xs font-medium text-gray-500">
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
