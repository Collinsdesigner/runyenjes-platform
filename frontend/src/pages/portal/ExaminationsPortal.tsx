import { useNavigate } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';

export default function ExaminationsPortal() {
  const navigate = useNavigate();

  const cards = [
    {
      title: 'Exams & Results',
      description: 'Create exams for a unit and record student scores.',
      action: () => navigate('/examinations/results'),
      icon: '\ud83d\udcca',
    },
  ];

  return (
    <PortalLayout title="Examinations Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Examinations Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Exams, CATs and results workspace.</p>
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
