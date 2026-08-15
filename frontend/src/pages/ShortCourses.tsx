import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface Program {
  id: string;
  name: string;
  currentFee: number | null;
}
interface Department {
  id: string;
  name: string;
  programs: Program[];
}

export default function ShortCourses() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/programs')
      .then((departments: Department[]) => {
        const shortCourses = departments.flatMap((d) => d.programs).filter((p: any) => p.isShortCourse === true);
        setCourses(shortCourses);
      })
      .finally(() => setLoading(false));
  }, []);

  // NOT publicly launched yet — awaiting Admin/Founder approval to go live.
  // To make this public later, just remove this check.
if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500 text-center p-6">
        This page is a preview, not yet approved for public launch.
        <br />
        Only Admin/Founder can view it right now.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-rgreen">Short Courses</h1>
        <button onClick={() => navigate('/')} className="text-sm text-gray-500 underline">
          Back to Home
        </button>
      </header>

      <main className="max-w-xl mx-auto p-4">
        <p className="text-sm text-gray-500 mb-4">
          Learn a practical skill in 1–2 months. No prior enrollment needed — apply directly below.
        </p>

        {loading ? (
          <p className="text-sm text-gray-400 text-center">Loading…</p>
        ) : courses.length === 0 ? (
          <p className="text-sm text-gray-400 text-center">No short courses listed yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {courses.map((c) => (
              <div key={c.id} className="bg-white rounded-lg shadow p-4 flex flex-col">
                <p className="font-medium text-sm">{c.name}</p>
                <p className="text-xs text-gray-500 mt-1 flex-1">
                  {c.currentFee ? `KES ${Number(c.currentFee).toLocaleString()}` : 'Fee to be announced'}
                </p>
                <button
                  onClick={() => navigate(`/apply?program=${c.id}`)}
                  className="mt-3 text-xs bg-rgreen text-white px-3 py-1.5 rounded-md"
                >
                  Apply now
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
