// RUNYENJES-SETUP-V1
import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { clearModulesCache } from '../../hooks/useModules';

interface ModuleRow {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  url: string;
}

type Audience = 'staff' | 'everyone' | 'admins';

interface SystemRow {
  name: string;
  url: string;
  audience: Audience;
}

const inputCls =
  'mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';
const primaryBtn = 'bg-rgreen text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50';
const secondaryBtn =
  'border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium dark:border-gray-600 dark:text-gray-200 disabled:opacity-50';

export default function AdminModules() {
  const { token } = useAuth();
  const [mods, setMods] = useState<ModuleRow[]>([]);
  const [systems, setSystems] = useState<SystemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    if (!token) return;
    try {
      const [m, s] = await Promise.all([
        api('/admin/modules', { token }),
        api('/admin/external-systems', { token }),
      ]);
      setMods(m.modules);
      setSystems(s.systems);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [token]);

  function setOwn(key: string, own: boolean) {
    setMods((prev) =>
      prev.map((m) => {
        if (m.key === key) return { ...m, enabled: !own };
        // Procurement works with Stores, so it follows Stores when Stores is switched off.
        if (key === 'stores' && own && m.key === 'procurement') return { ...m, enabled: false };
        return m;
      })
    );
  }

  function setUrl(key: string, url: string) {
    setMods((prev) => prev.map((m) => (m.key === key ? { ...m, url } : m)));
  }

  function finishSave(text: string) {
    clearModulesCache();
    setMessage(text + ' Reloading...');
    setTimeout(() => window.location.reload(), 700);
  }

  async function saveModules() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/admin/modules', {
        method: 'PUT',
        token,
        body: { modules: mods.map((m) => ({ key: m.key, enabled: m.enabled, url: m.url })) },
      });
      finishSave('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function saveSystems() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/admin/external-systems', {
        method: 'PUT',
        token,
        body: { systems: systems.filter((s) => s.name.trim() || s.url.trim()) },
      });
      finishSave('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  const storesOwn = mods.find((m) => m.key === 'stores')?.enabled === false;

  return (
    <PortalLayout title="Modules and Systems">
      <div className="space-y-8 max-w-3xl">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Modules and Systems</h2>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            If your institution already runs an area on another system, switch ours off so there is no
            duplicate. Nothing is deleted: switching it back on restores everything.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">
            {error}
          </div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm dark:bg-green-950 dark:border-green-800 dark:text-green-300">
            {message}
          </div>
        )}
        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        {!loading && (
          <section className="space-y-3">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Areas</h3>
            {mods.map((m) => {
              const own = !m.enabled;
              const locked = m.key === 'procurement' && storesOwn;
              return (
                <div
                  key={m.key}
                  className="bg-white border border-gray-200 rounded-lg p-4 dark:bg-gray-900 dark:border-gray-700"
                >
                  <p className="font-medium text-gray-900 dark:text-gray-100">{m.label}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{m.description}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      disabled={locked}
                      className={!own ? primaryBtn : secondaryBtn}
                      onClick={() => setOwn(m.key, false)}
                    >
                      Use this platform's
                    </button>
                    <button
                      type="button"
                      className={own ? primaryBtn : secondaryBtn}
                      onClick={() => setOwn(m.key, true)}
                    >
                      We use our own system
                    </button>
                  </div>
                  {locked && (
                    <p className="text-sm text-gray-500 mt-2 dark:text-gray-400">
                      Procurement works with Stores, so it stays off while Stores is off.
                    </p>
                  )}
                  {own && (
                    <label className="block text-sm text-gray-600 mt-3 dark:text-gray-300">
                      Address of that system (optional)
                      <input
                        className={inputCls}
                        placeholder="https://"
                        value={m.url}
                        onChange={(e) => setUrl(m.key, e.target.value)}
                      />
                    </label>
                  )}
                </div>
              );
            })}
            <button type="button" className={primaryBtn} disabled={busy} onClick={saveModules}>
              Save areas
            </button>
          </section>
        )}

        {!loading && (
          <section className="space-y-3">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Other systems</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Any other system people should be able to open from here. It appears as a link card and
              opens in a new tab. This platform never reads or writes that system's data. Use https
              addresses and keep a login in front of anything that holds records.
            </p>
            {systems.map((s, i) => (
              <div
                key={i}
                className="bg-white border border-gray-200 rounded-lg p-4 grid gap-2 sm:grid-cols-2 dark:bg-gray-900 dark:border-gray-700"
              >
                <label className="block text-sm text-gray-600 dark:text-gray-300">
                  Name
                  <input
                    className={inputCls}
                    value={s.name}
                    onChange={(e) =>
                      setSystems((prev) => prev.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))
                    }
                  />
                </label>
                <label className="block text-sm text-gray-600 dark:text-gray-300">
                  Web address
                  <input
                    className={inputCls}
                    placeholder="https://"
                    value={s.url}
                    onChange={(e) =>
                      setSystems((prev) => prev.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))
                    }
                  />
                </label>
                <label className="block text-sm text-gray-600 dark:text-gray-300">
                  Who can see it
                  <select
                    className={inputCls}
                    value={s.audience}
                    onChange={(e) =>
                      setSystems((prev) =>
                        prev.map((x, k) => (k === i ? { ...x, audience: e.target.value as Audience } : x))
                      )
                    }
                  >
                    <option value="staff">Staff only (recommended)</option>
                    <option value="admins">Administrators only</option>
                    <option value="everyone">Everyone, including students</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    className={secondaryBtn}
                    onClick={() => setSystems((prev) => prev.filter((_, k) => k !== i))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <button
                type="button"
                className={secondaryBtn}
                disabled={systems.length >= 20}
                onClick={() => setSystems((prev) => [...prev, { name: '', url: '', audience: 'staff' }])}
              >
                Add a system
              </button>
              <button type="button" className={primaryBtn} disabled={busy} onClick={saveSystems}>
                Save systems
              </button>
            </div>
          </section>
        )}
      </div>
    </PortalLayout>
  );
}
