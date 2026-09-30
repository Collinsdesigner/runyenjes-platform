// STORIES_RAIL_COMPONENT_V1
import { useEffect, useRef, useState } from 'react';
import { api, uploadImage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface StoryAuthor {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
}

interface StoryItem {
  id: string;
  content: string;
  mediaUrl: string | null;
  createdAt: string;
  expiresAt: string;
  authorId: string;
  author: StoryAuthor;
}

// Must match backend CAN_POST in stories.routes.ts. This is a UI
// convenience only -- the server enforces the real rule.
const CAN_POST_STORY = ['TEACHER', 'REGISTRAR', 'ADMIN'];
const STORY_DURATION_MS = 6000;
const MAX_STORY_LENGTH = 500;

const AVATAR_COLORS = ['#0B7A2B', '#5C0F00', '#1D4ED8', '#B45309', '#7C3AED', '#0891B2'];

function avatarColor(name: string) {
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

function groupByAuthor(list: StoryItem[]): StoryItem[][] {
  const map = new Map<string, StoryItem[]>();
  for (const s of list) {
    const arr = map.get(s.authorId) || [];
    arr.push(s);
    map.set(s.authorId, arr);
  }
  const groups = Array.from(map.values()).map((arr) =>
    arr.slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  );
  groups.sort(
    (a, b) =>
      new Date(b[b.length - 1].createdAt).getTime() - new Date(a[a.length - 1].createdAt).getTime()
  );
  return groups;
}

function AvatarCircle({ author, size }: { author: StoryAuthor; size: number }) {
  const [imgError, setImgError] = useState(false);
  const px = `${size}px`;
  if (author.avatarUrl && !imgError) {
    return (
      <img
        src={author.avatarUrl}
        alt={author.name}
        onError={() => setImgError(true)}
        style={{ width: px, height: px }}
        className="rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ width: px, height: px, backgroundColor: avatarColor(author.name) }}
      className="rounded-full flex items-center justify-center text-white text-xs font-bold"
    >
      {initials(author.name)}
    </div>
  );
}

// STORY_PREVIEW_CIRCLE_V1
// Shows a preview of the story itself (its photo, or a text snippet on a
// gradient) rather than just the poster's avatar, with a small avatar
// badge in the corner for attribution.
function StoryPreviewCircle({
  story,
  author,
  size,
}: {
  story: StoryItem;
  author: StoryAuthor;
  size: number;
}) {
  const [imgError, setImgError] = useState(false);
  const px = `${size}px`;
  const hasImage = Boolean(story.mediaUrl) && !imgError;
  const snippet = story.content.trim().slice(0, 28);

  return (
    <div style={{ width: px, height: px }} className="relative rounded-full overflow-hidden">
      {hasImage ? (
        <img
          src={story.mediaUrl as string}
          alt=""
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center px-1"
          style={{ background: `linear-gradient(135deg, ${avatarColor(author.name)}, #1D4ED8)` }}
        >
          <span className="text-white text-[8px] leading-tight text-center font-medium line-clamp-3">
            {snippet || author.name}
          </span>
        </div>
      )}

      {/* Small avatar badge -- identifies who posted it */}
      <div className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-white dark:ring-gray-900">
        <AvatarCircle author={author} size={Math.round(size * 0.4)} />
      </div>
    </div>
  );
}

export default function StoriesRail() {
  const { user, token } = useAuth();
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [groupIndex, setGroupIndex] = useState<number | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const [showComposer, setShowComposer] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [composerMediaUrl, setComposerMediaUrl] = useState('');
  const [composerMediaPublicId, setComposerMediaPublicId] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [posting, setPosting] = useState(false);

  const frameRef = useRef<number | null>(null);
  const startRef = useRef(0);

  const canPost = user ? CAN_POST_STORY.includes(user.role) : false;

  async function loadStories() {
    try {
      const data = await api('/stories', { token });
      setStories(data);
    } catch {
      // Stories are a decorative addition to the feed -- a failure here
      // should never block the feed itself from rendering.
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    loadStories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = groupByAuthor(stories);
  const activeGroup = groupIndex !== null ? groups[groupIndex] : null;
  const activeStory = activeGroup ? activeGroup[storyIndex] : null;
  const isOwnStory = Boolean(
    activeStory && user && (activeStory.authorId === user.id || user.role === 'ADMIN')
  );

  function openViewer(idx: number) {
    setGroupIndex(idx);
    setStoryIndex(0);
  }

  function closeViewer() {
    setGroupIndex(null);
    setStoryIndex(0);
    setProgress(0);
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }

  function goNext() {
    setGroupIndex((g) => {
      if (g === null) return g;
      const group = groups[g];
      if (storyIndex < group.length - 1) {
        setStoryIndex((i) => i + 1);
        return g;
      }
      if (g < groups.length - 1) {
        setStoryIndex(0);
        return g + 1;
      }
      setTimeout(closeViewer, 0);
      return g;
    });
  }

  function goPrev() {
    setGroupIndex((g) => {
      if (g === null) return g;
      if (storyIndex > 0) {
        setStoryIndex((i) => i - 1);
        return g;
      }
      if (g > 0) {
        setStoryIndex(groups[g - 1].length - 1);
        return g - 1;
      }
      return g;
    });
  }

  useEffect(() => {
    if (groupIndex === null) return undefined;
    startRef.current = performance.now();
    setProgress(0);

    function tick(now: number) {
      const elapsed = now - startRef.current;
      const pct = Math.min(1, elapsed / STORY_DURATION_MS);
      setProgress(pct);
      if (pct >= 1) {
        goNext();
      } else {
        frameRef.current = requestAnimationFrame(tick);
      }
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIndex, storyIndex]);

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingImage(true);
    try {
      const image = await uploadImage(file, token);
      setComposerMediaUrl(image.url);
      setComposerMediaPublicId(image.publicId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handlePostStory() {
    if (!composerText.trim() && !composerMediaUrl) return;
    setPosting(true);
    setError(null);
    try {
      await api('/stories', {
        method: 'POST',
        token,
        body: {
          content: composerText.trim(),
          mediaUrl: composerMediaUrl || undefined,
          mediaPublicId: composerMediaPublicId || undefined,
        },
      });
      setComposerText('');
      setComposerMediaUrl('');
      setComposerMediaPublicId('');
      setShowComposer(false);
      await loadStories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post story');
    } finally {
      setPosting(false);
    }
  }

  async function handleDeleteStory(id: string) {
    if (!confirm('Delete this story?')) return;
    try {
      await api(`/stories/${id}`, { method: 'DELETE', token });
      closeViewer();
      await loadStories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete story');
    }
  }

  // Nothing to show yet, and nobody who could add anything -- render
  // nothing rather than an empty bar.
  if (loaded && groups.length === 0 && !canPost) return null;
  if (!loaded) return null;

  return (
    <>
      <div className="bg-white rounded-xl shadow p-3 dark:bg-gray-900">
        <div className="flex gap-3 overflow-x-auto">
          {canPost && (
            <button
              type="button"
              onClick={() => setShowComposer(true)}
              className="flex flex-col items-center gap-1 shrink-0 w-16"
            >
              <div className="w-14 h-14 rounded-full border-2 border-dashed border-rgreen flex items-center justify-center text-rgreen text-xl">
                +
              </div>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">Add story</span>
            </button>
          )}

          {groups.map((group, idx) => {
            const author = group[group.length - 1].author;
            return (
              <button
                type="button"
                key={author.id}
                onClick={() => openViewer(idx)}
                className="flex flex-col items-center gap-1 shrink-0 w-16"
              >
                <div
                  className="w-14 h-14 rounded-full p-[2px]"
                  style={{ background: 'linear-gradient(45deg, #0B7A2B, #1D4ED8)' }}
                >
                  <div className="w-full h-full rounded-full bg-white p-[2px] dark:bg-gray-900">
                    <StoryPreviewCircle story={group[group.length - 1]} author={author} size={52} />
                  </div>
                </div>
                <span className="text-[10px] text-gray-600 truncate w-16 text-center dark:text-gray-400">
                  {author.name.split(' ')[0]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {showComposer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 w-full max-w-sm dark:bg-gray-900">
            <h3 className="font-semibold mb-3 dark:text-gray-100">Add to your story</h3>
            <textarea
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              placeholder="Say something... (visible for 24 hours)"
              rows={3}
              maxLength={MAX_STORY_LENGTH}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 resize-none dark:border-gray-700 dark:bg-gray-950"
            />

            {composerMediaUrl && (
              <div className="mt-2 relative">
                <img
                  src={composerMediaUrl}
                  alt="Preview"
                  className="w-full max-h-48 object-contain bg-gray-100 rounded-lg dark:bg-gray-800"
                />
                <button
                  type="button"
                  onClick={() => {
                    setComposerMediaUrl('');
                    setComposerMediaPublicId('');
                  }}
                  className="absolute top-2 right-2 bg-black/60 text-white text-xs w-6 h-6 rounded-full"
                >
                  ✕
                </button>
              </div>
            )}

            {error && <p className="text-xs text-rmaroon mt-2">{error}</p>}

            <div className="flex items-center justify-between mt-3">
              <label className="text-xs text-gray-500 hover:text-rgreen flex items-center gap-1 cursor-pointer dark:text-gray-400">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                  disabled={uploadingImage}
                />
                {uploadingImage ? 'Uploading…' : '🖼 Photo'}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowComposer(false)}
                  className="text-sm text-gray-500 px-3 py-1.5 dark:text-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePostStory}
                  disabled={posting || uploadingImage || (!composerText.trim() && !composerMediaUrl)}
                  className="bg-rgreen text-white text-sm font-medium px-4 py-1.5 rounded-full disabled:opacity-50"
                >
                  {posting ? 'Posting…' : 'Share'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeStory && activeGroup && (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
          <div className="relative w-full h-full max-w-md mx-auto flex flex-col">
            <div className="flex gap-1 p-2 pt-3">
              {activeGroup.map((s, i) => (
                <div key={s.id} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white"
                    style={{
                      width:
                        i < storyIndex ? '100%' : i === storyIndex ? `${progress * 100}%` : '0%',
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between px-3 pb-2">
              <div className="flex items-center gap-2">
                <AvatarCircle author={activeStory.author} size={32} />
                <div>
                  <p className="text-white text-xs font-semibold">{activeStory.author.name}</p>
                  <p className="text-white/60 text-[10px]">{timeAgo(activeStory.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isOwnStory && (
                  <button
                    type="button"
                    onClick={() => handleDeleteStory(activeStory.id)}
                    className="text-white/80 text-xs"
                  >
                    Delete
                  </button>
                )}
                <button type="button" onClick={closeViewer} className="text-white text-xl leading-none">
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
              {activeStory.mediaUrl ? (
                <img src={activeStory.mediaUrl} alt="" className="max-w-full max-h-full object-contain" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center px-8"
                  style={{ background: 'linear-gradient(135deg,#0B7A2B,#1D4ED8)' }}
                >
                  <p className="text-white text-xl font-medium text-center whitespace-pre-wrap">
                    {activeStory.content}
                  </p>
                </div>
              )}

              {activeStory.mediaUrl && activeStory.content && (
                <p className="absolute bottom-4 left-4 right-4 text-white text-sm bg-black/40 rounded-lg px-3 py-2 whitespace-pre-wrap">
                  {activeStory.content}
                </p>
              )}

              <button
                type="button"
                onClick={goPrev}
                className="absolute left-0 top-0 w-1/3 h-full"
                aria-label="Previous story"
              />
              <button
                type="button"
                onClick={goNext}
                className="absolute right-0 top-0 w-1/3 h-full"
                aria-label="Next story"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
