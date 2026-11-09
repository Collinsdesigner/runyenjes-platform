// POE_ADMIN_PAGE_V1
import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Media { id: string; kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT'; url: string; fileName?: string | null }
interface Entry {
  id: string; title: string; description?: string | null; performedOn: string; status: string;
  assessedAt?: string | null; assessorFeedback?: string | null; assessedBy?: { name: string } | null;
  unit: { id: string; name: string }; student: { id: string; name: string; admissionNumber?: string | null }; media: Media[];
}
interface Programme { id: string; name: string; level?: string | null }
interface UnitOpt { id: string; name: string; programId: string }

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', SUBMITTED: 'Waiting for marking', COMPETENT: 'Competent',
  NOT_YET_COMPETENT: 'Not yet competent', RESUBMIT_REQUESTED: 'Resubmit requested',
};

export default function PoeStudents() {
  const { token } = useAuth();
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [units, setUnits] = useState<UnitOpt[]>([]);
  const [programId, setProgramId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api('/poe/admin/filters', { token })
      .then((d) => { setProgrammes(d.programmes); setUnits(d.units); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load filters'));
  }, [token]);

  async function load() {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (programId) params.set('programId', programId);
      if (unitId) params.set('unitId', unitId);
      if (status) params.set('status', status);
      if (q.trim()) params.set('q', q.trim());
      const d = await api(`/poe/admin/entries?${params.toString()}`, { token });
      setEntries(d.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load entries');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token, programId, unitId, status]);

  async function downloadPdf(student: Entry['student']) {
    setPdfBusy(true); setError('');
    try {
      const res = await fetch(`${API_URL}/poe/admin/student/${student.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Could not create the PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio-${student.admissionNumber || student.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the PDF');
    } finally {
      setPdfBusy(false);
    }
  }

  const input = 'border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600';
  const unitOptions = programId ? units.filter((u) => u.programId === programId) : units;

  return (
    <PortalLayout title="Student POE">
      <div className="space-y-6 max-w-4xl">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Student POE</h2>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Read-only view of students' Portfolio of Evidence. Download a student's portfolio as a PDF.</p>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">{error}</div>}

        {selected ? (
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 dark:bg-gray-900 dark:border-gray-700">
            <button className="text-xs text-gray-500" onClick={() => setSelected(null)}>Back to the list</button>
            <div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">{selected.title}</div>
              <div className="text-xs text-gray-500">{selected.student.name}{selected.student.admissionNumber ? ` (${selected.student.admissionNumber})` : ''} - {selected.unit.name} - performed {new Date(selected.performedOn).toLocaleDateString()}</div>
            </div>
            <div className="text-sm"><span className="font-medium">Status:</span> {STATUS_LABEL[selected.status] || selected.status}</div>
            {selected.description && <p className="text-sm text-gray-700 dark:text-gray-300">{selected.description}</p>}
            <div className="space-y-3">
              {selected.media.map((m) => m.kind === 'IMAGE'
                ? <a key={m.id} href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt="" className="max-h-80 rounded" /></a>
                : m.kind === 'DOCUMENT'
                  ? <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="block border border-gray-300 rounded-lg p-3 text-sm text-rgreen dark:border-gray-600">Open document: {m.fileName || 'file'}</a>
                  : <video key={m.id} src={m.url} controls className="max-h-80 w-full rounded" />)}
            </div>
            {selected.assessedAt && (
              <div className="text-sm">
                <div className="text-xs text-gray-500">Marked by {selected.assessedBy?.name || '-'} on {new Date(selected.assessedAt).toLocaleDateString()}</div>
                {selected.assessorFeedback && <p className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-1 dark:bg-yellow-950 dark:border-yellow-800">Feedback: {selected.assessorFeedback}</p>}
              </div>
            )}
            <button disabled={pdfBusy} onClick={() => downloadPdf(selected.student)} className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
              {pdfBusy ? 'Preparing PDF...' : 'Download portfolio PDF'}
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <select className={input} value={programId} onChange={(e) => { setProgramId(e.target.value); setUnitId(''); }}>
                <option value="">All programmes</option>
                {programmes.map((p) => <option key={p.id} value={p.id}>{p.name}{p.level ? ` - ${/^\d+$/.test(p.level) ? 'Level ' : ''}${p.level}` : ''}</option>)}
              </select>
              <select className={input} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">All units</option>
                {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {Object.keys(STATUS_LABEL).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
              </select>
              <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2">
                <input className={input} placeholder="Student name or admission #" value={q} onChange={(e) => setQ(e.target.value)} />
                <button type="submit" className="border border-gray-300 text-sm px-3 rounded-lg dark:border-gray-600">Search</button>
              </form>
            </div>
            <div className="space-y-3">
              {loading && <p className="text-sm text-gray-400">Loading...</p>}
              {!loading && entries.length === 0 && <p className="text-sm text-gray-400">No evidence found.</p>}
              {entries.map((en) => (
                <button key={en.id} onClick={() => setSelected(en)} className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 dark:bg-gray-900 dark:border-gray-700">
                  <div className="flex justify-between gap-2">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{en.title}</div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 h-fit">{STATUS_LABEL[en.status] || en.status}</span>
                  </div>
                  <div className="text-xs text-gray-500">{en.student.name}{en.student.admissionNumber ? ` (${en.student.admissionNumber})` : ''} - {en.unit.name} - {en.media.length} file(s)</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
