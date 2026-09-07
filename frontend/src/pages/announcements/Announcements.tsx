import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import AIAssistBox from '../../components/ai/AIAssistBox';

interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  postedById?: string;
  postedBy?: { id: string; name: string; role: string };
}

const CAN_POST_ROLES = ['REGISTRAR', 'ADMIN'];

export default function Announcements() {
  const { token, user } = useAuth();
  const canPost = user ? CAN_POST_ROLES.includes(user.role) : false;
  const isAdmin = user?.role === 'ADMIN';

  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api('/announcements', { token });
      setAnnouncements(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load announcements');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required');
      return;
    }
    try {
      await api('/announcements', {
        method: 'POST',
        token,
        body: { title: title.trim(), body: body.trim() },
      });
      setMessage('Announcement posted');
      setTitle('');
      setBody('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post announcement');
    }
  }

  async function handleDelete(id: string) {
    setError('');
    setMessage('');
    try {
      await api(`/announcements/${id}`, { method: 'DELETE', token });
      setMessage('Announcement deleted');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete announcement');
    }
  }

  return (
    <PortalLayout title="Announcements">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Announcements</h2>
          <p className="text-sm text-gray-500 mt-1">
            {canPost
              ? 'Post an announcement for everyone on the platform to see.'
              : 'Announcements from the Registrar and Administration.'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        {canPost && (
          <form onSubmit={handlePost} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Post an Announcement</h3>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Announcement body"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />

            <AIAssistBox
              task="draft_announcement"
              label="Ask AI to turn rough notes into an announcement"
              getInput={() => body}
              onApply={(result) => setBody(result)}
              emptyMessage="Jot down rough bullet points first, then ask AI to draft it."
            />
            <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
              Post Announcement
            </button>
          </form>
        )}

        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        <div className="space-y-3">
          {!loading && announcements.length === 0 && (
            <p className="text-sm text-gray-400">No announcements yet.</p>
          )}
          {announcements.map((a) => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <h4 className="font-semibold text-gray-900">{a.title}</h4>
                <span className="text-xs text-gray-400">
                  {new Date(a.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{a.body}</p>
              {a.postedBy && (
                <p className="text-xs text-gray-400 mt-2">
                  Posted by {a.postedBy.name} ({a.postedBy.role})
                </p>
              )}
              {(isAdmin || a.postedById === user?.id) && (
                <button
                  className="text-red-600 text-xs font-medium mt-2"
                  onClick={() => handleDelete(a.id)}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </PortalLayout>
  );
}
