import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface Group {
  id: string;
  type: string;
  name: string;
  programId: string | null;
}

interface Program {
  id: string;
  name: string;
  level: string | null;
}
interface Department {
  id: string;
  name: string;
  programs: Program[];
}

export default function Library() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [classGroups, setClassGroups] = useState<Group[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  const isStaff = user && ['TEACHER', 'ADMIN', 'FOUNDER'].includes(user.role);

  useEffect(() => {
    if (!user) return;
    if (isStaff) {
      api('/programs').then(setDepartments).finally(() => setLoading(false));
    } else {
      api('/groups', { token })
        .then((groups: Group[]) => setClassGroups(groups.filter((g) => g.type === 'CLASS')))
        .finally(() => setLoading(false));
    }
  }, [user]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Please{' '}
        <button onClick={() => navigate('/login')} className="text-rgreen underline mx-1">
          sign in
        </button>{' '}
        to view the Library.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-rgreen">Library</h1>
        <button onClick={() => navigate('/')} className="text-sm text-gray-500 underline">
          Back to Home
        </button>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {loading ? (
          <p className="text-sm text-gray-400 text-center">Loading…</p>
        ) : isStaff ? (
          departments.map((dept) => (
            <div key={dept.id} className="bg-white rounded-lg shadow p-4">
              <p className="font-medium text-sm mb-2">{dept.name}</p>
              <div className="space-y-1">
                {dept.programs.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/library/${p.id}`)}
                    className="w-full text-left text-sm text-gray-700 hover:text-rgreen py-1"
                  >
                    {p.name}
                    {p.level ? ` — ${p.level}` : ''}
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : classGroups.length === 0 ? (
          <p className="text-sm text-gray-400 text-center">
            You're not enrolled in any class yet.
          </p>
        ) : (
          classGroups.map(
            (g) =>
              g.programId && (
                <button
                  key={g.id}
                  onClick={() => navigate(`/library/${g.programId}`)}
                  className="w-full text-left bg-white rounded-lg shadow p-4 hover:bg-gray-50"
                >
                  <p className="font-medium text-sm">{g.name}</p>
                  <p className="text-xs text-gray-400">View units & materials</p>
                </button>
              )
          )
        )}
      </main>
    </div>
  );
}
