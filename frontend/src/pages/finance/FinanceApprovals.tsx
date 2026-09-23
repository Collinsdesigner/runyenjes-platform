import PortalLayout from '../../components/portal/PortalLayout';
import RequestApprovals from '../../components/requests/RequestApprovals';

export default function FinanceApprovals() {
  return (
    <PortalLayout title="Approvals">
      <RequestApprovals />
    </PortalLayout>
  );
}
