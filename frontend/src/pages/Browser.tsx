import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

interface Program {
  id: string;
  name: string;
  level: string | null;
}
interface Department {
  id: string;
  name: string;
  programs: Program[];
}
interface Unit {
  id: string;
  name: string;
}

export default function Browser() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [addressInput, setAddressInput] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [loadFailed, setLoadFailed] = useState(false);

  // Save-to-Library
  const [showSave, setShowSave] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [saveProgramId, setSaveProgramId] = useState('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [saveUnitId, setSaveUnitId] = useState('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      api('/programs').then(setDepartments).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (saveProgramId && token) {
      api(`/library/programs/${saveProgramId}/units`, { token })
        .then((u) => setUnits(u.map((unit: any) => ({ id: unit.id, name: unit.name }))))
        .catch(() => setUnits([]));
    } else {
      setUnits([]);
    }
    setSaveUnitId('');
  }, [saveProgramId]);

  function normalizeUrl(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    // Looks like a domain (has a dot, no spaces) -> treat as URL, else search
    if (/^[\w-]+(\.[\w-]+)+/.test(trimmed) && !trimmed.includes(' ')) {
      return `https://${trimmed}`;
    }
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  function navigateTo(raw: string) {
    const url = normalizeUrl(raw);
    if (!url) return;
    setLoadFailed(false);
    setCurrentUrl(url);
    setAddressInput(url);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(url);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }

  function goBack() {
    if (historyIndex > 0) {
      const idx = historyIndex - 1;
      setHistoryIndex(idx);
      setCurrentUrl(history[idx]);
      setAddressInput(history[idx]);
      setLoadFailed(false);
    }
  }

  function goForward() {
    if (historyIndex < history.length - 1) {
      const idx = historyIndex + 1;
      setHistoryIndex(idx);
      setCurrentUrl(history[idx]);
      setAddressInput(history[idx]);
      setLoadFailed(false);
    }
  }

  function refresh() {
    if (!currentUrl) return;
    setLoadFailed(false);
    // Force iframe remount to reload
    setCurrentUrl('');
    setTimeout(() => setCurrentUrl(history[historyIndex]), 30);
  }

  async function handleSaveToLibrary() {
    if (!saveUnitId || !currentUrl) return;
    setSaveStatus(null);
    try {
      await api(`/library/units/${saveUnitId}/materials`, {
        method: 'POST',
        body: { fileUrl: currentUrl, type: 'external-link' },
        token,
      });
      setSaveStatus('✔ Saved to Library');
    } catch (err) {
      setSaveStatus(err instanceof Error ? err.message : 'Could not save');
    }
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Single slim row: home link + navigation controls + address bar, no separate title header */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center gap-2 shrink-0">
        <button
          onClick={() => navigate('/')}
          className="text-sm text-gray-500 underline whitespace-nowrap"
          title="Back to Home"
        >
          ← Home
        </button>
        <div className="w-px h-5 bg-gray-200" />
        <button
          onClick={goBack}
          disabled={historyIndex <= 0}
          className="text-gray-500 disabled:text-gray-300 px-1"
          title="Back"
        >
          ←
        </button>
        <button
          onClick={goForward}
          disabled={historyIndex >= history.length - 1}
          className="text-gray-500 disabled:text-gray-300 px-1"
          title="Forward"
        >
          →
        </button>
        <button onClick={refresh} disabled={!currentUrl} className="text-gray-500 disabled:text-gray-300 px-1" title="Refresh">
          ⟳
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigateTo(addressInput);
          }}
          className="flex-1 flex gap-2"
        >
          <input
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Search or type a web address…"
            className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm"
          />
          <button type="submit" className="bg-rgreen text-white text-sm px-3 py-1.5 rounded-md">
            Go
          </button>
        </form>
        {currentUrl && (
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 underline whitespace-nowrap"
          >
            New tab
          </a>
        )}
        {user && currentUrl && (
          <button
            onClick={() => setShowSave((s) => !s)}
            className="text-xs bg-rmaroon text-white px-2 py-1.5 rounded-md whitespace-nowrap"
          >
            Save
          </button>
        )}
      </div>

      {/* Save-to-Library panel */}
      {showSave && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={saveProgramId}
            onChange={(e) => setSaveProgramId(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white"
          >
            <option value="">Choose a class…</option>
            {departments.map((dept) => (
              <optgroup key={dept.id} label={dept.name}>
                {dept.programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.level ? ` — ${p.level}` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            value={saveUnitId}
            onChange={(e) => setSaveUnitId(e.target.value)}
            disabled={!saveProgramId}
            className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white disabled:opacity-50"
          >
            <option value="">Choose a unit…</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleSaveToLibrary}
            disabled={!saveUnitId}
            className="text-xs bg-rgreen text-white px-3 py-1 rounded-md disabled:opacity-50"
          >
            Save this page
          </button>
          {saveStatus && <span className="text-xs text-gray-700">{saveStatus}</span>}
        </div>
      )}

      {/* The actual browser frame — takes up all remaining height */}
      <div className="flex-1 relative bg-white min-h-0">
        {!currentUrl ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400 p-8 text-center">
            Type a search term or web address above to get started.
            <br />
            <span className="text-xs">
              Note: some sites (Google, Facebook, banking sites, etc.) don't allow themselves to be
              shown inside another app — use "New tab" for those.
            </span>
          </div>
        ) : (
          <iframe
            key={currentUrl}
            src={currentUrl}
            className="w-full h-full border-0 block"
            title="In-app browser"
            onError={() => setLoadFailed(true)}
          />
        )}
      </div>
    </div>
  );
}
