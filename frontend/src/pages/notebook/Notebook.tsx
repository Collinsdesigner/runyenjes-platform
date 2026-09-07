import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import AIAssistBox from '../../components/ai/AIAssistBox';

interface NoteItem {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

export default function Notebook() {
  const { token } = useAuth();

  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api('/notes', { token });
      setNotes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load notes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function startNewNote() {
    setSelectedId(null);
    setTitle('');
    setContent('');
  }

  function selectNote(note: NoteItem) {
    setSelectedId(note.id);
    setTitle(note.title);
    setContent(note.content);
  }

  async function handleSave() {
    if (!content.trim()) {
      setError('Note content cannot be empty');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (selectedId) {
        await api(`/notes/${selectedId}`, {
          method: 'PATCH',
          token,
          body: { title: title.trim() || 'Untitled note', content: content.trim() },
        });
      } else {
        const created = await api('/notes', {
          method: 'POST',
          token,
          body: { title: title.trim() || 'Untitled note', content: content.trim() },
        });
        setSelectedId(created.id);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save note');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setError('');
    try {
      await api(`/notes/${id}`, { method: 'DELETE', token });
      if (selectedId === id) startNewNote();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete note');
    }
  }

  return (
    <PortalLayout title="Notebook">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Notebook</h2>
            <p className="text-sm text-gray-500 mt-1">Personal notes, visible only to you.</p>
          </div>
          <button
            type="button"
            onClick={startNewNote}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            + New Note
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="bg-white border border-gray-200 rounded-lg lg:col-span-1">
            <div className="p-4 border-b border-gray-200 font-semibold text-gray-900">Your Notes</div>
            <div className="divide-y divide-gray-100 max-h-[28rem] overflow-y-auto">
              {loading && <p className="text-sm text-gray-400 p-4">Loading...</p>}
              {!loading && notes.length === 0 && (
                <p className="text-sm text-gray-400 p-4">No notes yet.</p>
              )}
              {notes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => selectNote(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                    selectedId === n.id ? 'bg-green-50 border-l-4 border-rgreen' : ''
                  }`}
                >
                  <div className="font-medium text-gray-900 truncate">{n.title}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(n.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg lg:col-span-2 p-5 space-y-3">
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium"
              placeholder="Note title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Write your note here..."
              rows={12}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />

            <AIAssistBox
              task="improve"
              label="Ask AI to clean up or summarize this note"
              getInput={() => content}
              onApply={(result) => setContent(result)}
              emptyMessage="Write your note first, then ask AI."
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {saving ? 'Saving...' : selectedId ? 'Save Changes' : 'Create Note'}
              </button>
              {selectedId && (
                <button
                  type="button"
                  onClick={() => handleDelete(selectedId)}
                  className="text-red-600 text-sm font-medium"
                >
                  Delete Note
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </PortalLayout>
  );
}
