import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface UnitOption {
  unitId: string;
  unitName: string;
}

export default function TeacherContentGenerator() {
  const { token } = useAuth();

  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitId, setUnitId] = useState('');
  const [contentType, setContentType] = useState<'material' | 'assignment'>('material');
  const [topic, setTopic] = useState('');

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  const [materialResult, setMaterialResult] = useState('');
  const [assignmentResult, setAssignmentResult] = useState<{ title: string; description: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    api('/teacher/units', { token })
      .then((data) => setUnits(data.units.map((u: any) => ({ unitId: u.unitId, unitName: u.unitName }))))
      .catch(() => {});
  }, [token]);

  async function handleGenerate() {
    if (!unitId || !topic.trim()) {
      setError('Select a unit and enter a topic first');
      return;
    }
    setGenerating(true);
    setError('');
    setMaterialResult('');
    setAssignmentResult(null);
    try {
      const data = await api('/ai/generate-content', {
        method: 'POST',
        token,
        body: { unitId, contentType, topic: topic.trim() },
      });
      if (contentType === 'material') {
        setMaterialResult(data.content);
      } else {
        setAssignmentResult({ title: data.title, description: data.description });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate content');
    } finally {
      setGenerating(false);
    }
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopyMessage('Copied to clipboard');
      setTimeout(() => setCopyMessage(''), 2000);
    });
  }

  return (
    <PortalLayout title="AI Content Generator">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">AI Content Generator</h2>
          <p className="text-sm text-gray-500 mt-1">
            Draft lecture material or an assignment brief for one of your units. Review and copy the result to use wherever you need it.
          </p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select unit</option>
            {units.map((u) => (
              <option key={u.unitId} value={u.unitId}>{u.unitName}</option>
            ))}
          </select>

          <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
            <button
              type="button"
              onClick={() => setContentType('material')}
              className={`px-3 py-1.5 text-sm rounded-md ${contentType === 'material' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
            >
              Learning Material
            </button>
            <button
              type="button"
              onClick={() => setContentType('assignment')}
              className={`px-3 py-1.5 text-sm rounded-md ${contentType === 'assignment' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
            >
              Assignment Brief
            </button>
          </div>

          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder='Topic (e.g. "Introduction to Newtons Second Law")'
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>

        {copyMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-2 text-xs">{copyMessage}</div>
        )}

        {materialResult && (
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Draft Material</h3>
              <button type="button" onClick={() => copyText(materialResult)} className="text-xs font-medium text-rgreen">
                Copy
              </button>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{materialResult}</p>
          </div>
        )}

        {assignmentResult && (
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Draft Assignment</h3>
              <button
                type="button"
                onClick={() => copyText(`${assignmentResult.title}\n\n${assignmentResult.description}`)}
                className="text-xs font-medium text-rgreen"
              >
                Copy Both
              </button>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Title</div>
              <p className="text-sm font-medium text-gray-900">{assignmentResult.title}</p>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Description</div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{assignmentResult.description}</p>
            </div>
            <p className="text-xs text-gray-400">
              Copy this into the Assignments tab to actually create it for students.
            </p>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
