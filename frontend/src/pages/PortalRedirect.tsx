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

    default:
      return <Navigate to="/" replace />;
  }
}
