import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface AlumniProfile {
  graduationYear: number | null;
  currentEmployer: string | null;
  currentPosition: string | null;
}

export default function AlumniPortal() {
  const { token } = useAuth();
  const [profile, setProfile] = useState<AlumniProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [currentEmployer, setCurrentEmployer] = useState('');
  const [currentPosition, setCurrentPosition] = useState('');

  useEffect(() => {
    if (!token) return;
    api('/alumni/profile', { token })
      .then((data) => {
        setProfile(data);
        setCurrentEmployer(data.currentEmployer || '');
        setCurrentPosition(data.currentPosition || '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your profile'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const updated = await api('/alumni/profile', {
        method: 'PATCH',
        token,
        body: { currentEmployer, currentPosition },
      });
      setProfile(updated);
      setMessage('Profile updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update profile');
    }
  }

  return (
    <PortalLayout title="Alumni Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Alumni Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Your graduation record and current details.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        {!loading && profile && (
          <>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <p className="text-sm text-gray-500">Graduation Year</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{profile.graduationYear || '—'}</p>
            </div>

            <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
              <h3 className="font-semibold text-gray-900">Update Current Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Current employer"
                  value={currentEmployer}
                  onChange={(e) => setCurrentEmployer(e.target.value)}
                />
                <input
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Current position"
                  value={currentPosition}
                  onChange={(e) => setCurrentPosition(e.target.value)}
                />
              </div>
              <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
                Save
              </button>
            </form>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
