import { Link } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';

export default function AdminPortal() {
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
