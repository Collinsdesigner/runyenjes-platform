// RUNYENJES-SETUP-V1
import { useEffect, useState } from 'react';
import {
  getSetupStatus,
  getReadiness,
  uploadSetupLogo,
  completeSetup,
  sendTestEmail,
  SetupApiError,
  type SetupStatus,
  type Readiness,
} from '../api/setup';
import { COLOR_GROUPS } from './setup-wizard/colorPresets';

const STEP_TITLES = [
  'Check',
  'Institution',
  'Branding',
  'Modules',
  'Systems',
  'Admin',
  'Academics',
  'Review',
];

const ALL_ROLES = [
  'ADMIN',
  'REGISTRAR',
  'TEACHER',
  'STUDENT',
  'FINANCE_OFFICER',
  'HR_OFFICER',
  'EXAM_OFFICER',
  'STORES_OFFICER',
  'ALUMNI',
  'PROCUREMENT_OFFICER',
  'SUPPORT_STAFF',
];

type Audience = 'staff' | 'everyone' | 'admins';

interface LinkRow {
  name: string;
  url: string;
  audience: Audience;
}

const inputCls =
  'mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';
const labelCls = 'block text-sm text-gray-600 dark:text-gray-300';
const primaryBtn =
  'bg-rgreen text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50';
const secondaryBtn =
  'border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium dark:border-gray-600 dark:text-gray-200 disabled:opacity-50';

function readableText(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111827' : '#ffffff';
}

function isEmail(v: string): boolean {
  return /^\S+@\S+\.\S+$/.test(v.trim());
}

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function Setup() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState('');

  const [token, setToken] = useState('');
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [testBusy, setTestBusy] = useState(false);

  const [inst, setInst] = useState({
    institutionName: '',
    shortName: '',
    tagline: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    physicalLocation: '',
    googleMapsUrl: '',
  });

  const [presetId, setPresetId] = useState('teal-charcoal');
  const [primary, setPrimary] = useState('#0F766E');
  const [secondary, setSecondary] = useState('#374151');
  const [logo, setLogo] = useState<{ url: string; publicId: string } | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState('');

  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [moduleLinks, setModuleLinks] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<LinkRow[]>([]);

  const [admin, setAdmin] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);

  const [addAcademic, setAddAcademic] = useState(false);
  const [academic, setAcademic] = useState({ departmentName: '', programmeName: '', level: '' });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitDetails, setSubmitDetails] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  // Guard: if setup is already finished, this page must not be usable.
  useEffect(() => {
    getSetupStatus()
      .then((s) => {
        if (!s.needsSetup) {
          window.location.replace('/');
          return;
        }
        setStatus(s);
        setModules(Object.fromEntries(s.modules.map((m) => [m.key, true])));
      })
      .catch((err) =>
        setStatusError(err instanceof Error ? err.message : 'Could not reach the server')
      );
  }, []);

  // Live preview: the chosen colors are applied to the page while choosing.
  useEffect(() => {
    document.documentElement.style.setProperty('--color-primary', primary);
    document.documentElement.style.setProperty('--color-secondary', secondary);
  }, [primary, secondary]);

  // No token needed -> run the readiness checks straight away.
  useEffect(() => {
    if (status && !status.tokenRequired) void runChecks();
    // eslint-disable-next-line
  }, [status]);

  async function runChecks() {
    setChecking(true);
    setCheckError('');
    try {
      setReadiness(await getReadiness(token || null));
    } catch (err) {
      setReadiness(null);
      if (err instanceof SetupApiError && err.status === 401) {
        setCheckError('That setup token is not correct.');
      } else {
        setCheckError(err instanceof Error ? err.message : 'Check failed');
      }
    } finally {
      setChecking(false);
    }
  }

  async function runTestEmail() {
    setTestBusy(true);
    setTestMsg('');
    try {
      const res = await sendTestEmail(token || null);
      setTestMsg(res.message || 'Test email sent.');
    } catch (err) {
      setTestMsg(err instanceof Error ? err.message : 'The test email could not be sent.');
    } finally {
      setTestBusy(false);
    }
  }

  function setI(field: keyof typeof inst, value: string) {
    setInst((prev) => ({ ...prev, [field]: value }));
  }

  function pickPreset(id: string) {
    for (const g of COLOR_GROUPS) {
      const p = g.presets.find((x) => x.id === id);
      if (p) {
        setPresetId(p.id);
        setPrimary(p.primary);
        setSecondary(p.secondary);
        return;
      }
    }
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoBusy(true);
    setLogoError('');
    try {
      const res = await uploadSetupLogo(file, token || null);
      setLogo({ url: res.logoUrl, publicId: res.logoPublicId });
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Logo upload failed');
    } finally {
      setLogoBusy(false);
    }
  }

  function updateLink(i: number, patch: Partial<LinkRow>) {
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  // Choosing "our own system" for Stores also moves Procurement, which works with Stores.
  function chooseOwn(key: string) {
    setModules((prev) => ({ ...prev, [key]: false, ...(key === 'stores' ? { procurement: false } : {}) }));
  }

  function validateStep(s: number): string {
    if (s === 0) {
      if (!readiness) return 'Run the checks first.';
      if (!readiness.ready) return 'Fix the failed checks, then run them again.';
    }
    if (s === 1) {
      if (inst.institutionName.trim().length < 2) return 'Enter the institution name.';
      if (!inst.shortName.trim()) return 'Enter a short name.';
      if (!inst.address.trim()) return 'Enter the postal or physical address.';
      if (inst.phone.trim().length < 5) return 'Enter a phone number.';
      if (!isEmail(inst.email)) return 'Enter a valid institution email.';
    }
    if (s === 3) {
      for (const [k, v] of Object.entries(moduleLinks)) {
        if (modules[k] === false && v.trim() && !isHttpUrl(v)) {
          return 'The address for each system must start with http:// or https://.';
        }
      }
    }
    if (s === 4) {
      for (const l of links) {
        const touched = l.name.trim() || l.url.trim();
        if (touched && (!l.name.trim() || !isHttpUrl(l.url))) {
          return 'Each external system needs a name and a web address starting with http:// or https://.';
        }
      }
    }
    if (s === 5) {
      if (admin.name.trim().length < 2) return 'Enter the administrator name.';
      if (!isEmail(admin.email)) return 'Enter a valid administrator email.';
      if (admin.password.length < 8) return 'The password must be at least 8 characters.';
      if (admin.password !== admin.confirm) return 'The two passwords do not match.';
    }
    if (s === 6 && addAcademic) {
      if (academic.departmentName.trim().length < 2) return 'Enter the department name, or choose to skip.';
      if (academic.programmeName.trim().length < 2) return 'Enter the programme name, or choose to skip.';
    }
    return '';
  }

  function goNext() {
    const err = validateStep(step);
    setStepError(err);
    if (!err) setStep((s) => s + 1);
  }

  function goBack() {
    setStepError('');
    setStep((s) => Math.max(0, s - 1));
  }

  function buildPayload() {
    return {
      institution: {
        institutionName: inst.institutionName.trim(),
        shortName: inst.shortName.trim(),
        tagline: inst.tagline.trim(),
        address: inst.address.trim(),
        phone: inst.phone.trim(),
        email: inst.email.trim(),
        website: inst.website.trim(),
        physicalLocation: inst.physicalLocation.trim() || undefined,
        googleMapsUrl: inst.googleMapsUrl.trim() || undefined,
      },
      branding: {
        primaryColor: primary,
        secondaryColor: secondary,
        logoUrl: logo?.url,
        logoPublicId: logo?.publicId,
      },
      modules,
      moduleLinks: Object.fromEntries(Object.entries(moduleLinks).filter(([k, v]) => modules[k] === false && v.trim())),
      externalSystems: links
        .filter((l) => l.name.trim() && l.url.trim())
        .map((l) => ({
          name: l.name.trim(),
          url: l.url.trim(),
          visibleToRoles:
            l.audience === 'everyone' ? ALL_ROLES : l.audience === 'admins' ? ['ADMIN'] : [],
        })),
      admin: {
        name: admin.name.trim(),
        email: admin.email.trim(),
        password: admin.password,
      },
      academic: addAcademic
        ? {
            departmentName: academic.departmentName.trim(),
            programmeName: academic.programmeName.trim(),
            level: academic.level.trim() || undefined,
          }
        : undefined,
    };
  }

  async function finish() {
    setSubmitting(true);
    setSubmitError('');
    setSubmitDetails([]);
    try {
      await completeSetup(buildPayload(), token || null);
      setDone(true);
    } catch (err) {
      if (err instanceof SetupApiError) {
        setSubmitError(err.message);
        setSubmitDetails(err.details);
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Setup failed');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const shell = 'min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4';
  const card = 'max-w-3xl mx-auto bg-white dark:bg-gray-900 rounded-lg shadow p-6';

  if (statusError) {
    return (
      <div className={shell}>
        <div className={card}>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Cannot reach the server</h1>
          <p className="text-sm text-red-600 mb-4">{statusError}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Check that the backend is running and that VITE_API_URL points to it.
          </p>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Stuck? The{' '}
              <a href="/deployment-guide" target="_blank" rel="noopener noreferrer" className="underline">
                Deployment Guide
              </a>
              explains each step.
            </p>
          <button className={primaryBtn} onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className={shell}>
        <div className={card}>
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading setup...</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={shell}>
        <div className={card + ' text-center'}>
          <h1 className="text-2xl font-bold text-rgreen mb-2">Setup complete</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
            {inst.institutionName} is ready. Sign in with the administrator account you just created.
            If you set a SETUP_TOKEN on the server, you can now remove it.
          </p>
          <button className={primaryBtn} onClick={() => window.location.assign('/login')}>
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className={card}>
        <h1 className="text-xl font-bold text-rgreen mb-1">Set up your institution</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Step {step + 1} of {STEP_TITLES.length}: {STEP_TITLES[step]}
        </p>

        <div className="flex flex-wrap gap-1 mb-6">
          {STEP_TITLES.map((t, i) => (
            <span
              key={t}
              className={`text-xs px-2 py-1 rounded-full ${
                i === step
                  ? 'bg-rgreen text-white'
                  : i < step
                  ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                  : 'bg-gray-100 text-gray-400 dark:bg-gray-800'
              }`}
            >
              {i + 1}. {t}
            </span>
          ))}
        </div>

        {/* ---------------- Step 0: readiness ---------------- */}
        {step === 0 && (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              These checks confirm your database, media storage and security settings are ready
              before you continue.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Need help setting up the services (database, media, AI, email)? Read the{' '}
              <a href="/deployment-guide" target="_blank" rel="noopener noreferrer" className="underline">
                Deployment Guide
              </a>
              .
            </p>

            {status.tokenRequired && (
              <label className={labelCls + ' mb-3'}>
                Setup token
                <input
                  type="password"
                  className={inputCls}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="The SETUP_TOKEN you set on the server"
                />
              </label>
            )}

            <button
              className={primaryBtn}
              onClick={runChecks}
              disabled={checking || (status.tokenRequired && !token)}
            >
              {checking ? 'Checking...' : readiness ? 'Run checks again' : 'Run checks'}
            </button>

            {checkError && <p className="text-sm text-red-600 mt-3">{checkError}</p>}

            {readiness && (
              <div className="mt-3">
                <button type="button" className={secondaryBtn} onClick={runTestEmail} disabled={testBusy}>
                  {testBusy ? 'Sending...' : 'Send a test email'}
                </button>
                {testMsg && <p className="text-sm mt-2 text-gray-700 dark:text-gray-200">{testMsg}</p>}
              </div>
            )}

            {readiness && (
              <ul className="mt-4 space-y-2">
                {readiness.checks.map((c) => (
                  <li key={c.key} className="text-sm">
                    <span
                      className={
                        c.status === 'pass'
                          ? 'text-green-600'
                          : c.status === 'fail'
                          ? 'text-red-600'
                          : 'text-amber-600'
                      }
                    >
                      {c.status === 'pass' ? '[OK]' : c.status === 'fail' ? '[FAIL]' : '[WARN]'}
                    </span>{' '}
                    <span className="text-gray-800 dark:text-gray-100">{c.label}</span>
                    {c.fix && c.status !== 'pass' && (
                      <p className="text-gray-500 dark:text-gray-400 ml-10">{c.fix}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ---------------- Step 1: institution ---------------- */}
        {step === 1 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls + ' sm:col-span-2'}>
              Institution name
              <input className={inputCls} value={inst.institutionName} onChange={(e) => setI('institutionName', e.target.value)} />
            </label>
            <label className={labelCls}>
              Short name
              <input className={inputCls} value={inst.shortName} onChange={(e) => setI('shortName', e.target.value)} />
            </label>
            <label className={labelCls}>
              Tagline (optional)
              <input className={inputCls} value={inst.tagline} onChange={(e) => setI('tagline', e.target.value)} />
            </label>
            <label className={labelCls + ' sm:col-span-2'}>
              Postal address
              <input className={inputCls} value={inst.address} onChange={(e) => setI('address', e.target.value)} />
            </label>
            <label className={labelCls}>
              Phone
              <input className={inputCls} value={inst.phone} onChange={(e) => setI('phone', e.target.value)} />
            </label>
            <label className={labelCls}>
              Email
              <input className={inputCls} value={inst.email} onChange={(e) => setI('email', e.target.value)} />
            </label>
            <label className={labelCls + ' sm:col-span-2'}>
              Website (optional)
              <input className={inputCls} value={inst.website} onChange={(e) => setI('website', e.target.value)} />
            </label>
            <label className={labelCls + ' sm:col-span-2'}>
              Physical location (optional)
              <input className={inputCls} value={inst.physicalLocation} onChange={(e) => setI('physicalLocation', e.target.value)} />
            </label>
            <label className={labelCls + ' sm:col-span-2'}>
              Google Maps link (optional)
              <input className={inputCls} value={inst.googleMapsUrl} onChange={(e) => setI('googleMapsUrl', e.target.value)} />
            </label>
          </div>
        )}

        {/* ---------------- Step 2: branding ---------------- */}
        {step === 2 && (
          <div>
            <div className="mb-5">
              <p className={labelCls}>Logo (optional)</p>
              <input
                type="file"
                accept="image/*"
                className="mt-1 text-sm"
                onChange={onLogoChange}
                disabled={logoBusy}
              />
              {logoBusy && <p className="text-sm text-gray-500 mt-1">Uploading...</p>}
              {logoError && <p className="text-sm text-red-600 mt-1">{logoError}</p>}
              {logo && (
                <img src={logo.url} alt="Logo preview" className="h-14 mt-2 rounded border border-gray-200 bg-white p-1 object-contain" />
              )}
            </div>

            <p className={labelCls + ' mb-2'}>Choose your colors</p>
            {COLOR_GROUPS.map((g) => (
              <div key={g.title} className="mb-3">
                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-1">{g.title}</p>
                <div className="flex flex-wrap gap-2">
                  {g.presets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickPreset(p.id)}
                      className="flex items-center gap-2 border rounded-lg px-2 py-1 text-sm text-gray-800 dark:text-gray-100 dark:border-gray-600"
                      style={presetId === p.id ? { borderColor: 'var(--color-primary)', borderWidth: 2 } : undefined}
                    >
                      <span className="inline-block w-4 h-4 rounded-full border border-gray-300" style={{ background: p.primary }} />
                      <span className="inline-block w-4 h-4 rounded-full border border-gray-300" style={{ background: p.secondary }} />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="mb-4">
              <button
                type="button"
                onClick={() => setPresetId('custom')}
                className="border rounded-lg px-3 py-1 text-sm text-gray-800 dark:text-gray-100 dark:border-gray-600"
                style={presetId === 'custom' ? { borderColor: 'var(--color-primary)', borderWidth: 2 } : undefined}
              >
                Custom (I know my exact colors)
              </button>
              {presetId === 'custom' && (
                <div className="grid grid-cols-2 gap-3 mt-3 max-w-sm">
                  <label className={labelCls}>
                    Primary
                    <input type="color" className="mt-1 w-full h-10 border border-gray-300 rounded-lg px-1" value={primary} onChange={(e) => setPrimary(e.target.value)} />
                  </label>
                  <label className={labelCls}>
                    Secondary
                    <input type="color" className="mt-1 w-full h-10 border border-gray-300 rounded-lg px-1" value={secondary} onChange={(e) => setSecondary(e.target.value)} />
                  </label>
                </div>
              )}
            </div>

            <p className={labelCls + ' mb-1'}>Preview</p>
            <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <div className="px-4 py-3 flex items-center gap-3" style={{ background: primary, color: readableText(primary) }}>
                {logo ? (
                  <img src={logo.url} alt="" className="h-8 w-8 rounded bg-white object-contain" />
                ) : (
                  <span className="h-8 w-8 rounded bg-white/20 inline-block" />
                )}
                <span className="font-semibold">{inst.shortName || inst.institutionName || 'Your institution'}</span>
              </div>
              <div className="p-4 flex gap-2 bg-white dark:bg-gray-900">
                <span className="px-3 py-1 rounded text-sm" style={{ background: primary, color: readableText(primary) }}>
                  Primary button
                </span>
                <span className="px-3 py-1 rounded text-sm" style={{ background: secondary, color: readableText(secondary) }}>
                  Secondary accent
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- Step 3: modules ---------------- */}
        {step === 3 && (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              For each area below, choose whether your institution uses this platform's version or
              already runs it on another system. If you use another system, we hide ours so there is
              no duplicate, and you can add the address of your system so people can open it from here.
              Admissions, academics, examinations, learning materials and announcements are always
              provided by this platform. You can change all of this later in Admin, Modules and Systems.
            </p>
            <ul className="space-y-3">
              {status.modules.map((m) => {
                const own = modules[m.key] === false;
                const locked = m.key === 'procurement' && modules['stores'] === false;
                const link = moduleLinks[m.key] ?? '';
                return (
                  <li key={m.key} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{m.label}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{m.description}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        disabled={locked}
                        className={!own ? primaryBtn : secondaryBtn}
                        onClick={() => setModules((prev) => ({ ...prev, [m.key]: true }))}
                      >
                        Use this platform's
                      </button>
                      <button
                        type="button"
                        className={own ? primaryBtn : secondaryBtn}
                        onClick={() => chooseOwn(m.key)}
                      >
                        We use our own system
                      </button>
                    </div>
                    {locked && (
                      <p className="text-sm text-gray-500 mt-2 dark:text-gray-400">
                        Procurement works with Stores, so it is handled elsewhere too.
                      </p>
                    )}
                    {own && (
                      <div className="mt-2">
                        <label className={labelCls}>
                          Address of that system (optional)
                          <input
                            className={inputCls}
                            placeholder="https://"
                            value={link}
                            onChange={(e) => setModuleLinks((prev) => ({ ...prev, [m.key]: e.target.value }))}
                          />
                        </label>
                        {link.trim().toLowerCase().startsWith('http://') && (
                          <p className="text-sm text-amber-600 mt-1">
                            This address is not encrypted (http). Use https if you can.
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* ---------------- Step 4: external systems ---------------- */}
        {step === 4 && (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
              Optional. If your institution runs another system (for example an existing ERP) and has
              already made it reachable over the internet, add it here. It appears as a link card that
              opens the address. This platform never reads or writes that system's data.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              A system that only works on your local network cannot be reached from outside until you
              expose it yourself (see the Deployment Guide). Put a login in front of it when you do.
            </p>

            {links.map((l, i) => (
              <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-3 grid gap-2 sm:grid-cols-2">
                <label className={labelCls}>
                  Name
                  <input className={inputCls} value={l.name} onChange={(e) => updateLink(i, { name: e.target.value })} />
                </label>
                <label className={labelCls}>
                  Web address
                  <input className={inputCls} value={l.url} placeholder="https://" onChange={(e) => updateLink(i, { url: e.target.value })} />
                </label>
                <label className={labelCls}>
                  Who can see it
                  <select className={inputCls} value={l.audience} onChange={(e) => updateLink(i, { audience: e.target.value as Audience })}>
                    <option value="staff">Staff only (recommended)</option>
                    <option value="admins">Administrators only</option>
                    <option value="everyone">Everyone, including students</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <button type="button" className={secondaryBtn} onClick={() => setLinks((prev) => prev.filter((_, idx) => idx !== i))}>
                    Remove
                  </button>
                </div>
                {l.url.trim().toLowerCase().startsWith('http://') && (
                  <p className="text-sm text-amber-600 sm:col-span-2">
                    This address is not encrypted (http). Use https if you can, especially for finance or student data.
                  </p>
                )}
              </div>
            ))}

            <button
              type="button"
              className={secondaryBtn}
              disabled={links.length >= 20}
              onClick={() => setLinks((prev) => [...prev, { name: '', url: '', audience: 'staff' }])}
            >
              Add an external system
            </button>
          </div>
        )}

        {/* ---------------- Step 5: admin ---------------- */}
        {step === 5 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="text-sm text-gray-600 dark:text-gray-300 sm:col-span-2">
              This is the first administrator account. It can create every other account afterwards.
            </p>
            <label className={labelCls}>
              Full name
              <input className={inputCls} value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} />
            </label>
            <label className={labelCls}>
              Email (used to sign in)
              <input className={inputCls} value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
            </label>
            <label className={labelCls}>
              Password (at least 8 characters)
              <input type={showPw ? 'text' : 'password'} className={inputCls} value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} />
            </label>
            <label className={labelCls}>
              Confirm password
              <input type={showPw ? 'text' : 'password'} className={inputCls} value={admin.confirm} onChange={(e) => setAdmin({ ...admin, confirm: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 sm:col-span-2">
              <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
              Show password
            </label>
          </div>
        )}

        {/* ---------------- Step 6: academics ---------------- */}
        {step === 6 && (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              Optional. You can add your first department and programme now, or skip and do it later
              from Admin, Academic. Skipping loses nothing.
            </p>
            <div className="flex gap-2 mb-4">
              <button type="button" className={addAcademic ? primaryBtn : secondaryBtn} onClick={() => setAddAcademic(true)}>
                Add them now
              </button>
              <button type="button" className={!addAcademic ? primaryBtn : secondaryBtn} onClick={() => setAddAcademic(false)}>
                Skip, I will do this later
              </button>
            </div>
            {addAcademic && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelCls + ' sm:col-span-2'}>
                  Department name
                  <input className={inputCls} value={academic.departmentName} onChange={(e) => setAcademic({ ...academic, departmentName: e.target.value })} />
                </label>
                <label className={labelCls}>
                  Programme name
                  <input className={inputCls} value={academic.programmeName} onChange={(e) => setAcademic({ ...academic, programmeName: e.target.value })} />
                </label>
                <label className={labelCls}>
                  Level (optional)
                  <input className={inputCls} value={academic.level} onChange={(e) => setAcademic({ ...academic, level: e.target.value })} />
                </label>
              </div>
            )}
          </div>
        )}

        {/* ---------------- Step 7: review ---------------- */}
        {step === 7 && (
          <div className="text-sm text-gray-800 dark:text-gray-100 space-y-3">
            <p className="text-gray-600 dark:text-gray-300">
              Review everything, then finish. Nothing is saved until you press Finish setup.
            </p>
            <div>
              <p className="font-semibold">{inst.institutionName}</p>
              <p className="text-gray-500 dark:text-gray-400">
                {inst.shortName}
                {inst.tagline ? ` | ${inst.tagline}` : ''}
              </p>
              <p className="text-gray-500 dark:text-gray-400">
                {inst.address} | {inst.phone} | {inst.email}
              </p>
            </div>
            <p>
              Colors: {primary} and {secondary}. Logo: {logo ? 'uploaded' : 'none'}.
            </p>
            <p>
              Handled in their own system:{' '}
              {status.modules.filter((m) => modules[m.key] === false).map((m) => m.label).join(', ') || 'none'}
            </p>
            <p>
              External systems:{' '}
              {links.filter((l) => l.name.trim()).map((l) => l.name.trim()).join(', ') || 'none'}
            </p>
            <p>
              Administrator: {admin.name} ({admin.email})
            </p>
            <p>
              First department and programme:{' '}
              {addAcademic ? `${academic.departmentName} / ${academic.programmeName}` : 'skipped'}
            </p>
            {submitError && <p className="text-red-600">{submitError}</p>}
            {submitDetails.length > 0 && (
              <ul className="text-red-600 list-disc ml-5">
                {submitDetails.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {stepError && <p className="text-sm text-red-600 mt-4">{stepError}</p>}

        <div className="flex justify-between mt-6">
          <button className={secondaryBtn} onClick={goBack} disabled={step === 0 || submitting}>
            Back
          </button>
          {step < STEP_TITLES.length - 1 ? (
            <button className={primaryBtn} onClick={goNext}>
              Next
            </button>
          ) : (
            <button className={primaryBtn} onClick={finish} disabled={submitting}>
              {submitting ? 'Setting up...' : 'Finish setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
