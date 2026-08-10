import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type Mode = 'student' | 'staff';

export default function Login() {
  const [mode, setMode] = useState<Mode>('student');
  const [email, setEmail] = useState('');
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { studentLogin, staffLogin } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'student') {
        await studentLogin(email, admissionNumber);
        navigate('/');
      } else {
        const user = await staffLogin(email, password);

        if (user.mustChangePassword) {
          navigate('/security');
        } else {
          navigate('/');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-6">
        <h1 className="text-xl font-bold text-rgreen text-center mb-1">
          Runyenjes Technical & Vocational College
        </h1>

        <p className="text-sm text-gray-500 text-center mb-6">
          Member sign in
        </p>

        <div className="flex rounded-md overflow-hidden border border-gray-200 mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('student');
              setError(null);
            }}
            className={`flex-1 py-2 text-sm font-medium ${
              mode === 'student'
                ? 'bg-rgreen text-white'
                : 'bg-white text-gray-600'
            }`}
          >
            Student
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('staff');
              setError(null);
            }}
            className={`flex-1 py-2 text-sm font-medium ${
              mode === 'staff'
                ? 'bg-rgreen text-white'
                : 'bg-white text-gray-600'
            }`}
          >
            Staff
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>

            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rgreen"
              placeholder="you@runyenjestechnical.ac.ke"
            />
          </div>

          {mode === 'student' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Admission Number
              </label>

              <input
                type="text"
                required
                value={admissionNumber}
                onChange={(e) => setAdmissionNumber(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rgreen"
                placeholder="e.g. RTVC/2026/00123"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>

              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rgreen"
                placeholder="••••••••"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-rmaroon">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-rgreen text-white rounded-md py-2 text-sm font-medium disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full text-center text-sm text-gray-500 mt-4 underline"
        >
          Continue to Home feed without logging in
        </button>
      </div>
    </div>
  );
}
