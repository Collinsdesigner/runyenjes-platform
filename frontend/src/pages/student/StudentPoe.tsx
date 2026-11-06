// POE_STUDENT_PAGE_V1
import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Media { id: string; kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT'; url: string; fileName?: string | null; thumbnailUrl?: string | null }
interface Entry {
  id: string; title: string; description?: string | null; performedOn: string; status: string;
  assessorFeedback?: string | null; unit: { id: string; name: string }; media: Media[];
}
interface UnitOpt { id: string; name: string }

const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_DOC = 10 * 1024 * 1024;
const DOC_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
const fileExt = (n: string) => (n.split('.').pop() || '').toLowerCase();
const MAX_VIDEO = 50 * 1024 * 1024;
const MAX_SECONDS = 180;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft (not submitted)',
  SUBMITTED: 'Submitted, waiting for your teacher',
  COMPETENT: 'Competent',
  NOT_YET_COMPETENT: 'Not yet competent',
  RESUBMIT_REQUESTED: 'Resubmit requested',
};

function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(src);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the photo'))), 'image/jpeg', 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('This photo format is not supported. Try a JPG or PNG photo.')); };
    img.src = src;
  });
}

function videoSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    const src = URL.createObjectURL(file);
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(src); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(src); reject(new Error('Could not read the video')); };
    v.src = src;
  });
}

export default function StudentPoe() {
  const { token } = useAuth();
  const [units, setUnits] = useState<UnitOpt[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [entryMsg, setEntryMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  const [unitId, setUnitId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [performedOn, setPerformedOn] = useState(new Date().toISOString().slice(0, 10));
  const [files, setFiles] = useState<File[]>([]);

  async function load() {
    if (!token) return;
    try {
      const [u, e] = await Promise.all([api('/poe/my/units', { token }), api('/poe/my', { token })]);
      setUnits(u.units);
      setEntries(e.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your portfolio');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  async function uploadAndAttach(entryId: string, file: File) {
    const isVideo = file.type.startsWith('video/');
    const isDoc = !isVideo && !file.type.startsWith('image/');
    let blob: Blob = file;
    let seconds: number | undefined;
    if (isDoc) {
      if (!DOC_EXT.includes(fileExt(file.name))) throw new Error(`${file.name}: allowed documents are PDF, Word, Excel, PowerPoint or text`);
      if (file.size > MAX_DOC) throw new Error(`${file.name}: document is larger than 10 MB`);
    } else if (isVideo) {
      if (file.size > MAX_VIDEO) throw new Error(`${file.name}: video is larger than 50 MB`);
      const d = await videoSeconds(file);
      if (d > MAX_SECONDS) throw new Error(`${file.name}: video is longer than 3 minutes`);
    } else {
      blob = await compressImage(file);
      if (blob.size > MAX_IMAGE) throw new Error(`${file.name}: photo is still larger than 5 MB`);
    }
    const sig = await api('/poe/upload-signature', { method: 'POST', token, body: { kind: isVideo ? 'VIDEO' : isDoc ? 'DOCUMENT' : 'IMAGE' } });
    const form = new FormData();
    form.append('file', blob, isVideo || isDoc ? file.name : 'photo.jpg');
    form.append('api_key', sig.apiKey);
    form.append('timestamp', String(sig.timestamp));
    form.append('folder', sig.folder);
    form.append('signature', sig.signature);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/${sig.resourceType}/upload`, { method: 'POST', body: form });
    const up = await res.json();
    if (!res.ok) throw new Error(up?.error?.message || 'Upload failed');
    if (isVideo) seconds = Math.max(1, Math.ceil(up.duration || 1));
    await api(`/poe/entries/${entryId}/media`, {
      method: 'POST', token,
      body: {
        kind: isVideo ? 'VIDEO' : isDoc ? 'DOCUMENT' : 'IMAGE',
        fileName: isDoc ? file.name : undefined,
        publicId: up.public_id,
        url: up.secure_url,
        thumbnailUrl: isVideo ? String(up.secure_url).replace(/\.[^./]+$/, '.jpg') : undefined,
        bytes: up.bytes,
        durationSeconds: seconds,
      },
    });
  }

  async function addFiles(entryId: string, list: File[]) {
    for (let i = 0; i < list.length; i++) {
      setBusy(`Uploading file ${i + 1} of ${list.length}...`);
      await uploadAndAttach(entryId, list[i]);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setMessage('');
    if (!unitId || title.trim().length < 3) { setError('Choose a unit and enter a title (at least 3 characters)'); return; }
    if (files.length === 0) { setError('Add at least one photo or video'); return; }
    let entryId = '';
    try {
      setBusy('Saving...');
      const entry = await api('/poe/entries', { method: 'POST', token, body: { unitId, title, description: description || undefined, performedOn } });
      entryId = entry.id;
      await addFiles(entryId, files);
      setBusy('Submitting...');
      await api(`/poe/entries/${entryId}/submit`, { method: 'POST', token });
      setMessage('Evidence submitted. Your teacher will mark it.');
      setTitle(''); setDescription(''); setFiles([]);
    } catch (err) {
      setError((err instanceof Error ? err.message : 'Something went wrong') + (entryId ? ' The entry is saved as a draft below: you can add files and submit it.' : ''));
    } finally {
      setBusy('');
      load();
    }
  }

  async function handleAdd(entryId: string, list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(''); setMessage('');
    try { await addFiles(entryId, Array.from(list)); } catch (err) { setEntryMsg({ id: entryId, text: err instanceof Error ? err.message : 'Upload failed', ok: false }); }
    setBusy(''); load();
  }

  async function handleSubmit(entryId: string) {
    setError(''); setMessage('');
    try { await api(`/poe/entries/${entryId}/submit`, { method: 'POST', token }); setEntryMsg({ id: entryId, text: 'Evidence submitted.', ok: true }); }
    catch (err) { setEntryMsg({ id: entryId, text: err instanceof Error ? err.message : 'Could not submit', ok: false }); }
    load();
  }

  async function handleDelete(entryId: string) {
    if (!window.confirm('Delete this entry and its files?')) return;
    try { await api(`/poe/entries/${entryId}`, { method: 'DELETE', token }); } catch (err) { setEntryMsg({ id: entryId, text: err instanceof Error ? err.message : 'Could not delete', ok: false }); }
    load();
  }

  const input = 'border border-gray-300 rounded-lg px-3 py-2 text-sm w-full dark:border-gray-600';

  return (
    <PortalLayout title="My POE">
      <div className="space-y-6 max-w-3xl">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Portfolio of Evidence</h2>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Record a task you performed with photos or one short video (up to 3 minutes). Your teacher marks it.</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">{error}</div>}
        {message && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm dark:bg-green-950 dark:border-green-800 dark:text-green-300">{message}</div>}
        {busy && <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-lg p-3 text-sm dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300">{busy} Please keep this page open.</div>}

        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 dark:bg-gray-900 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Add evidence</h3>
          <select className={input} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">Select unit</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {!loading && units.length === 0 && <p className="text-xs text-gray-500">You are not registered for any unit yet.</p>}
          <input className={input} placeholder="Title (what task did you perform?)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className={input} rows={3} placeholder="Short description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <label className="block text-xs text-gray-500">Date performed
            <input type="date" className={input} value={performedOn} onChange={(e) => setPerformedOn(e.target.value)} />
          </label>
          <label className="block text-xs text-gray-500">Photos, one short video or documents (PDF, Word, Excel, PowerPoint, text)
            <input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" multiple className="block w-full text-sm mt-1"
              onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          </label>
          {files.length > 0 && <p className="text-xs text-gray-500">{files.length} file(s) chosen</p>}
          <button type="submit" disabled={!!busy} className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">Save and submit</button>
        </form>

        <div className="space-y-3">
          {loading && <p className="text-sm text-gray-400">Loading...</p>}
          {!loading && entries.length === 0 && <p className="text-sm text-gray-400">No evidence yet.</p>}
          {entries.map((en) => {
            const editable = en.status === 'DRAFT' || en.status === 'RESUBMIT_REQUESTED';
            return (
              <div key={en.id} className="bg-white border border-gray-200 rounded-lg p-4 space-y-2 dark:bg-gray-900 dark:border-gray-700">
                <div className="flex justify-between gap-2">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{en.title}</div>
                    <div className="text-xs text-gray-500">{en.unit.name} - {new Date(en.performedOn).toLocaleDateString()}</div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 h-fit">{STATUS_LABEL[en.status] || en.status}</span>
                </div>
                {entryMsg && entryMsg.id === en.id && <p className={'text-sm ' + (entryMsg.ok ? 'text-green-700' : 'text-red-600')}>{entryMsg.text}</p>}
                {en.description && <p className="text-sm text-gray-600 dark:text-gray-300">{en.description}</p>}
                {en.assessorFeedback && <p className="text-sm bg-yellow-50 border border-yellow-200 rounded p-2 dark:bg-yellow-950 dark:border-yellow-800">Teacher feedback: {en.assessorFeedback}</p>}
                <div className="flex flex-wrap gap-2">
                  {en.media.map((m) => m.kind === 'IMAGE'
                    ? <a key={m.id} href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt="" className="h-20 w-20 object-cover rounded" /></a>
                    : m.kind === 'DOCUMENT'
                      ? <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="h-20 w-32 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs text-center p-1 break-all">{m.fileName || 'Document'}</a>
                      : <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="h-20 w-20 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs">Video</a>)}
                </div>
                {en.status === 'SUBMITTED' && (
                  <div className="pt-1"><button className="text-xs text-red-600" onClick={() => handleDelete(en.id)}>Withdraw and delete</button></div>
                )}
                {editable && (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <label className="text-xs text-rgreen font-medium cursor-pointer">
                      Add files
                      <input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" multiple className="hidden" onChange={(e) => handleAdd(en.id, e.target.files)} />
                    </label>
                    <button className="text-xs text-rgreen font-medium" onClick={() => handleSubmit(en.id)}>Submit</button>
                    <button className="text-xs text-red-600" onClick={() => handleDelete(en.id)}>Delete</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </PortalLayout>
  );
}
