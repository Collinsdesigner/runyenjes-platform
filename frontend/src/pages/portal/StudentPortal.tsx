import PortalLayout from '../../components/portal/PortalLayout';

export default function StudentPortal() {
  return (
    <PortalLayout title="Student Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Student Dashboard
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Your academic and college workspace.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ['My Units', 'View your current units'],
            ['Timetable', 'Check your classes'],
            ['Results', 'View academic results'],
            ['Fees', 'View fees and payments'],
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
