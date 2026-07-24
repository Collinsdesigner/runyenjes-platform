import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface Group {
  id: string;
  type: string;
  name: string;
  program?: { name: string; level: string | null } | null;
  department?: { name: string } | null;
}

const TYPE_LABEL: Record<string, string> = {
  CLASS: 'Class',
  DEPARTMENT: 'Department',
  SCHOOL: 'Whole School',
  TEACHERS: 'Teachers',
  ADMINS: 'Admins',
};

export default function Groups() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api('/groups', { token })
      .then(setGroups)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Please{' '}
        <button onClick={() => navigate('/login')} className="text-rgreen underline mx-1">
          sign in
        </button>{' '}
        to view your groups.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-rgreen">My Groups</h1>
        <button onClick={() => navigate('/')} className="text-sm text-gray-500 underline">
          Back to Home
        </button>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-2">
        {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>}
        {loading ? (
          <p className="text-sm text-gray-400 text-center">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-gray-400 text-center">
            You're not in any groups yet.
          </p>
        ) : (
          groups.map((g) => (
            <button
              key={g.id}
              onClick={() => navigate(`/groups/${g.id}`)}
              className="w-full text-left bg-white rounded-lg shadow p-4 flex items-center justify-between hover:bg-gray-50"
            >
              <div>
                <p className="font-medium text-sm">{g.name}</p>
                <p className="text-xs text-gray-400">{TYPE_LABEL[g.type] ?? g.type}</p>
              </div>
              <span className="text-rgreen text-sm">Open →</span>
            </button>
          ))
        )}
      </main>
    </div>
  );
}
