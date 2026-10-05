import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function AdminPortal() {
  // VISIT_STATS_V1 -- dashboard stats (students/teachers/departments/pending/visitors)
  const { token } = useAuth();
  const [stats, setStats] = useState<{
    students?: number;
    teachers?: number;
    departments?: number;
    pendingApplications?: number;
    homeVisits?: number;
  }>({});
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    api('/admin/stats', { token })
      .then(setStats)
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [token]);

  return (
    <PortalLayout title="Administration Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Administration Dashboard
          </h2>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            Manage the college's people, academics and operations.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            ['Students', stats.students],
            ['Teachers', stats.teachers],
            ['Departments', stats.departments],
            ['Pending Applications', stats.pendingApplications],
            ['Visitors (this week)', stats.homeVisits],
          ].map(([label, value]) => (
            <div
              key={label as string}
              className="bg-white border border-gray-200 rounded-lg p-5 dark:bg-gray-900 dark:border-gray-700"
            >
              <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2 dark:text-gray-100">
                {statsLoading ? '—' : (value as number) ?? 0}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Visitor count resets weekly.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ['Students', 'Manage student records', '/admin/students'],
            ['Staff', 'Manage staff accounts', '/admin/staff'],
            ['Academic', 'Manage departments and programs', '/admin/academic'],
            ['Admissions', 'Manage applications', '/admin/admissions'],
          ].map(([title, description, path]) => (
            <Link
              key={title}
              to={path}
              className="block bg-white border border-gray-200 rounded-lg p-5 hover:border-rgreen hover:shadow-sm transition dark:bg-gray-900 dark:border-gray-700"
            >
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
              <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
                {description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </PortalLayout>
  );
}
