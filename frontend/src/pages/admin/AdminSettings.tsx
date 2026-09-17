import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function AdminSettings() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    institutionName: '',
    shortName: '',
    tagline: '',
    primaryColor: '',
    secondaryColor: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    about: '',
    physicalLocation: '',
    googleMapsUrl: '',
  });

  useEffect(() => {
    api('/settings')
      .then((data) =>
        setForm({
          institutionName: data.institutionName || '',
          shortName: data.shortName || '',
          tagline: data.tagline || '',
          primaryColor: data.primaryColor || '',
          secondaryColor: data.secondaryColor || '',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          website: data.website || '',
          about: data.about || '',
          physicalLocation: data.physicalLocation || '',
          googleMapsUrl: data.googleMapsUrl || '',
        })
      )
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load settings'))
      .finally(() => setLoading(false));
  }, []);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api('/admin/settings', { method: 'PATCH', token, body: form });
      setMessage('Settings saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings');
    }
  }

  if (loading) {
    return (
      <PortalLayout title="Institution Settings">
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Institution Settings">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Institution Settings</h2>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            Renaming the college, changing colors, or updating contact info happens here — no code change needed.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm dark:bg-green-950 dark:border-green-800 dark:text-green-300">{message}</div>
        )}

        <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-lg p-5 space-y-4 dark:bg-gray-900 dark:border-gray-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">Institution name</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
                value={form.institutionName}
                onChange={(e) => set('institutionName', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">Short name</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
                value={form.shortName}
                onChange={(e) => set('shortName', e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-gray-500 dark:text-gray-400">Tagline</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
                value={form.tagline}
                onChange={(e) => set('tagline', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">Primary color</span>
              <input
                type="color"
                className="mt-1 w-full h-10 border border-gray-300 rounded-lg px-1 dark:border-gray-600"
                value={form.primaryColor || '#0B7A2B'}
                onChange={(e) => set('primaryColor', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">Secondary color</span>
              <input
                type="color"
                className="mt-1 w-full h-10 border border-gray-300 rounded-lg px-1 dark:border-gray-600"
                value={form.secondaryColor || '#5C0F00'}
                onChange={(e) => set('secondaryColor', e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-gray-500 dark:text-gray-400">Address</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">Phone</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">Email</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">Website</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">Physical location</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
                value={form.physicalLocation}
                onChange={(e) => set('physicalLocation', e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-gray-500 dark:text-gray-400">Google Maps URL</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
                value={form.googleMapsUrl}
                onChange={(e) => set('googleMapsUrl', e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-gray-500 dark:text-gray-400">About</span>
              <textarea
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
                rows={4}
                value={form.about}
                onChange={(e) => set('about', e.target.value)}
              />
            </label>
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Save Settings
          </button>
        </form>
      </div>
    </PortalLayout>
  );
}
