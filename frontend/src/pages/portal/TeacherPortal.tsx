// TEACHER_PORTAL_CLICKABLE_CARDS_V1
import { useNavigate } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';

export default function TeacherPortal() {
  const navigate = useNavigate();

  const cards = [
    {
      title: 'My Classes',
      description: 'Manage your classes',
      action: () => navigate('/teacher/classes'),
      icon: '\ud83c\udfeb',
    },
    {
      title: 'My Units',
      description: 'Manage assigned units',
      action: () => navigate('/teacher/units'),
      icon: '\ud83d\udcda',
    },
    {
      title: 'Students',
      description: 'View your students',
      action: () => navigate('/teacher/students'),
      icon: '\ud83c\udf93',
    },
    {
      title: 'Attendance',
      description: 'Record attendance',
      action: () => navigate('/teacher/attendance'),
      icon: '\u2705',
    },
  ];

  return (
    <PortalLayout title="Teacher Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Teacher Dashboard
          </h2>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            Your teaching and academic workspace.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={card.action}
              className="bg-white border border-gray-200 rounded-lg p-5 text-left hover:border-rgreen hover:shadow-sm transition dark:bg-gray-900 dark:border-gray-700"
            >
              <div className="flex items-start gap-4">
                <div className="text-2xl">{card.icon}</div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{card.title}</h3>
                  <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">{card.description}</p>
                  <p className="text-sm text-rgreen font-medium mt-3">Open \u2192</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </PortalLayout>
  );
}
