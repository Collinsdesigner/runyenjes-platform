#!/usr/bin/env python3
"""
Generates the 6 missing Admin sub-pages that PortalLayout already links to
but had no <Route>/page behind them: Settings, Admissions, Library,
Students, Staff, Academic.

Creates:
  src/pages/admin/AdminSettings.tsx     -> GET /settings, PATCH /admin/settings
  src/pages/admin/AdminAdmissions.tsx   -> GET /applications, PATCH /applications/:id/status,
                                            PATCH /applications/payments/:id/verify
  src/pages/admin/AdminLibrary.tsx      -> GET /academic/programmes, GET/POST /library/...
  src/pages/admin/AdminStudents.tsx     -> GET /admin/users?role=STUDENT, PATCH status/department
  src/pages/admin/AdminStaff.tsx        -> GET /admin/users, POST /admin/users,
                                            PATCH role/department/status, reset-password
  src/pages/admin/AdminAcademic.tsx     -> GET /academic/structure,
                                            POST/PATCH/DELETE /admin/departments, /admin/programs

Patches src/App.tsx with the 6 new imports + routes, using whitespace-tolerant
line-based insertion (matches the approach in patch_portal_wiring.py).

USAGE (run from ~/runyenjes-platform/frontend):
    python3 generate_admin_subpages.py

Idempotent: skips existing files (use --force to overwrite) and skips the
App.tsx patch if it looks already applied.
"""

import argparse
import os
import sys

PAGES_DIR = os.path.join("src", "pages", "admin")
APP_PATH = os.path.join("src", "App.tsx")

# ─────────────────────────────────────────────
# SETTINGS
# ─────────────────────────────────────────────

ADMIN_SETTINGS_TSX = """import { useEffect, useState } from 'react';
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
        <p className="text-sm text-gray-400">Loading...</p>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Institution Settings">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Institution Settings</h2>
          <p className="text-sm text-gray-500 mt-1">
            Renaming the college, changing colors, or updating contact info happens here \\u2014 no code change needed.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-gray-500">Institution name</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.institutionName}
                onChange={(e) => set('institutionName', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500">Short name</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.shortName}
                onChange={(e) => set('shortName', e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-gray-500">Tagline</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.tagline}
                onChange={(e) => set('tagline', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500">Primary color</span>
              <input
                type="color"
                className="mt-1 w-full h-10 border border-gray-300 rounded-lg px-1"
                value={form.primaryColor || '#0B7A2B'}
                onChange={(e) => set('primaryColor', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500">Secondary color</span>
              <input
                type="color"
                className="mt-1 w-full h-10 border border-gray-300 rounded-lg px-1"
                value={form.secondaryColor || '#5C0F00'}
                onChange={(e) => set('secondaryColor', e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-gray-500">Address</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500">Phone</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500">Email</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500">Website</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-gray-500">Physical location</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.physicalLocation}
                onChange={(e) => set('physicalLocation', e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-gray-500">Google Maps URL</span>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.googleMapsUrl}
                onChange={(e) => set('googleMapsUrl', e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-gray-500">About</span>
              <textarea
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
"""

# ─────────────────────────────────────────────
# ADMISSIONS
# ─────────────────────────────────────────────

ADMIN_ADMISSIONS_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Payment {
  id: string;
  amount: string;
  method: string;
  reference: string | null;
  status: string;
}

interface Application {
  id: string;
  applicantName: string;
  email: string;
  phone: string;
  intake: string;
  status: string;
  program: { id: string; name: string; department: { id: string; name: string } };
  payments: Payment[];
}

export default function AdminAdmissions() {
  const { token } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api('/applications', { token });
      setApplications(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load applications');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleStatus(id: string, status: 'ADMITTED' | 'REJECTED' | 'WAITLISTED') {
    setError('');
    setMessage('');
    try {
      await api(`/applications/${id}/status`, { method: 'PATCH', token, body: { status } });
      setMessage(`Application ${status.toLowerCase()}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update application');
    }
  }

  async function handleVerifyPayment(paymentId: string, status: 'verified' | 'rejected') {
    setError('');
    setMessage('');
    try {
      await api(`/applications/payments/${paymentId}/verify`, { method: 'PATCH', token, body: { status } });
      setMessage(`Payment ${status}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update payment');
    }
  }

  const visible = statusFilter ? applications.filter((a) => a.status === statusFilter) : applications;

  return (
    <PortalLayout title="Admissions">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Admissions</h2>
          <p className="text-sm text-gray-500 mt-1">Review applications and verify payments.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="ADMITTED">Admitted</option>
          <option value="REJECTED">Rejected</option>
          <option value="WAITLISTED">Waitlisted</option>
          <option value="REPORTED">Reported</option>
        </select>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Applicant</th>
                <th className="px-4 py-2">Programme</th>
                <th className="px-4 py-2">Intake</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Payments</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No applications</td></tr>
              )}
              {visible.map((a) => (
                <tr key={a.id} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{a.applicantName}</div>
                    <div className="text-xs text-gray-400">{a.email}</div>
                  </td>
                  <td className="px-4 py-2">{a.program?.name}</td>
                  <td className="px-4 py-2">{a.intake}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{a.status}</span>
                  </td>
                  <td className="px-4 py-2">
                    {a.payments.length === 0 && <span className="text-xs text-gray-400">None</span>}
                    {a.payments.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-xs mb-1">
                        <span>
                          KES {p.amount} ({p.reference}) \\u2014 {p.status}
                        </span>
                        {p.status === 'pending' && (
                          <>
                            <button
                              className="text-green-600 font-medium"
                              onClick={() => handleVerifyPayment(p.id, 'verified')}
                            >
                              Verify
                            </button>
                            <button
                              className="text-red-600 font-medium"
                              onClick={() => handleVerifyPayment(p.id, 'rejected')}
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    {a.status === 'SUBMITTED' && (
                      <>
                        <button
                          className="text-green-600 text-xs font-medium"
                          onClick={() => handleStatus(a.id, 'ADMITTED')}
                        >
                          Admit
                        </button>
                        <button
                          className="text-amber-600 text-xs font-medium"
                          onClick={() => handleStatus(a.id, 'WAITLISTED')}
                        >
                          Waitlist
                        </button>
                        <button
                          className="text-red-600 text-xs font-medium"
                          onClick={() => handleStatus(a.id, 'REJECTED')}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}
"""

# ─────────────────────────────────────────────
# LIBRARY
# ─────────────────────────────────────────────

ADMIN_LIBRARY_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Programme {
  id: string;
  name: string;
  level: string | null;
  department: { id: string; name: string };
}

interface Material {
  id: string;
  fileUrl: string;
  type: string;
  uploader: { name: string };
}

interface Unit {
  id: string;
  name: string;
  materials: Material[];
}

export default function AdminLibrary() {
  const { token } = useAuth();
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [newUnitName, setNewUnitName] = useState('');
  const [materialFormUnitId, setMaterialFormUnitId] = useState<string | null>(null);
  const [materialUrl, setMaterialUrl] = useState('');
  const [materialType, setMaterialType] = useState('pdf');

  useEffect(() => {
    if (!token) return;
    api('/academic/programmes', { token })
      .then((data) => setProgrammes(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load programmes'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function loadUnits(programId: string) {
    setSelectedProgramId(programId);
    if (!programId) {
      setUnits([]);
      return;
    }
    try {
      const data = await api(`/library/programs/${programId}/units`, { token });
      setUnits(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load units');
    }
  }

  async function handleAddUnit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!selectedProgramId || !newUnitName) return;
    try {
      await api(`/library/programs/${selectedProgramId}/units`, {
        method: 'POST',
        token,
        body: { name: newUnitName },
      });
      setMessage('Unit added');
      setNewUnitName('');
      loadUnits(selectedProgramId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add unit');
    }
  }

  async function handleAddMaterial(unitId: string) {
    setError('');
    setMessage('');
    if (!materialUrl) return;
    try {
      await api(`/library/units/${unitId}/materials`, {
        method: 'POST',
        token,
        body: { fileUrl: materialUrl, type: materialType },
      });
      setMessage('Material added');
      setMaterialFormUnitId(null);
      setMaterialUrl('');
      loadUnits(selectedProgramId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add material');
    }
  }

  async function handleDeleteUnit(unitId: string) {
    setError('');
    setMessage('');
    try {
      await api(`/library/units/${unitId}`, { method: 'DELETE', token });
      setMessage('Unit deleted');
      loadUnits(selectedProgramId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete unit');
    }
  }

  return (
    <PortalLayout title="Library">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Library</h2>
          <p className="text-sm text-gray-500 mt-1">Manage units and learning materials per programme.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full sm:w-96"
          value={selectedProgramId}
          onChange={(e) => loadUnits(e.target.value)}
        >
          <option value="">{loading ? 'Loading programmes...' : 'Select a programme'}</option>
          {programmes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.department.name} \\u2014 {p.name} {p.level || ''}
            </option>
          ))}
        </select>

        {selectedProgramId && (
          <>
            <form onSubmit={handleAddUnit} className="bg-white border border-gray-200 rounded-lg p-5 flex gap-3">
              <input
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="New unit name"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
              />
              <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
                Add Unit
              </button>
            </form>

            <div className="space-y-3">
              {units.map((unit) => (
                <div key={unit.id} className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">{unit.name}</h3>
                    <div className="space-x-3">
                      <button
                        className="text-rgreen text-xs font-medium"
                        onClick={() => setMaterialFormUnitId(materialFormUnitId === unit.id ? null : unit.id)}
                      >
                        {materialFormUnitId === unit.id ? 'Cancel' : 'Add material'}
                      </button>
                      <button className="text-red-600 text-xs font-medium" onClick={() => handleDeleteUnit(unit.id)}>
                        Delete unit
                      </button>
                    </div>
                  </div>

                  {materialFormUnitId === unit.id && (
                    <div className="flex flex-wrap gap-2 items-center mt-3">
                      <input
                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm flex-1 min-w-[200px]"
                        placeholder="Material URL"
                        value={materialUrl}
                        onChange={(e) => setMaterialUrl(e.target.value)}
                      />
                      <select
                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                        value={materialType}
                        onChange={(e) => setMaterialType(e.target.value)}
                      >
                        <option value="pdf">PDF</option>
                        <option value="slides">Slides</option>
                        <option value="video">Video</option>
                        <option value="external-link">External link</option>
                      </select>
                      <button
                        className="bg-rgreen text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                        onClick={() => handleAddMaterial(unit.id)}
                      >
                        Save
                      </button>
                    </div>
                  )}

                  {unit.materials.length > 0 && (
                    <ul className="mt-3 text-xs text-gray-500 space-y-1">
                      {unit.materials.map((m) => (
                        <li key={m.id}>
                          [{m.type}] {m.fileUrl} \\u2014 uploaded by {m.uploader.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
"""

# ─────────────────────────────────────────────
# STUDENTS
# ─────────────────────────────────────────────

ADMIN_STUDENTS_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface StudentRow {
  id: string;
  name: string;
  email: string;
  admissionNumber: string | null;
  status: string;
  department: { id: string; name: string } | null;
}

export default function AdminStudents() {
  const { token } = useAuth();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ role: 'STUDENT' });
      if (search) params.set('search', search);
      const data = await api(`/admin/users?${params.toString()}`, { token });
      setStudents(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load students');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search]);

  async function handleStatus(id: string, status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED') {
    setError('');
    setMessage('');
    try {
      await api(`/admin/users/${id}/status`, { method: 'PATCH', token, body: { status } });
      setMessage('Status updated');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status');
    }
  }

  return (
    <PortalLayout title="Students">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Students</h2>
          <p className="text-sm text-gray-500 mt-1">Student records and account status.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <input
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full sm:w-96"
          placeholder="Search name, email, admission #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Admission #</th>
                <th className="px-4 py-2">Department</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && students.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No students found</td></tr>
              )}
              {students.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{s.name}</div>
                    <div className="text-xs text-gray-400">{s.email}</div>
                  </td>
                  <td className="px-4 py-2">{s.admissionNumber || '—'}</td>
                  <td className="px-4 py-2">{s.department?.name || '—'}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{s.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    {s.status !== 'SUSPENDED' && (
                      <button
                        className="text-amber-600 text-xs font-medium"
                        onClick={() => handleStatus(s.id, 'SUSPENDED')}
                      >
                        Suspend
                      </button>
                    )}
                    {s.status !== 'ACTIVE' && (
                      <button
                        className="text-green-600 text-xs font-medium"
                        onClick={() => handleStatus(s.id, 'ACTIVE')}
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}
"""

# ─────────────────────────────────────────────
# STAFF
# ─────────────────────────────────────────────

ADMIN_STAFF_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  department: { id: string; name: string } | null;
}

const STAFF_ROLES = [
  'TEACHER',
  'REGISTRAR',
  'ADMIN',
  'FINANCE_OFFICER',
  'HR_OFFICER',
  'EXAM_OFFICER',
  'STORES_OFFICER',
];

export default function AdminStaff() {
  const { token } = useAuth();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('TEACHER');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      if (!roleFilter) {
        const results = await Promise.all(
          STAFF_ROLES.map((r) =>
            api(`/admin/users?role=${r}${search ? `&search=${encodeURIComponent(search)}` : ''}`, { token })
          )
        );
        setStaff(results.flatMap((r) => r.users));
      } else {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        params.set('role', roleFilter);
        const data = await api(`/admin/users?${params.toString()}`, { token });
        setStaff(data.users);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load staff');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, roleFilter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!name || !email || !password) {
      setError('Name, email and password are required');
      return;
    }
    try {
      await api('/admin/users', { method: 'POST', token, body: { name, email, password, role } });
      setMessage(`${name} created as ${role}`);
      setName('');
      setEmail('');
      setPassword('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create staff account');
    }
  }

  async function handleResetPassword(id: string) {
    const newPassword = window.prompt('New temporary password (min 6 characters):');
    if (!newPassword) return;
    setError('');
    setMessage('');
    try {
      await api(`/admin/users/${id}/reset-password`, { method: 'POST', token, body: { newPassword } });
      setMessage('Password reset — they must change it on next login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password');
    }
  }

  async function handleStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
    setError('');
    setMessage('');
    try {
      await api(`/admin/users/${id}/status`, { method: 'PATCH', token, body: { status } });
      setMessage('Status updated');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status');
    }
  }

  return (
    <PortalLayout title="Staff">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Staff</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage staff accounts. To change a role, use Users \\u2014 this page focuses on staff records.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">New Staff Account</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Temporary password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Create Staff Account
          </button>
        </form>

        <div className="flex flex-wrap gap-3">
          <input
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Search name, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All staff roles</option>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Department</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && staff.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No staff found</td></tr>
              )}
              {staff.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{s.name}</div>
                    <div className="text-xs text-gray-400">{s.email}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{s.role}</span>
                  </td>
                  <td className="px-4 py-2">{s.department?.name || '—'}</td>
                  <td className="px-4 py-2">{s.status}</td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <button className="text-rgreen text-xs font-medium" onClick={() => handleResetPassword(s.id)}>
                      Reset password
                    </button>
                    {s.status !== 'SUSPENDED' ? (
                      <button
                        className="text-amber-600 text-xs font-medium"
                        onClick={() => handleStatus(s.id, 'SUSPENDED')}
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        className="text-green-600 text-xs font-medium"
                        onClick={() => handleStatus(s.id, 'ACTIVE')}
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}
"""

# ─────────────────────────────────────────────
# ACADEMIC
# ─────────────────────────────────────────────

ADMIN_ACADEMIC_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Fee {
  id: string;
  amount: string;
  effectiveFrom: string;
}

interface Programme {
  id: string;
  name: string;
  level: string | null;
  isShortCourse: boolean;
  fees: Fee[];
}

interface Department {
  id: string;
  name: string;
  programs: Programme[];
}

export default function AdminAcademic() {
  const { token } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [newDeptName, setNewDeptName] = useState('');
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);
  const [newProgName, setNewProgName] = useState('');
  const [newProgLevel, setNewProgLevel] = useState('');
  const [feeAmount, setFeeAmount] = useState<Record<string, string>>({});

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api('/academic/structure', { token });
      setDepartments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load academic structure');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleAddDepartment(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!newDeptName.trim()) return;
    try {
      await api('/admin/departments', { method: 'POST', token, body: { name: newDeptName.trim() } });
      setMessage('Department created');
      setNewDeptName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create department');
    }
  }

  async function handleDeleteDepartment(id: string) {
    setError('');
    setMessage('');
    try {
      await api(`/admin/departments/${id}`, { method: 'DELETE', token });
      setMessage('Department deleted');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete department');
    }
  }

  async function handleAddProgramme(deptId: string) {
    setError('');
    setMessage('');
    if (!newProgName.trim()) return;
    try {
      await api(`/admin/departments/${deptId}/programs`, {
        method: 'POST',
        token,
        body: { name: newProgName.trim(), level: newProgLevel || undefined },
      });
      setMessage('Programme created');
      setNewProgName('');
      setNewProgLevel('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create programme');
    }
  }

  async function handleDeleteProgramme(id: string) {
    setError('');
    setMessage('');
    try {
      await api(`/admin/programs/${id}`, { method: 'DELETE', token });
      setMessage('Programme deleted');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete programme');
    }
  }

  async function handleSetFee(programId: string) {
    setError('');
    setMessage('');
    const amount = feeAmount[programId];
    if (!amount) return;
    try {
      await api(`/admin/programs/${programId}/fee`, { method: 'POST', token, body: { amount: Number(amount) } });
      setMessage('Fee updated');
      setFeeAmount((prev) => ({ ...prev, [programId]: '' }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set fee');
    }
  }

  return (
    <PortalLayout title="Academic Structure">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Academic Structure</h2>
          <p className="text-sm text-gray-500 mt-1">Departments, programmes and fees.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleAddDepartment} className="bg-white border border-gray-200 rounded-lg p-5 flex gap-3">
          <input
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="New department name"
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
          />
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Add Department
          </button>
        </form>

        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        <div className="space-y-3">
          {departments.map((dept) => (
            <div key={dept.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <button
                  className="font-semibold text-gray-900 text-left"
                  onClick={() => setExpandedDeptId(expandedDeptId === dept.id ? null : dept.id)}
                >
                  {dept.name} <span className="text-xs text-gray-400">({dept.programs.length} programmes)</span>
                </button>
                <button className="text-red-600 text-xs font-medium" onClick={() => handleDeleteDepartment(dept.id)}>
                  Delete department
                </button>
              </div>

              {expandedDeptId === dept.id && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                      placeholder="Programme name"
                      value={newProgName}
                      onChange={(e) => setNewProgName(e.target.value)}
                    />
                    <input
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-32"
                      placeholder="Level (optional)"
                      value={newProgLevel}
                      onChange={(e) => setNewProgLevel(e.target.value)}
                    />
                    <button
                      className="bg-rgreen text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                      onClick={() => handleAddProgramme(dept.id)}
                    >
                      Add Programme
                    </button>
                  </div>

                  <table className="w-full text-xs">
                    <thead className="text-gray-500 text-left">
                      <tr>
                        <th className="pr-4 py-1">Programme</th>
                        <th className="pr-4 py-1">Current fee</th>
                        <th className="pr-4 py-1">Set new fee</th>
                        <th className="pr-4 py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dept.programs.map((p) => (
                        <tr key={p.id} className="border-t border-gray-100">
                          <td className="pr-4 py-1">{p.name} {p.level || ''}</td>
                          <td className="pr-4 py-1">{p.fees[0] ? `KES ${p.fees[0].amount}` : '—'}</td>
                          <td className="pr-4 py-1">
                            <div className="flex gap-1">
                              <input
                                className="border border-gray-300 rounded px-2 py-0.5 text-xs w-24"
                                placeholder="Amount"
                                value={feeAmount[p.id] || ''}
                                onChange={(e) => setFeeAmount((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              />
                              <button
                                className="text-rgreen font-medium"
                                onClick={() => handleSetFee(p.id)}
                              >
                                Save
                              </button>
                            </div>
                          </td>
                          <td className="pr-4 py-1">
                            <button
                              className="text-red-600 font-medium"
                              onClick={() => handleDeleteProgramme(p.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </PortalLayout>
  );
}
"""

FILES = {
    os.path.join(PAGES_DIR, "AdminSettings.tsx"): ADMIN_SETTINGS_TSX,
    os.path.join(PAGES_DIR, "AdminAdmissions.tsx"): ADMIN_ADMISSIONS_TSX,
    os.path.join(PAGES_DIR, "AdminLibrary.tsx"): ADMIN_LIBRARY_TSX,
    os.path.join(PAGES_DIR, "AdminStudents.tsx"): ADMIN_STUDENTS_TSX,
    os.path.join(PAGES_DIR, "AdminStaff.tsx"): ADMIN_STAFF_TSX,
    os.path.join(PAGES_DIR, "AdminAcademic.tsx"): ADMIN_ACADEMIC_TSX,
}

APP_NEW_IMPORTS = """import AdminSettings from './pages/admin/AdminSettings';
import AdminAdmissions from './pages/admin/AdminAdmissions';
import AdminLibrary from './pages/admin/AdminLibrary';
import AdminStudents from './pages/admin/AdminStudents';
import AdminStaff from './pages/admin/AdminStaff';
import AdminAcademic from './pages/admin/AdminAcademic';
"""

APP_NEW_ROUTES = """                <Route path="/admin/settings" element={<AdminSettings />} />
                <Route path="/admin/admissions" element={<AdminAdmissions />} />
                <Route path="/admin/library" element={<AdminLibrary />} />
                <Route path="/admin/students" element={<AdminStudents />} />
                <Route path="/admin/staff" element={<AdminStaff />} />
                <Route path="/admin/academic" element={<AdminAcademic />} />
"""


def write_pages(force: bool) -> None:
    os.makedirs(PAGES_DIR, exist_ok=True)
    for path, content in FILES.items():
        if os.path.exists(path) and not force:
            print("SKIP  " + path + " already exists (use --force to overwrite)")
            continue
        with open(path, "w") as f:
            f.write(content)
        print("WROTE " + path)


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def patch_app() -> None:
    if not os.path.isfile(APP_PATH):
        print("ERROR: '" + APP_PATH + "' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)
    with open(APP_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "AdminSettings" in joined:
        print("SKIP  " + APP_PATH + " already patched.")
        return

    import_idx = find_line_index(lines, "AdminPortal from './pages/portal/AdminPortal'")
    if import_idx is None:
        import_idx = find_line_index(lines, "AdminPortal")
    if import_idx is None:
        print("ERROR: could not find an anchor import line in " + APP_PATH + ". Patch manually.")
        sys.exit(1)

    route_idx = find_line_index(lines, '"/admin"')
    if route_idx is None:
        print("ERROR: could not find the /admin route in " + APP_PATH + ". Patch manually.")
        sys.exit(1)

    if route_idx > import_idx:
        lines2 = lines[: route_idx + 1] + [APP_NEW_ROUTES] + lines[route_idx + 1 :]
        lines3 = lines2[: import_idx + 1] + [APP_NEW_IMPORTS] + lines2[import_idx + 1 :]
    else:
        lines2 = lines[: import_idx + 1] + [APP_NEW_IMPORTS] + lines[import_idx + 1 :]
        route_idx2 = find_line_index(lines2, '"/admin"')
        lines3 = lines2[: route_idx2 + 1] + [APP_NEW_ROUTES] + lines2[route_idx2 + 1 :]

    with open(APP_PATH, "w") as f:
        f.writelines(lines3)
    print("PATCHED " + APP_PATH + " (added 6 imports + 6 routes)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    write_pages(args.force)
    patch_app()

    print("")
    print("Done. Review with: git diff src/App.tsx")
    print("New files: git status")


if __name__ == "__main__":
    main()
