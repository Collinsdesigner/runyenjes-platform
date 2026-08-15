import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, uploadImage } from '../api/client';

interface CommentType {
  id: string;
  content: string;
  authorId: string | null;
  authorNamePublic: string | null;
  author: { name: string; avatarUrl: string | null } | null;
  createdAt: string;
}

interface PostType {
  id: string;
  content: string;
  mediaUrl: string | null;
  authorId: string | null;
  author: { name: string; role: string; avatarUrl: string | null } | null;
  createdAt: string;
  comments: CommentType[];
  likeCount: number;
  likedByMe: boolean;
}

const AVATAR_COLORS = ['#0B7A2B', '#5C0F00', '#1D4ED8', '#B45309', '#7C3AED', '#0891B2'];

function avatarColor(name: string) {
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const [imgError, setImgError] = useState(false);
  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgError(true)}
        className="w-9 h-9 rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ backgroundColor: avatarColor(name) }}
    >
      {initials(name)}
    </div>
  );
}

export default function Home() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [posts, setPosts] = useState<PostType[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState('');
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newMediaPublicId, setNewMediaPublicId] = useState('');  
  const [uploadingImage, setUploadingImage] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

const [guestName, setGuestName] = useState(
  localStorage.getItem('rtvcGuestName') || ''
);

const [guestId] = useState(() => {
  let id = localStorage.getItem('rtvcGuestId');

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('rtvcGuestId', id);
  }

  return id;
});
  async function loadPosts() {
    try {
      const data = await api('/posts', { token });
      setPosts(data);
    } catch {
      setError('Could not load the Home feed. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPosts();
  }, []);

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingImage(true);
    try {
    const image = await uploadImage(file, token);
    setNewMediaUrl(image.url);
    setNewMediaPublicId(image.publicId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();
    if (!newPost.trim()) return;
    setPosting(true);
    try {
      await api('/posts', {
        method: 'POST',
     body: {
     content: newPost,
     mediaUrl: newMediaUrl || undefined,
     mediaPublicId: newMediaPublicId || undefined,
   },
        token,
      });
      setNewPost('');
      setNewMediaUrl('');
      setNewMediaPublicId('');
      await loadPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create post');
    } finally {
      setPosting(false);
    }
  }


async function handleToggleLike(postId: string) {
if (!user && !guestName.trim()) {

    alert('Please enter your name before liking');
    return;
  }

  // Optimistic update
  setPosts((prev) =>
    prev.map((p) =>
      p.id === postId
        ? {
            ...p,
            likedByMe: !p.likedByMe,
            likeCount: p.likeCount + (p.likedByMe ? -1 : 1),
          }
        : p
    )
  );

  try {
    await api(`/posts/${postId}/like`, {
      method: 'POST',

body: {
  guestId: user ? null : guestId,
  guestName: user ? null : guestName,
},
      token,
    });
  } catch {
    await loadPosts();
  }
}


  async function handleReply(postId: string) {
    const content = replyDrafts[postId];
    if (!content || !content.trim()) return;
    try {
      await api(`/posts/${postId}/comments`, {
        method: 'POST',
        body: { content, guestName: user ? undefined : guestName },
        token,
      });
      setReplyDrafts((prev) => ({ ...prev, [postId]: '' }));
      await loadPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post reply');
    }
  }

  async function handleDeleteComment(postId: string, commentId: string) {
    if (!confirm('Delete this comment?')) return;
    try {
      await api(`/posts/${postId}/comments/${commentId}`, { method: 'DELETE', token });
      await loadPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete comment');
    }
  }

  async function handleDeletePost(postId: string) {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    try {
      await api(`/posts/${postId}`, { method: 'DELETE', token });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete post');
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <h1 className="font-bold text-rgreen">Runyenjes Home</h1>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/apply')} className="text-sm text-gray-600 underline">
            Apply
          </button>
          <button onClick={() => navigate('/browser')} className="text-sm text-gray-600 underline">
            Browser          
          </button>
          
<button
  onClick={() => navigate('/about-rtvc')}
  className="font-bold text-rgreen"
>
  About Runyenjes TVC
</button>


          {user && (
            <button onClick={() => navigate('/ai')} className="text-sm text-gray-600 underline">
              AI Assistance
            </button>
          )}
          {user && (
            <button onClick={() => navigate('/groups')} className="text-sm text-gray-600 underline">
              My Groups
            </button>
          )}
          {user && (
            <button onClick={() => navigate('/library')} className="text-sm text-gray-600 underline">
              Library
            </button>
          )}
          {user && (
            <button onClick={() => navigate('/profile')} className="text-sm text-gray-600 underline">
              Profile
            </button>
          )}
          {user && (
            <button
              onClick={() => navigate('/continuation')}
              className="text-sm text-gray-600 underline"
            >
              Continuation
            </button>
          )}
          {user && ['REGISTRAR', 'ADMIN'].includes(user.role) && (
            <button
              onClick={() => navigate('/admissions')}
              className="text-sm text-gray-600 underline"
            >
              Admissions
            </button>
          )}
          {user && ['ADMIN'].includes(user.role) && (
            <button onClick={() => navigate('/admin')} className="text-sm text-gray-600 underline">
              Admin
            </button>
          )}
          {user ? (
            <div className="flex items-center gap-2 text-sm">
              <button onClick={() => navigate('/profile')} title="My profile">
                <Avatar name={user.name} avatarUrl={user.avatarUrl} />
              </button>
              <span className="text-gray-600 hidden sm:inline">
                {user.name} <span className="text-gray-400">({user.role})</span>
              </span>
              <button onClick={logout} className="text-rmaroon underline">
                Log out
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="text-sm bg-rgreen text-white px-3 py-1.5 rounded-md"
            >
              Member sign in
            </button>
          )}
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 space-y-4">
        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
        )}

        {/* New post composer — Facebook style */}
        {user ? (
          <form onSubmit={handleCreatePost} className="bg-white rounded-xl shadow p-4">
            <div className="flex gap-3">
              <Avatar name={user.name} avatarUrl={user.avatarUrl} />
              <textarea
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                placeholder={`What's on your mind, ${user.name.split(' ')[0]}?`}
                className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm resize-none bg-gray-50 focus:outline-none focus:ring-2 focus:ring-rgreen"
                rows={2}
              />
            </div>

            {newMediaUrl && (
              <div className="mt-2 relative">
                <img src={newMediaUrl} alt="Preview" className="w-full max-h-64 object-contain bg-gray-100 rounded-lg" />
                <button
                  type="button"
              onClick={() => {
                setNewMediaUrl('');
              setNewMediaPublicId('');
            }}
                  className="absolute top-2 right-2 bg-black/60 text-white text-xs w-6 h-6 rounded-full"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <label className="text-xs text-gray-500 hover:text-rgreen flex items-center gap-1 cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                  disabled={uploadingImage}
                />
                {uploadingImage ? 'Uploading…' : '🖼 Photo (from your phone or PC)'}
              </label>
              <button
                type="submit"
                disabled={posting || uploadingImage || !newPost.trim()}
                className="bg-rgreen text-white text-sm font-medium px-5 py-1.5 rounded-full disabled:opacity-50"
              >
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </form>
        ) : (


<div className="bg-white rounded-xl shadow p-4 text-sm text-gray-600">
  <div className="text-center mb-3">
    <button
      onClick={() => navigate('/login')}
      className="text-rgreen underline font-medium"
    >
      Sign in
    </button>{' '}
    to post updates as a member.
  </div>

  {!user && (
    <div className="border-t pt-3">
      <p className="text-xs text-gray-500 mb-2">
        Commenting and liking as:
      </p>

      <input
        value={guestName}
        onChange={(e) => {
          setGuestName(e.target.value);
          localStorage.setItem('rtvcGuestName', e.target.value);
        }}
        placeholder="Your name"
        className="w-full border border-gray-200 rounded-full px-4 py-2 text-sm"
      />
    </div>
  )}
</div>

        )}

        {/* Feed */}
        {loading ? (
          <p className="text-center text-gray-400 text-sm">Loading feed…</p>
        ) : posts.length === 0 ? (
          <p className="text-center text-gray-400 text-sm">No posts yet — be the first!</p>
        ) : (
          posts.map((post) => {
            const authorName = post.author?.name ?? 'Unknown';
            const commentsOpen = openComments[post.id];
            const canDelete = user && (post.authorId === user.id || ['ADMIN'].includes(user.role));
            return (
              <div key={post.id} className="bg-white rounded-xl shadow overflow-hidden">
                <div className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar name={authorName} avatarUrl={post.author?.avatarUrl} />
                      <div>
                        <p className="font-semibold text-sm leading-tight">{authorName}</p>
                        <p className="text-xs text-gray-400">
                          {post.author?.role && `${post.author.role} · `}
                          {relativeTime(post.createdAt)}
                        </p>
                      </div>
                    </div>
                    {canDelete && (
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="text-xs text-gray-400 hover:text-rmaroon"
                        title="Delete post"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap mt-3">{post.content}</p>
                </div>

                {post.mediaUrl && (
                  <img
                    src={post.mediaUrl}
                    alt=""
                    className="w-full max-h-[32rem] object-contain bg-gray-100"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.replaceWith(
                        Object.assign(document.createElement('p'), {
                          className: 'text-xs text-gray-400 text-center py-3',
                          textContent: "This image couldn't be loaded (the link may not point directly to an image).",
                        })
                      );
                    }}
                  />
                )}

                {/* Like / comment counts */}
                {(post.likeCount > 0 || post.comments.length > 0) && (
                  <div className="px-4 pt-2 flex items-center justify-between text-xs text-gray-400">
                    <span>
                      {post.likeCount > 0 && `❤ ${post.likeCount}`}
                    </span>
                    <span>
                      {post.comments.length > 0 &&
                        `${post.comments.length} comment${post.comments.length === 1 ? '' : 's'}`}
                    </span>
                  </div>
                )}

                


{/* Action bar */}
                <div className="flex border-t border-gray-100 mt-2 text-sm">
                  <button
                    onClick={() => handleToggleLike(post.id)}
                    className={`flex-1 py-2 flex items-center justify-center gap-1.5 font-medium hover:bg-gray-50 ${
                      post.likedByMe ? 'text-rmaroon' : 'text-gray-500'
                    }`}
                  >
                    {post.likedByMe ? '❤' : '🤍'} Like
                  </button>
                  <button
                    onClick={() => setOpenComments((p) => ({ ...p, [post.id]: !p[post.id] }))}
                    className="flex-1 py-2 flex items-center justify-center gap-1.5 font-medium text-gray-500 hover:bg-gray-50 border-l border-gray-100"
                  >
                    💬 Comment
                  </button>
                </div>

                {/* Comments (collapsible) */}
                {commentsOpen && (
                  <div className="bg-gray-50 px-4 py-3 space-y-3">
                    {post.comments.map((c) => {
                      const cName = c.author?.name ?? c.authorNamePublic ?? 'Guest';
                      return (
                        <div key={c.id} className="flex gap-2">
                          <Avatar name={cName} avatarUrl={c.author?.avatarUrl} />
                          <div className="bg-white rounded-2xl px-3 py-2 flex-1">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold">{cName}</p>
                              {user && (c.authorId === user.id || ['ADMIN'].includes(user.role)) && (
                                <button
                                  onClick={() => handleDeleteComment(post.id, c.id)}
                                  className="text-[10px] text-gray-400 hover:text-rmaroon"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                            <p className="text-sm text-gray-700">{c.content}</p>
                          </div>
                        </div>
                      );
                    })}

                    <div className="flex gap-2 items-center">


                      {user && <Avatar name={user.name} avatarUrl={user.avatarUrl} />}
                      <input
                        value={replyDrafts[post.id] ?? ''}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))
                        }
                        onKeyDown={(e) => e.key === 'Enter' && handleReply(post.id)}
                        placeholder="Write a comment…"
                        className="flex-1 border border-gray-200 rounded-full px-3 py-1.5 text-sm bg-white"
                      />
                      <button
                        onClick={() => handleReply(post.id)}
                        className="text-sm text-rgreen font-medium"
                      >
                        Post
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
