import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

type Stats = {
  pendingApplications?: number;
  students?: number;
};

export default function RegistrarPortal() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<Stats>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;

    async function load() {
      try {
const data = await api('/registrar/stats', { token });
        setStats(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not load dashboard'
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [token]);

  const cards = [
    {
      title: 'Admissions',
      description:
        'Review applications, admit students, reject applications and manage the admission process.',
      action: () => navigate('/admissions'),
      icon: '📝',
    },
    {
      title: 'Continuation',
      description:
        'Manage student continuation and confirm students who report physically.',
      action: () => navigate('/continuation'),
      icon: '🔄',
    },
    {
      title: 'Student Records',
      description:
        'View and manage student registration information and admission numbers.',
      action: () => navigate('/registrar/students'),
      icon: '🎓',
    },
    {
      title: 'Groups',
      description:
        'Access school and department communication groups.',
      action: () => navigate('/groups'),
      icon: '💬',
    },
    {
      title: 'Programmes & Departments',
      description:
        'View academic departments and programmes, including levels, exam bodies and current fees.',
      action: () => navigate('/registrar/programmes'),
      icon: '🏛',
    },
  ];

  return (
    <PortalLayout title="Registrar Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Registrar Dashboard
          </h2>

          <p className="text-sm text-gray-500 mt-1">
            Admissions, registration and student administration workspace.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-sm text-gray-500">
              Pending Applications
            </p>

            <p className="text-3xl font-bold text-gray-900 mt-2">
              {loading ? '—' : stats.pendingApplications ?? 0}
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-sm text-gray-500">
              Students
            </p>

            <p className="text-3xl font-bold text-gray-900 mt-2">
              {loading ? '—' : stats.students ?? 0}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cards.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={card.action}
              className="bg-white border border-gray-200 rounded-lg p-5 text-left hover:border-rgreen hover:shadow-sm transition"
            >
              <div className="flex items-start gap-4">
                <div className="text-2xl">
                  {card.icon}
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900">
                    {card.title}
                  </h3>

                  <p className="text-sm text-gray-500 mt-1">
                    {card.description}
                  </p>

                  <p className="text-sm text-rgreen font-medium mt-3">
                    Open →
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </PortalLayout>
  );
}
