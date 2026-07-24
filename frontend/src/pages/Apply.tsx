import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

interface Program {
  id: string;
  name: string;
  level: string | null;
  entryRequirements: string | null;
  examBody: string | null;
  isShortCourse: boolean;
  currentFee: number | null;
}

interface Department {
  id: string;
  name: string;
  programs: Program[];
}

export default function Apply() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programId, setProgramId] = useState(searchParams.get('program') || '');
  const [applicantName, setApplicantName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [intake, setIntake] = useState('September 2026');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedApp, setSubmittedApp] = useState<{ id: string } | null>(null);

  // Payment submission (M-Pesa transaction code)
  const [payAmount, setPayAmount] = useState('');
  const [payReference, setPayReference] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState(false);

  const selectedProgram = departments
    .flatMap((d) => d.programs)
    .find((p) => p.id === programId);

  useEffect(() => {
    api('/programs').then(setDepartments).catch(() => setError('Could not load programs'));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!programId) {
      setError('Please choose a program');
      return;
    }
    setSubmitting(true);
    try {
      const app = await api('/applications', {
        method: 'POST',
        body: { applicantName, email, phone, idNumber, programId, intake },
      });
      setSubmittedApp(app);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit application');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!submittedApp) return;
    setPayError(null);
    setPaySubmitting(true);
    try {
      await api(`/applications/${submittedApp.id}/payments`, {
        method: 'POST',
        body: { email, amount: payAmount, reference: payReference },
      });
      setPaySuccess(true);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Could not submit payment');
    } finally {
      setPaySubmitting(false);
    }
  }

  if (submittedApp) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-6">
          <h1 className="text-lg font-bold text-rgreen mb-2 text-center">Application submitted</h1>
          <p className="text-sm text-gray-600 text-center">
            Thank you, {applicantName}. Your application is awaiting review by the Registrar's
            office. You'll be contacted at <span className="font-medium">{email}</span> once a
            decision is made.
          </p>

          {selectedProgram?.currentFee && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              {paySuccess ? (
                <p className="text-sm text-green-700 text-center">
                  ✔ Payment submitted. The Registrar will verify it and confirm your admission.
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium text-center mb-1">
                    Fee for this program: KES {Number(selectedProgram.currentFee).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 text-center mb-3">
                    Already paid via M-Pesa to <strong>Paybill 247247</strong>, Account{' '}
                    <strong>0190274872116</strong>? Submit your transaction code below so the
                    Registrar can verify it.
                  </p>
                  <form onSubmit={handleSubmitPayment} className="space-y-2">
                    <input
                      type="number"
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="Amount paid (KES)"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                    <input
                      required
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                      placeholder="M-Pesa transaction code (e.g. QGH7XXXX)"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                    {payError && <p className="text-xs text-rmaroon">{payError}</p>}
                    <button
                      type="submit"
                      disabled={paySubmitting}
                      className="w-full bg-rgreen text-white rounded-md py-2 text-sm font-medium disabled:opacity-60"
                    >
                      {paySubmitting ? 'Submitting…' : 'Submit payment for verification'}
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

          <button onClick={() => navigate('/')} className="mt-4 text-sm text-rgreen underline block mx-auto">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-lg font-bold text-rgreen mb-1">Apply to Runyenjes</h1>
        <p className="text-sm text-gray-500 mb-6">
          Fill this in to apply — no account needed yet.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input
              required
              value={applicantName}
              onChange={(e) => setApplicantName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="07XXXXXXXX"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              National ID / Birth Certificate No.
            </label>
            <input
              required
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Program</label>
            <select
              required
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="">Select a program…</option>
              {departments.map((dept) => (
                <optgroup key={dept.id} label={dept.name}>
                  {dept.programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.level ? ` — ${p.level}` : ' (Short course)'}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {selectedProgram?.currentFee && (
              <p className="text-xs text-gray-500 mt-1">
                Fee: KES {Number(selectedProgram.currentFee).toLocaleString()}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Intake</label>
            <select
              value={intake}
              onChange={(e) => setIntake(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option>January 2027</option>
              <option>May 2027</option>
              <option>September 2026</option>
            </select>
          </div>

          {error && <p className="text-sm text-rmaroon">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-rgreen text-white rounded-md py-2 text-sm font-medium disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>
        </form>

        <button onClick={() => navigate('/')} className="w-full text-center text-sm text-gray-500 mt-4 underline">
          Back to Home
        </button>
      </div>
    </div>
  );
}
