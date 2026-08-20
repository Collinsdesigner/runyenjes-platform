import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PortalRedirect() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  switch (user.role) {

    case 'ADMIN':
      return <Navigate to="/admin" replace />;

    case 'REGISTRAR':
      return <Navigate to="/registrar" replace />;

    case 'TEACHER':
      return <Navigate to="/teacher" replace />;

    case 'STUDENT':
      return <Navigate to="/student" replace />;


    case 'FINANCE_OFFICER':
      return <Navigate to="/finance" replace />;

    case 'HR_OFFICER':
      return <Navigate to="/hr" replace />;

    case 'EXAM_OFFICER':
      return <Navigate to="/examinations" replace />;

    case 'STORES_OFFICER':
      return <Navigate to="/stores" replace />;

    case 'ALUMNI':
      return <Navigate to="/alumni" replace />;

    case 'PROCUREMENT_OFFICER':
      return <Navigate to="/procurement" replace />;
    default:
      return <Navigate to="/" replace />;
  }
}
