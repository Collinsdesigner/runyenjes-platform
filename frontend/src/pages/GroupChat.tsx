import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, uploadImage } from '../api/client';

interface Message {
  id: string;
  content: string;
  attachmentUrl: string | null;
  senderId: string;
  createdAt: string;
  sender: { name: string; role: string; avatarUrl: string | null };
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function MiniAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const [imgError, setImgError] = useState(false);
  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgError(true)}
        className="w-7 h-7 rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-rgreen text-white flex items-center justify-center text-[10px] font-bold shrink-0">
      {initials(name)}
    </div>
  );
}

export default function GroupChat() {
  const { groupId } = useParams();
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadMessages() {
    if (!groupId) return;
    try {
      const data = await api(`/groups/${groupId}/messages`, { token });
      setMessages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();
    // Simple polling every 4s so messages feel close to real-time without websockets yet
    const interval = setInterval(loadMessages, 4000);
    return () => clearInterval(interval);
  }, [groupId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingImage(true);
    try {
      const image = await uploadImage(file, token);
      const url = image.url;
      setAttachmentUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!groupId) return;
    if (!confirm('Delete this message?')) return;
    try {
      await api(`/groups/${groupId}/messages/${messageId}`, { method: 'DELETE', token });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete message');
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() && !attachmentUrl) return;
    if (!groupId) return;
    setSending(true);
    try {
      await api(`/groups/${groupId}/messages`, {
        method: 'POST',
        body: { content: draft, attachmentUrl: attachmentUrl || undefined },
        token,
      });
      setDraft('');
      setAttachmentUrl('');
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message');
    } finally {
      setSending(false);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Please{' '}
        <button onClick={() => navigate('/login')} className="text-rgreen underline mx-1">
          sign in
        </button>{' '}
        to view this chat.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/groups')} className="text-sm text-gray-500 underline">
          ← My Groups
        </button>
        <button
          onClick={() => navigate(`/groups/${groupId}/call`)}
          className="text-sm bg-rgreen text-white px-3 py-1.5 rounded-md flex items-center gap-1"
        >
          📹 Video Call
        </button>
      </header>

      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col">
        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md mb-2">{error}</div>
        )}

        <div className="flex-1 space-y-2 overflow-y-auto mb-3">
          {loading ? (
            <p className="text-sm text-gray-400 text-center">Loading messages…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-gray-400 text-center">
              No messages yet — say hello!
            </p>
          ) : (
            messages.map((m) => {
              const canDelete =
                user &&
                (m.senderId === user.id || ['TEACHER', 'ADMIN'].includes(user.role));
              return (
                <div key={m.id} className="flex gap-2 items-start">
                  <MiniAvatar name={m.sender.name} avatarUrl={m.sender.avatarUrl} />
                  <div className="bg-white rounded-lg shadow-sm px-3 py-2 flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium">{m.sender.name}</span>
                        <span className="text-[10px] text-gray-400">{m.sender.role}</span>
                      </div>
                      {canDelete && (
                        <button
                          onClick={() => handleDeleteMessage(m.id)}
                          className="text-[10px] text-gray-400 hover:text-rmaroon"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    {m.content && <p className="text-sm text-gray-800">{m.content}</p>}
                    {m.attachmentUrl && (
                      <img
                        src={m.attachmentUrl}
                        alt=""
                        className="mt-1 max-w-full max-h-64 object-contain rounded-md bg-gray-50"
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {attachmentUrl && (
          <div className="relative mb-2 inline-block">
            <img src={attachmentUrl} alt="Preview" className="max-h-32 rounded-md object-contain bg-gray-100" />
            <button
              type="button"
              onClick={() => setAttachmentUrl('')}
              className="absolute top-1 right-1 bg-black/60 text-white text-xs w-5 h-5 rounded-full"
            >
              ✕
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-2">
          <label className="flex items-center px-2 text-lg cursor-pointer text-gray-500">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
              disabled={uploadingImage}
            />
            {uploadingImage ? '…' : '🖼'}
          </label>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message this group…"
            className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rgreen"
          />
          <button
            type="submit"
            disabled={sending || uploadingImage || (!draft.trim() && !attachmentUrl)}
            className="bg-rgreen text-white text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
