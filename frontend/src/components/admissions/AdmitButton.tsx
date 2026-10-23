// RUNYENJES-SETUP-V1
import { useState } from 'react';
import { api } from '../../api/client';

interface Props {
  applicantName: string;
  // Resolves to an error message to show in the dialog, or null on success.
  onAdmit: (admissionNumber: string) => Promise<string | null>;
  disabled?: boolean;
  className?: string;
}

// Admission numbers are typed by the registrar, never auto-generated.
export default function AdmitButton({ applicantName, onAdmit, disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [example, setExample] = useState('');

  function openDialog() {
    setOpen(true);
    setValue('');
    setError('');
    api('/settings')
      .then((s) => setExample(s?.admissionNumberExample || ''))
      .catch(() => {});
  }

  async function confirm() {
    const v = value.trim();
    if (!v) {
      setError('Enter an admission number.');
      return;
    }
    setBusy(true);
    setError('');
    const err = await onAdmit(v);
    setBusy(false);
    if (err) setError(err);
    else setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={openDialog}
        className={className || 'text-xs bg-rgreen text-white px-3 py-1.5 rounded-md disabled:opacity-50'}
      >
        Admit
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-lg shadow p-5 space-y-3 text-left"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void confirm();
              }
            }}
          >
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Admit {applicantName}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Type the admission number for this student. Each number can be used once.
            </p>
            <input
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              placeholder={example ? `e.g. ${example}` : 'Admission number'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="border border-gray-300 text-gray-700 rounded-lg px-3 py-1.5 text-sm dark:border-gray-600 dark:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirm()}
                className="bg-rgreen text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {busy ? 'Admitting...' : 'Admit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
