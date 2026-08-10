import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, uploadImage } from '../api/client';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function Profile() {
  const { user, token, updateAvatar } = useAuth();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Please{' '}
        <button onClick={() => navigate('/login')} className="text-rgreen underline mx-1">
          sign in
        </button>{' '}
        to view your profile.
      </div>
    );
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(null);
    setUploading(true);
    try {
const image = await uploadImage(file, token);

await api('/profile/avatar', {
  method: 'PATCH',
  body: {
    avatarUrl: image.url,
    avatarPublicId: image.publicId,
  },
  token,
});

updateAvatar(image.url);
      setSuccess('Profile picture updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update profile picture');
    } finally {
      setUploading(false);
    }
  }

async function handleRemoveAvatar() {
  if (!token) return;

  setError(null);
  setSuccess(null);

  try {
    await api('/profile/avatar', {
      method: 'DELETE',
      token,
    });

    updateAvatar(null);
    setImgError(false);
    setSuccess('Profile picture removed.');
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Could not remove profile picture.'
    );
  }
}

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-rgreen">My Profile</h1>
        <button onClick={() => navigate('/')} className="text-sm text-gray-500 underline">
          Back to Home
        </button>
      </header>

      <main className="max-w-sm mx-auto p-4">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          {user.avatarUrl && !imgError ? (
            <img
              src={user.avatarUrl}
              alt=""
              onError={() => setImgError(true)}
              className="w-24 h-24 rounded-full object-cover mx-auto"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-rgreen text-white flex items-center justify-center text-2xl font-bold mx-auto">
              {initials(user.name)}
            </div>
          )}

          <p className="font-semibold mt-3">{user.name}</p>
          <p className="text-xs text-gray-400">{user.role}</p>

{user.role !== 'STUDENT' && (
  <div className="mt-4">
    <button
      type="button"
      onClick={() => navigate('/security')}
      className="text-sm text-rgreen underline"
    >
      Security Settings
    </button>
  </div>
)}

          <label className="inline-block mt-4 text-sm text-rgreen underline cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
              disabled={uploading}
            />
            {uploading ? 'Uploading…' : 'Change profile picture'}
          </label>
{user.avatarUrl && (
  <button
    type="button"
    onClick={handleRemoveAvatar}
    className="block mx-auto mt-3 text-sm text-red-600 underline"
  >
    Remove profile picture
  </button>
)}

          {error && <p className="text-xs text-rmaroon mt-2">{error}</p>}
          {success && <p className="text-xs text-green-700 mt-2">✔ {success}</p>}
        </div>
      </main>
    </div>
  );
}
