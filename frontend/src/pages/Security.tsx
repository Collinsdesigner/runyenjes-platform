import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Security() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError('');
    setSuccess('');

    if (!token || !user) {
      setError('Your session has expired. Please sign in again.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const response: any = await api('/security/change-password', {
        method: 'PATCH',
        token,
        body: {
          currentPassword,
          newPassword,
        },
      });

      setSuccess(response.message || 'Password changed successfully.');

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Password has been changed, so the forced-change requirement is complete.
      if (user.mustChangePassword) {
        setTimeout(() => {
          navigate('/');
        }, 1000);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to change password.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between dark:bg-gray-900 dark:border-gray-700">
        <h1 className="font-bold text-rgreen">Security</h1>

        {!user?.mustChangePassword && (
          <button
            onClick={() => navigate('/profile')}
            className="text-sm text-gray-500 underline dark:text-gray-400"
          >
            Back
          </button>
        )}
      </header>

      <main className="max-w-md mx-auto p-4">
        <div className="bg-white rounded-lg shadow p-6 dark:bg-gray-900">
          {user?.mustChangePassword && (
            <div className="mb-5 rounded-md bg-yellow-50 border border-yellow-200 p-3">
              <p className="text-sm text-yellow-800">
                Your administrator has reset your password.
                Please create a new password before continuing.
              </p>
            </div>
          )}

          <h2 className="text-lg font-semibold mb-1">
            Change Password
          </h2>

          <p className="text-sm text-gray-500 mb-5 dark:text-gray-400">
            Enter your current password and choose a new password.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                Current password
              </label>

              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-rgreen dark:border-gray-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                New password
              </label>

              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-rgreen dark:border-gray-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                Confirm new password
              </label>

              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-rgreen dark:border-gray-600"
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm dark:text-red-400">
                {error}
              </p>
            )}

            {success && (
              <p className="text-green-700 text-sm dark:text-green-300">
                ✔ {success}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-rgreen text-white rounded-md p-2 font-medium disabled:opacity-60"
            >
              {loading ? 'Updating...' : 'Change Password'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
