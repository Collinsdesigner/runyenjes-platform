// POE_TEACHER_PAGE_V2
import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Media { id: string; kind: 'IMAGE' | 'VIDEO'; url: string }
interface Entry {
  id: string; title: string; description?: string | null; performedOn: string; status?: string;
  assessedAt?: string | null; assessorFeedback?: string | null;
  unit: { id: string; name: string }; student: { id: string; name: string; admissionNumber?: string | null }; media: Media[];
}

const STATUS_LABEL: Record<string, string> = {
  COMPETENT: 'Competent',
  NOT_YET_COMPETENT: 'Not yet competent',
  RESUBMIT_REQUESTED: 'Resubmit requested',
  SUBMITTED: 'Waiting for marking',
};

export default function TeacherPoe() {
  const { token } = useAuth();
  const [tab, setTab] = useState<'waiting' | 'marked'>('waiting');
  const [waiting, setWaiting] = useState<Entry[]>([]);
  const [marked, setMarked] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    if (!token) return;
    try {
      const [p, m] = await Promise.all([api('/poe/pending', { token }), api('/poe/marked', { token })]);
      setWaiting(p.entries);
      setMarked(m.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load submissions');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  async function decide(decision: 'COMPETENT' | 'NOT_YET_COMPETENT' | 'RESUBMIT_REQUESTED') {
    if (!selected) return;
    setError(''); setMessage('');
    if (decision !== 'COMPETENT' && !feedback.trim()) { setError('Please write feedback for the student'); return; }
    setBusy(true);
    try {
      await api(`/poe/entries/${selected.id}/assess`, { method: 'POST', token, body: { decision, feedback: feedback.trim() || undefined } });
      setMessage('Saved. The student has been notified.');
      setSelected(null); setFeedback('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
      load();
    }
  }

  const readOnly = tab === 'marked';
  const list = readOnly ? marked : waiting;
  const tabClass = (t: string) => 'px-4 py-2 text-sm font-medium rounded-lg ' + (tab === t ? 'bg-rgreen text-white' : 'border border-gray-300 dark:border-gray-600');

  return (
    <PortalLayout title="POE Marking">
      <div className="space-y-6 max-w-3xl">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">POE Marking</h2>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Evidence submitted by students in your units. Review it and mark Competent or Not yet competent.</p>
        </div>
        <div className="flex gap-2">
          <button className={tabClass('waiting')} onClick={() => { setTab('waiting'); setSelected(null); setFeedback(''); }}>Waiting ({waiting.length})</button>
          <button className={tabClass('marked')} onClick={() => { setTab('marked'); setSelected(null); setFeedback(''); }}>Marked ({marked.length})</button>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">{error}</div>}
        {message && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm dark:bg-green-950 dark:border-green-800 dark:text-green-300">{message}</div>}

        {selected ? (
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 dark:bg-gray-900 dark:border-gray-700">
            <button className="text-xs text-gray-500" onClick={() => { setSelected(null); setFeedback(''); }}>Back to the list</button>
            <div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">{selected.title}</div>
              <div className="text-xs text-gray-500">{selected.student.name}{selected.student.admissionNumber ? ` (${selected.student.admissionNumber})` : ''} - {selected.unit.name} - performed {new Date(selected.performedOn).toLocaleDateString()}</div>
            </div>
            {selected.description && <p className="text-sm text-gray-700 dark:text-gray-300">{selected.description}</p>}
            <div className="space-y-3">
              {selected.media.map((m) => m.kind === 'IMAGE'
                ? <a key={m.id} href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt="" className="max-h-80 rounded" /></a>
                : <video key={m.id} src={m.url} controls className="max-h-80 w-full rounded" />)}
            </div>
            {readOnly ? (
              <div className="text-sm space-y-1">
                <div><span className="font-medium">Decision:</span> {STATUS_LABEL[selected.status || ''] || selected.status}</div>
                {selected.assessedAt && <div className="text-xs text-gray-500">Marked on {new Date(selected.assessedAt).toLocaleString()}</div>}
                {selected.assessorFeedback && <p className="bg-yellow-50 border border-yellow-200 rounded p-2 dark:bg-yellow-950 dark:border-yellow-800">Your feedback: {selected.assessorFeedback}</p>}
              </div>
            ) : (
              <>
                <textarea className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full dark:border-gray-600" rows={3}
                  placeholder="Feedback for the student (required unless Competent)" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy} onClick={() => decide('COMPETENT')} className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">Competent</button>
                  <button disabled={busy} onClick={() => decide('NOT_YET_COMPETENT')} className="bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">Not yet competent</button>
                  <button disabled={busy} onClick={() => decide('RESUBMIT_REQUESTED')} className="border border-gray-300 text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 dark:border-gray-600">Ask to resubmit</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {loading && <p className="text-sm text-gray-400">Loading...</p>}
            {!loading && list.length === 0 && <p className="text-sm text-gray-400">{readOnly ? 'You have not marked anything yet.' : 'Nothing is waiting for marking.'}</p>}
            {list.map((en) => (
              <button key={en.id} onClick={() => { setSelected(en); setMessage(''); setError(''); }}
                className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 dark:bg-gray-900 dark:border-gray-700">
                <div className="flex justify-between gap-2">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{en.title}</div>
                  {readOnly && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 h-fit">{STATUS_LABEL[en.status || ''] || en.status}</span>}
                </div>
                <div className="text-xs text-gray-500">{en.student.name} - {en.unit.name} - {en.media.length} file(s){readOnly && en.assessedAt ? ` - marked ${new Date(en.assessedAt).toLocaleDateString()}` : ''}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
