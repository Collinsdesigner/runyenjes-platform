import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, uploadImage } from '../api/client';
import PortalLayout from '../components/portal/PortalLayout';
import StoriesRail from '../components/social/StoriesRail';

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
  likedByNames?: string[];
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

// Encodes who's speaking with what authority -- information, not decoration.
const ROLE_LABELS: Record<string, { label: string; className: string }> = {
  ADMIN: { label: 'Administration', className: 'bg-rgreen/10 text-rgreen' },
  REGISTRAR: { label: "Registrar's Office", className: 'bg-rgreen/10 text-rgreen' },
  TEACHER: {
    label: 'Lecturer',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
  STUDENT: {
    label: 'Student',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  },
  ALUMNI: { label: 'Alumnus', className: 'bg-rmaroon/10 text-rmaroon' },
};

function RoleBadge({ role }: { role: string }) {
  const info = ROLE_LABELS[role] || {
    label: role.charAt(0) + role.slice(1).toLowerCase(),
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  };
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${info.className}`}>
      {info.label}
    </span>
  );
}

const POST_TRUNCATE_LENGTH = 280;

function PostText({
  content,
  expanded,
  onToggle,
}: {
  content: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isLong = content.length > POST_TRUNCATE_LENGTH;
  const shown = expanded || !isLong ? content : content.slice(0, POST_TRUNCATE_LENGTH).trimEnd() + '\u2026';
  return (
    <p className="text-sm text-gray-800 whitespace-pre-wrap mt-3 dark:text-gray-200">
      {shown}
      {isLong && (
        <button type="button" onClick={onToggle} className="text-rgreen font-medium ml-1">
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </p>
  );
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
  const { user, token, logout, darkMode, toggleDarkMode } = useAuth();
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
  // HOME_POST_CARD_POLISH_V1
  const [expandedPosts, setExpandedPosts] = useState<Record<string, boolean>>({});
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  // HOME_LIKES_AND_NATIVE_SHARE_V1
  const [likesListOpen, setLikesListOpen] = useState<Record<string, boolean>>({});

  async function handleSharePost(postId: string, postContent: string) {
    const url = `${window.location.origin}${window.location.pathname}#post-${postId}`;
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };

    if (nav.share) {
      try {
        await nav.share({ text: postContent.slice(0, 100), url });
        return;
      } catch {
        // Cancelled, or the OS share sheet failed mid-call -- fall through
        // to copy-link rather than leaving the user with no feedback.
      }
    }

    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopiedPostId(postId);
        setTimeout(() => setCopiedPostId(null), 2000);
      })
      .catch(() => {});
  }

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

  // HOME_GUEST_THREE_COLUMN_V1
  // Institution details for the guest header/sidebar -- never hard-coded
  // (roadmap Section 5). Public endpoint, no token needed.
  const [settings, setSettings] = useState<{
    institutionName?: string;
    shortName?: string;
    tagline?: string;
    logoUrl?: string;
    address?: string;
    phone?: string;
    email?: string;
  } | null>(null);

  useEffect(() => {
    api('/settings')
      .then(setSettings)
      .catch(() => {});
  }, []);

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

  // The feed itself -- composer/guest box, error banner, and the list of
  // posts. Identical whether shown inside the portal shell (logged in) or
  // the standalone public page (logged out).
  const feedContent = (
    <>
      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md dark:bg-red-950 dark:text-red-300">{error}</div>
      )}

      <StoriesRail />

      {/* New post composer — Facebook style */}
      {user ? (
        <form onSubmit={handleCreatePost} className="bg-white rounded-xl shadow p-4 dark:bg-gray-900">
          <div className="flex gap-3">
            <Avatar name={user.name} avatarUrl={user.avatarUrl} />
            <textarea
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              placeholder={`What's on your mind, ${user.name.split(' ')[0]}?`}
              className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm resize-none bg-gray-50 focus:outline-none focus:ring-2 focus:ring-rgreen dark:border-gray-700 dark:bg-gray-950"
              rows={2}
            />
          </div>

          {newMediaUrl && (
            <div className="mt-2 relative">
              <img src={newMediaUrl} alt="Preview" className="w-full max-h-64 object-contain bg-gray-100 rounded-lg dark:bg-gray-800" />
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

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <label className="text-xs text-gray-500 hover:text-rgreen flex items-center gap-1 cursor-pointer dark:text-gray-400">
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
        <div className="bg-white rounded-xl shadow p-4 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-400">
          <div className="text-center mb-3">
            <button
              onClick={() => navigate('/login')}
              className="text-rgreen underline font-medium"
            >
              Sign in
            </button>{' '}
            to post updates as a member.
          </div>

          <div className="border-t pt-3">
            <p className="text-xs text-gray-500 mb-2 dark:text-gray-400">
              Commenting and liking as:
            </p>

            <input
              value={guestName}
              onChange={(e) => {
                setGuestName(e.target.value);
                localStorage.setItem('rtvcGuestName', e.target.value);
              }}
              placeholder="Your name"
              className="w-full border border-gray-200 rounded-full px-4 py-2 text-sm dark:border-gray-700"
            />
          </div>
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl shadow overflow-hidden p-4 animate-pulse dark:bg-gray-900"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800" />
                <div className="space-y-2">
                  <div className="h-3 w-32 bg-gray-200 rounded dark:bg-gray-800" />
                  <div className="h-2 w-20 bg-gray-200 rounded dark:bg-gray-800" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-3 w-full bg-gray-200 rounded dark:bg-gray-800" />
                <div className="h-3 w-5/6 bg-gray-200 rounded dark:bg-gray-800" />
              </div>
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="text-center text-gray-400 text-sm dark:text-gray-500">No posts yet — be the first!</p>
      ) : (
        posts.map((post) => {
          const authorName = post.author?.name ?? 'Unknown';
          const commentsOpen = openComments[post.id];
          const canDelete = user && (post.authorId === user.id || ['ADMIN'].includes(user.role));
          return (
            <div
              key={post.id}
              id={`post-${post.id}`}
              className="bg-white rounded-xl shadow overflow-hidden dark:bg-gray-900"
            >
              <div className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar name={authorName} avatarUrl={post.author?.avatarUrl} />
                    <div>
                      <p className="font-semibold text-sm leading-tight">{authorName}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {post.author?.role && <RoleBadge role={post.author.role} />}
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {relativeTime(post.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                  {canDelete && (
                    <button
                      onClick={() => handleDeletePost(post.id)}
                      className="text-xs text-gray-400 hover:text-rmaroon dark:text-gray-500"
                      title="Delete post"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <PostText
                  content={post.content}
                  expanded={!!expandedPosts[post.id]}
                  onToggle={() => setExpandedPosts((p) => ({ ...p, [post.id]: !p[post.id] }))}
                />
              </div>

              {post.mediaUrl && (
                <img
                  src={post.mediaUrl}
                  alt=""
                  className="w-full max-h-[32rem] object-contain bg-gray-100 dark:bg-gray-800"
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
                <div className="px-4 pt-2 text-xs text-gray-400 dark:text-gray-500">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        post.likeCount > 0 &&
                        setLikesListOpen((p) => ({ ...p, [post.id]: !p[post.id] }))
                      }
                      className={post.likeCount > 0 ? 'hover:underline' : ''}
                    >
                      {post.likeCount > 0 && `❤ ${post.likeCount}`}
                    </button>
                    <span>
                      {post.comments.length > 0 &&
                        `${post.comments.length} comment${post.comments.length === 1 ? '' : 's'}`}
                    </span>
                  </div>
                  {likesListOpen[post.id] && post.likedByNames && post.likedByNames.length > 0 && (
                    <p className="mt-1 text-gray-500 dark:text-gray-400">
                      Liked by {post.likedByNames.join(', ')}
                    </p>
                  )}
                </div>
              )}

              {/* Action bar */}
              <div className="flex border-t border-gray-100 mt-2 text-sm dark:border-gray-800">
                <button
                  onClick={() => handleToggleLike(post.id)}
                  className={`flex-1 py-2 flex items-center justify-center gap-1.5 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    post.likedByMe ? 'text-rmaroon' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {post.likedByMe ? '❤' : '🤍'} Like
                </button>
                <button
                  onClick={() => setOpenComments((p) => ({ ...p, [post.id]: !p[post.id] }))}
                  className="flex-1 py-2 flex items-center justify-center gap-1.5 font-medium text-gray-500 hover:bg-gray-50 border-l border-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 dark:border-gray-800"
                >
                  💬 Comment
                </button>
                <button
                  onClick={() => handleSharePost(post.id, post.content)}
                  className="flex-1 py-2 flex items-center justify-center gap-1.5 font-medium text-gray-500 hover:bg-gray-50 border-l border-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 dark:border-gray-800"
                >
                  {copiedPostId === post.id ? '✅ Copied' : '🔗 Share'}
                </button>
              </div>

              {/* Comment preview -- visible even before opening the full thread */}
              {!commentsOpen && post.comments.length > 0 && (
                <div className="px-4 pb-3 space-y-1">
                  {post.comments.slice(-2).map((c) => {
                    const cName = c.author?.name ?? c.authorNamePublic ?? 'Guest';
                    const preview =
                      c.content.length > 80 ? c.content.slice(0, 80).trimEnd() + '\u2026' : c.content;
                    return (
                      <p key={c.id} className="text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{cName}</span>{' '}
                        {preview}
                      </p>
                    );
                  })}
                  {post.comments.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOpenComments((p) => ({ ...p, [post.id]: true }))}
                      className="text-xs text-gray-400 hover:text-rgreen dark:text-gray-500"
                    >
                      View all {post.comments.length} comments
                    </button>
                  )}
                </div>
              )}

              {/* Comments (collapsible) */}
              {commentsOpen && (
                <div className="bg-gray-50 px-4 py-3 space-y-3 dark:bg-gray-950">
                  {post.comments.map((c) => {
                    const cName = c.author?.name ?? c.authorNamePublic ?? 'Guest';
                    return (
                      <div key={c.id} className="flex gap-2">
                        <Avatar name={cName} avatarUrl={c.author?.avatarUrl} />
                        <div className="bg-white rounded-2xl px-3 py-2 flex-1 dark:bg-gray-900">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold">{cName}</p>
                            {user && (c.authorId === user.id || ['ADMIN'].includes(user.role)) && (
                              <button
                                onClick={() => handleDeleteComment(post.id, c.id)}
                                className="text-[10px] text-gray-400 hover:text-rmaroon dark:text-gray-500"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300">{c.content}</p>
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
                      className="flex-1 border border-gray-200 rounded-full px-3 py-1.5 text-sm bg-white dark:border-gray-700 dark:bg-gray-900"
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
    </>
  );

  // Logged-in: same feed, wrapped in the same portal shell every other
  // page uses -- no duplicate top-bar nav, since the sidebar already has
  // AI Assistant, Groups, Library, Profile, Admin, etc.
  if (user) {
    return (
      <PortalLayout title="Home Feed">
        <div className="max-w-xl mx-auto space-y-4">{feedContent}</div>
      </PortalLayout>
    );
  }

  // Logged-out guest: standalone public page, no sidebar to fit into.
  const instName = settings?.shortName || settings?.institutionName || 'Runyenjes';

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm dark:bg-gray-900 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {settings?.logoUrl && (
            <img src={settings.logoUrl} alt="" className="w-8 h-8 object-contain rounded" />
          )}
          <h1 className="font-bold text-rgreen">{instName} Home</h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/apply')} className="text-sm text-gray-600 underline dark:text-gray-400">
            Apply
          </button>
          <button onClick={() => navigate('/browser')} className="text-sm text-gray-600 underline dark:text-gray-400">
            Browser
          </button>
          <button
            onClick={() => navigate('/about-rtvc')}
            className="font-bold text-rgreen"
          >
            About {instName}
          </button>
          <button
            type="button"
            onClick={toggleDarkMode}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {darkMode ? '☀' : '🌙'}
          </button>
          <button
            onClick={() => navigate('/login')}
            className="text-sm bg-rgreen text-white px-3 py-1.5 rounded-md"
          >
            Member sign in
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_280px] gap-4 items-start">
          {/* Left: quick links -- desktop only, collapses away on mobile */}
          <aside className="hidden lg:block sticky top-20">
            <div className="bg-white rounded-xl shadow p-4 dark:bg-gray-900">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 dark:text-gray-500">
                Quick Links
              </p>
              <nav className="space-y-1">
                <button
                  onClick={() => navigate('/apply')}
                  className="w-full text-left text-sm text-gray-700 hover:bg-gray-50 rounded-lg px-3 py-2 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  📝 Apply Now
                </button>
                <button
                  onClick={() => navigate('/about-rtvc')}
                  className="w-full text-left text-sm text-gray-700 hover:bg-gray-50 rounded-lg px-3 py-2 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  🏫 About {instName}
                </button>
                <button
                  onClick={() => navigate('/browser')}
                  className="w-full text-left text-sm text-gray-700 hover:bg-gray-50 rounded-lg px-3 py-2 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  🌐 Research Browser
                </button>
                <button
                  onClick={() => navigate('/login')}
                  className="w-full text-left text-sm text-gray-700 hover:bg-gray-50 rounded-lg px-3 py-2 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  🔐 Member Sign In
                </button>
              </nav>
            </div>
          </aside>

          {/* Center: the feed (Stories rail, composer, posts) */}
          <div className="max-w-xl w-full mx-auto lg:mx-0 space-y-4">{feedContent}</div>

          {/* Right: institution card -- desktop only, sourced from /settings */}
          <aside className="hidden lg:block sticky top-20">
            <div className="bg-white rounded-xl shadow p-4 dark:bg-gray-900">
              {settings?.logoUrl && (
                <img src={settings.logoUrl} alt="" className="w-14 h-14 object-contain mx-auto mb-2" />
              )}
              <h2 className="font-bold text-center dark:text-gray-100">{instName}</h2>
              {settings?.tagline && (
                <p className="text-xs text-gray-500 text-center italic mt-1 dark:text-gray-400">
                  "{settings.tagline}"
                </p>
              )}
              <div className="text-xs text-gray-500 mt-3 space-y-1 dark:text-gray-400">
                {settings?.address && <p>📮 {settings.address}</p>}
                {settings?.phone && <p>☎ {settings.phone}</p>}
                {settings?.email && <p>✉ {settings.email}</p>}
              </div>
              <button
                onClick={() => navigate('/about-rtvc')}
                className="text-xs text-rgreen font-medium mt-3 block mx-auto"
              >
                Learn more →
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
