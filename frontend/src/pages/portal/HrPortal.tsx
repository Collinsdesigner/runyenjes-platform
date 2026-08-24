import { useNavigate } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';

export default function HrPortal() {
  const navigate = useNavigate();

  const cards = [
    {
      title: 'Staff & Leave',
      description: 'Manage staff profiles and review/approve leave requests.',
      action: () => navigate('/hr/staff'),
      icon: '\ud83d\udc65',
    },
  ];

  return (
    <PortalLayout title="HR Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">HR Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Staff records and leave management workspace.</p>
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
                <div className="text-2xl">{card.icon}</div>
                <div>
                  <h3 className="font-semibold text-gray-900">{card.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{card.description}</p>
                  <p className="text-sm text-rgreen font-medium mt-3">Open →</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </PortalLayout>
  );
}
