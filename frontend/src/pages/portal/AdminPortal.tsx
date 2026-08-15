import PortalLayout from '../../components/portal/PortalLayout';

export default function AdminPortal() {
  return (
    <PortalLayout title="Administration Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Administration Dashboard
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage the college's people, academics and operations.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ['Students', 'Manage student records'],
            ['Staff', 'Manage staff accounts'],
            ['Academic', 'Manage departments and programs'],
            ['Admissions', 'Manage applications'],
          ].map(([title, description]) => (
            <div
              key={title}
              className="bg-white border border-gray-200 rounded-lg p-5"
            >
              <h3 className="font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500 mt-1">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </PortalLayout>
  );
}
