#!/usr/bin/env python3
"""
Generates frontend pages for Alumni, Workers self-service, and Procurement.

Creates:
  src/pages/portal/AlumniPortal.tsx        -> alumnus's own dashboard/profile
  src/pages/admin/AdminAlumni.tsx          -> Registrar/Admin: graduate students, list alumni
  src/pages/portal/WorkersPortal.tsx       -> any staff: own StaffProfile + leave requests
  src/pages/portal/ProcurementPortal.tsx   -> procurement dashboard
  src/pages/procurement/ProcurementRequests.tsx -> submit/track requests; approve if
                                                    PROCUREMENT_OFFICER/ADMIN

Patches:
  src/components/portal/PortalLayout.tsx  -> adds ALUMNI + PROCUREMENT_OFFICER nav sections,
                                              adds Alumni link to ADMIN nav, adds a shared
                                              "My Work" self-service link for all staff roles
  src/pages/PortalRedirect.tsx            -> redirect cases for ALUMNI, PROCUREMENT_OFFICER
  src/App.tsx                             -> imports + routes for all new pages

Requires patch_hr_self_service.py to have been run in the backend (Workers
page calls GET /hr/my-staff-profile).

USAGE (run from ~/runyenjes-platform/frontend):
    python3 generate_alumni_workers_procurement.py

Idempotent: skips existing files (use --force to overwrite), skips patches
already applied.
"""

import argparse
import os
import sys

PAGES_DIR = os.path.join("src", "pages")
LAYOUT_PATH = os.path.join("src", "components", "portal", "PortalLayout.tsx")
REDIRECT_PATH = os.path.join(PAGES_DIR, "PortalRedirect.tsx")
APP_PATH = os.path.join("src", "App.tsx")

# ─────────────────────────────────────────────
# ALUMNI
# ─────────────────────────────────────────────

ALUMNI_PORTAL_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface AlumniProfile {
  graduationYear: number | null;
  currentEmployer: string | null;
  currentPosition: string | null;
}

export default function AlumniPortal() {
  const { token } = useAuth();
  const [profile, setProfile] = useState<AlumniProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [currentEmployer, setCurrentEmployer] = useState('');
  const [currentPosition, setCurrentPosition] = useState('');

  useEffect(() => {
    if (!token) return;
    api('/alumni/profile', { token })
      .then((data) => {
        setProfile(data);
        setCurrentEmployer(data.currentEmployer || '');
        setCurrentPosition(data.currentPosition || '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your profile'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const updated = await api('/alumni/profile', {
        method: 'PATCH',
        token,
        body: { currentEmployer, currentPosition },
      });
      setProfile(updated);
      setMessage('Profile updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update profile');
    }
  }

  return (
    <PortalLayout title="Alumni Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Alumni Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Your graduation record and current details.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        {!loading && profile && (
          <>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <p className="text-sm text-gray-500">Graduation Year</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{profile.graduationYear || '—'}</p>
            </div>

            <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
              <h3 className="font-semibold text-gray-900">Update Current Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Current employer"
                  value={currentEmployer}
                  onChange={(e) => setCurrentEmployer(e.target.value)}
                />
                <input
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Current position"
                  value={currentPosition}
                  onChange={(e) => setCurrentPosition(e.target.value)}
                />
              </div>
              <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
                Save
              </button>
            </form>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
"""

ADMIN_ALUMNI_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface AlumniRow {
  id: string;
  graduationYear: number | null;
  currentEmployer: string | null;
  currentPosition: string | null;
  user: { id: string; name: string; email: string; admissionNumber: string | null };
}

export default function AdminAlumni() {
  const { token } = useAuth();
  const [alumni, setAlumni] = useState<AlumniRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [studentId, setStudentId] = useState('');
  const [graduationYear, setGraduationYear] = useState(String(new Date().getFullYear()));

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api('/alumni', { token });
      setAlumni(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load alumni');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleGraduate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!studentId) {
      setError('Student ID is required');
      return;
    }
    try {
      await api(`/alumni/graduate/${studentId.trim()}`, {
        method: 'POST',
        token,
        body: { graduationYear: Number(graduationYear) },
      });
      setMessage('Student graduated to Alumni');
      setStudentId('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not graduate student');
    }
  }

  return (
    <PortalLayout title="Alumni">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Alumni</h2>
          <p className="text-sm text-gray-500 mt-1">
            Graduate a student to convert their account to Alumni \\u2014 their history stays intact.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleGraduate} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">Graduate a Student</h3>
          <p className="text-xs text-gray-400">
            Student ID is the student's account ID (find it in Admin &gt; Students).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Student ID"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Graduation year"
              type="number"
              value={graduationYear}
              onChange={(e) => setGraduationYear(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Graduate to Alumni
          </button>
        </form>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Admission #</th>
                <th className="px-4 py-2">Graduation Year</th>
                <th className="px-4 py-2">Employer</th>
                <th className="px-4 py-2">Position</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && alumni.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No alumni yet</td></tr>
              )}
              {alumni.map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{a.user?.name}</td>
                  <td className="px-4 py-2">{a.user?.admissionNumber || '—'}</td>
                  <td className="px-4 py-2">{a.graduationYear || '—'}</td>
                  <td className="px-4 py-2">{a.currentEmployer || '—'}</td>
                  <td className="px-4 py-2">{a.currentPosition || '—'}</td>
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
# WORKERS SELF-SERVICE
# ─────────────────────────────────────────────

WORKERS_PORTAL_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface StaffProfile {
  employeeNumber: string | null;
  position: string | null;
  employmentType: string;
  status: string;
  dateHired: string | null;
}

interface LeaveRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  reason: string | null;
}

export default function WorkersPortal() {
  const { token } = useAuth();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [leaveType, setLeaveType] = useState('ANNUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [profileData, leaveData] = await Promise.all([
        api('/hr/my-staff-profile', { token }).catch(() => null),
        api('/hr/my-leave-requests', { token }),
      ]);
      setProfile(profileData);
      setLeaveRequests(leaveData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your work info');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleRequestLeave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!startDate || !endDate) {
      setError('Start and end dates are required');
      return;
    }
    try {
      await api('/hr/leave-requests', {
        method: 'POST',
        token,
        body: { type: leaveType, startDate, endDate, reason: reason || undefined },
      });
      setMessage('Leave request submitted');
      setStartDate('');
      setEndDate('');
      setReason('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit leave request');
    }
  }

  return (
    <PortalLayout title="My Work">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Work</h2>
          <p className="text-sm text-gray-500 mt-1">Your staff profile and leave requests.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        {!loading && (
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="font-semibold text-gray-900 mb-3">My Staff Profile</h3>
            {profile ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Employee #</p>
                  <p className="font-medium">{profile.employeeNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Position</p>
                  <p className="font-medium">{profile.position || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Employment</p>
                  <p className="font-medium">{profile.employmentType}</p>
                </div>
                <div>
                  <p className="text-gray-500">Status</p>
                  <p className="font-medium">{profile.status}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                No staff profile has been set up for your account yet \\u2014 ask HR to create one.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleRequestLeave} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">Request Leave</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
            >
              <option value="ANNUAL">Annual</option>
              <option value="SICK">Sick</option>
              <option value="MATERNITY">Maternity</option>
              <option value="PATERNITY">Paternity</option>
              <option value="UNPAID">Unpaid</option>
              <option value="OTHER">Other</option>
            </select>
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Submit Request
          </button>
        </form>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900 text-sm">
            My Leave Requests
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Dates</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {leaveRequests.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">No leave requests yet</td></tr>
              )}
              {leaveRequests.map((l) => (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{l.type}</td>
                  <td className="px-4 py-2">
                    {new Date(l.startDate).toLocaleDateString()} \\u2192 {new Date(l.endDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{l.status}</span>
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
# PROCUREMENT
# ─────────────────────────────────────────────

PROCUREMENT_PORTAL_TSX = """import { useNavigate } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';

export default function ProcurementPortal() {
  const navigate = useNavigate();

  const cards = [
    {
      title: 'Purchase Requests',
      description: 'Request items from Stores, or review and approve requests from staff.',
      action: () => navigate('/procurement/requests'),
      icon: '\\ud83d\\udcc4',
    },
  ];

  return (
    <PortalLayout title="Procurement Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Procurement Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Purchase requests, connected to Stores inventory.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cards.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={card.action}
              className="bg-white border border-gray-200 rounded-lg p-5 text-left hover:border-rgreen hover:shadow-sm transition"
            >
              <div className="flex items-start gap-4">
                <div className="text-2xl">{card.icon}</div>
                <div>
                  <h3 className="font-semibold text-gray-900">{card.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{card.description}</p>
                  <p className="text-sm text-rgreen font-medium mt-3">Open \\u2192</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </PortalLayout>
  );
}
"""

PROCUREMENT_REQUESTS_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Item {
  id: string;
  name: string;
  uom: string;
  quantityOnHand: string;
}

interface PurchaseRequest {
  id: string;
  quantity: string;
  justification: string | null;
  status: string;
  item: { id: string; name: string; uom: string };
  requestedBy?: { id: string; name: string };
}

const MANAGE_ROLES = ['PROCUREMENT_OFFICER', 'ADMIN'];

export default function ProcurementRequests() {
  const { token, user } = useAuth();
  const canManage = user ? MANAGE_ROLES.includes(user.role) : false;

  const [items, setItems] = useState<Item[]>([]);
  const [myRequests, setMyRequests] = useState<PurchaseRequest[]>([]);
  const [allRequests, setAllRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [justification, setJustification] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const calls: Promise<any>[] = [
        api('/stores/items-lite', { token }),
        api('/procurement/my-requests', { token }),
      ];
      if (canManage) calls.push(api('/procurement/requests', { token }));
      const results = await Promise.all(calls);
      setItems(results[0]);
      setMyRequests(results[1]);
      if (canManage) setAllRequests(results[2]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load procurement data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!itemId || !quantity) {
      setError('Item and quantity are required');
      return;
    }
    try {
      await api('/procurement/requests', {
        method: 'POST',
        token,
        body: { itemId, quantity: Number(quantity), justification: justification || undefined },
      });
      setMessage('Purchase request submitted');
      setItemId('');
      setQuantity('');
      setJustification('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit request');
    }
  }

  async function handleStatus(id: string, status: 'APPROVED' | 'REJECTED' | 'ORDERED' | 'RECEIVED') {
    setError('');
    setMessage('');
    try {
      await api(`/procurement/requests/${id}/status`, { method: 'PATCH', token, body: { status } });
      setMessage(
        status === 'RECEIVED' ? 'Marked received \\u2014 Stores stock updated' : `Request ${status.toLowerCase()}`
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update request');
    }
  }

  return (
    <PortalLayout title="Purchase Requests">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Purchase Requests</h2>
          <p className="text-sm text-gray-500 mt-1">
            Requests reference existing Stores items \\u2014 marking one received restocks it automatically.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleSubmitRequest} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">New Purchase Request</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
            >
              <option value="">{loading ? 'Loading items...' : 'Select an item'}</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name} ({it.quantityOnHand} {it.uom} on hand)
                </option>
              ))}
            </select>
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Justification (optional)"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Submit Request
          </button>
        </form>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900 text-sm">My Requests</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2">Quantity</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {myRequests.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">No requests yet</td></tr>
              )}
              {myRequests.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{r.item?.name}</td>
                  <td className="px-4 py-2">{r.quantity} {r.item?.uom}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canManage && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900 text-sm">
              All Requests (Procurement Management)
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-2">Requested By</th>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Quantity</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {allRequests.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No requests yet</td></tr>
                )}
                {allRequests.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{r.requestedBy?.name}</td>
                    <td className="px-4 py-2">{r.item?.name}</td>
                    <td className="px-4 py-2">{r.quantity} {r.item?.uom}</td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{r.status}</span>
                    </td>
                    <td className="px-4 py-2 text-right space-x-2">
                      {r.status === 'PENDING' && (
                        <>
                          <button
                            className="text-green-600 text-xs font-medium"
                            onClick={() => handleStatus(r.id, 'APPROVED')}
                          >
                            Approve
                          </button>
                          <button
                            className="text-red-600 text-xs font-medium"
                            onClick={() => handleStatus(r.id, 'REJECTED')}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {r.status === 'APPROVED' && (
                        <button
                          className="text-rgreen text-xs font-medium"
                          onClick={() => handleStatus(r.id, 'ORDERED')}
                        >
                          Mark Ordered
                        </button>
                      )}
                      {r.status === 'ORDERED' && (
                        <button
                          className="text-rgreen text-xs font-medium"
                          onClick={() => handleStatus(r.id, 'RECEIVED')}
                        >
                          Mark Received
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
"""

FILES = {
    os.path.join(PAGES_DIR, "portal", "AlumniPortal.tsx"): ALUMNI_PORTAL_TSX,
    os.path.join(PAGES_DIR, "admin", "AdminAlumni.tsx"): ADMIN_ALUMNI_TSX,
    os.path.join(PAGES_DIR, "portal", "WorkersPortal.tsx"): WORKERS_PORTAL_TSX,
    os.path.join(PAGES_DIR, "portal", "ProcurementPortal.tsx"): PROCUREMENT_PORTAL_TSX,
    os.path.join(PAGES_DIR, "procurement", "ProcurementRequests.tsx"): PROCUREMENT_REQUESTS_TSX,
}


def find_line_index(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return None


def find_block_close(lines, open_idx, close_str="};"):
    for i in range(open_idx + 1, len(lines)):
        if lines[i].strip() == close_str:
            return i
    return None


def write_pages(force: bool) -> None:
    for path, content in FILES.items():
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if os.path.exists(path) and not force:
            print("SKIP  " + path + " already exists (use --force to overwrite)")
            continue
        with open(path, "w") as f:
            f.write(content)
        print("WROTE " + path)


NEW_ROLE_SECTIONS = """
  ALUMNI: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/alumni', icon: '\u2302' }],
    },
  ],

  PROCUREMENT_OFFICER: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/procurement', icon: '\u2302' }],
    },
    {
      title: 'Procurement',
      items: [{ label: 'Purchase Requests', path: '/procurement/requests', icon: '\U0001f4c4' }],
    },
  ],
"""

STAFF_SELF_SERVICE_CONST = """
const STAFF_SELF_SERVICE_ROLES = [
  'TEACHER',
  'REGISTRAR',
  'ADMIN',
  'FINANCE_OFFICER',
  'HR_OFFICER',
  'EXAM_OFFICER',
  'STORES_OFFICER',
  'PROCUREMENT_OFFICER',
];
"""


def patch_layout() -> None:
    if not os.path.isfile(LAYOUT_PATH):
        print("ERROR: '" + LAYOUT_PATH + "' not found.")
        sys.exit(1)
    with open(LAYOUT_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "PROCUREMENT_OFFICER:" in joined:
        print("SKIP  " + LAYOUT_PATH + " already patched (role sections).")
    else:
        admin_idx = find_line_index(lines, "ADMIN: [")
        if admin_idx is None:
            print("ERROR: could not find 'ADMIN: [' in " + LAYOUT_PATH + ". Patch manually.")
            sys.exit(1)
        close_idx = None
        for i in range(admin_idx, len(lines)):
            if lines[i].strip() == "};":
                close_idx = i
                break
        if close_idx is None:
            print("ERROR: could not find closing '};' after ADMIN block. Patch manually.")
            sys.exit(1)
        lines = lines[:close_idx] + [NEW_ROLE_SECTIONS] + lines[close_idx:]
        print("PATCHED " + LAYOUT_PATH + " (added ALUMNI + PROCUREMENT_OFFICER nav sections)")

    joined = "".join(lines)
    if "STAFF_SELF_SERVICE_ROLES" in joined:
        print("SKIP  " + LAYOUT_PATH + " already patched (self-service const/injection).")
    else:
        # Insert the const right before "export default function PortalLayout"
        export_idx = find_line_index(lines, "export default function PortalLayout")
        if export_idx is None:
            print("ERROR: could not find PortalLayout export in " + LAYOUT_PATH + ". Patch manually.")
            sys.exit(1)
        lines = lines[:export_idx] + [STAFF_SELF_SERVICE_CONST, "\n"] + lines[export_idx:]

        # Find the "const sections: NavSection[] = [" block and inject before "...commonSections,"
        sections_idx = find_line_index(lines, "const sections: NavSection[] = [")
        if sections_idx is None:
            print("ERROR: could not find sections assembly in " + LAYOUT_PATH + ". Patch manually.")
            sys.exit(1)
        common_idx = find_line_index(lines, "...commonSections,", start=sections_idx)
        if common_idx is None:
            print("ERROR: could not find '...commonSections,' in " + LAYOUT_PATH + ". Patch manually.")
            sys.exit(1)
        injection = (
            "    ...(STAFF_SELF_SERVICE_ROLES.includes(user.role)\n"
            "      ? [{ title: 'My Work', items: [{ label: 'Staff Self-Service', path: '/workers', icon: '\U0001f9fe' }] }]\n"
            "      : []),\n"
        )
        lines = lines[:common_idx] + [injection] + lines[common_idx:]
        print("PATCHED " + LAYOUT_PATH + " (added shared 'My Work' self-service link for staff roles)")

    with open(LAYOUT_PATH, "w") as f:
        f.writelines(lines)


REDIRECT_NEW_CASES = """
    case 'ALUMNI':
      return <Navigate to="/alumni" replace />;

    case 'PROCUREMENT_OFFICER':
      return <Navigate to="/procurement" replace />;
"""


def patch_redirect() -> None:
    if not os.path.isfile(REDIRECT_PATH):
        print("ERROR: '" + REDIRECT_PATH + "' not found.")
        sys.exit(1)
    with open(REDIRECT_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "ALUMNI" in joined:
        print("SKIP  " + REDIRECT_PATH + " already patched.")
        return

    default_idx = find_line_index(lines, "default:")
    if default_idx is None:
        print("ERROR: could not find 'default:' in " + REDIRECT_PATH + ". Patch manually.")
        sys.exit(1)

    lines = lines[:default_idx] + [REDIRECT_NEW_CASES] + lines[default_idx:]
    with open(REDIRECT_PATH, "w") as f:
        f.writelines(lines)
    print("PATCHED " + REDIRECT_PATH + " (added ALUMNI + PROCUREMENT_OFFICER redirects)")


APP_NEW_IMPORTS = """import AlumniPortal from './pages/portal/AlumniPortal';
import AdminAlumni from './pages/admin/AdminAlumni';
import WorkersPortal from './pages/portal/WorkersPortal';
import ProcurementPortal from './pages/portal/ProcurementPortal';
import ProcurementRequests from './pages/procurement/ProcurementRequests';
"""

APP_NEW_ROUTES = """                <Route path="/alumni" element={<AlumniPortal />} />
                <Route path="/admin/alumni" element={<AdminAlumni />} />
                <Route path="/workers" element={<WorkersPortal />} />
                <Route path="/procurement" element={<ProcurementPortal />} />
                <Route path="/procurement/requests" element={<ProcurementRequests />} />
"""


def patch_app() -> None:
    if not os.path.isfile(APP_PATH):
        print("ERROR: '" + APP_PATH + "' not found.")
        sys.exit(1)
    with open(APP_PATH, "r") as f:
        lines = f.readlines()
    joined = "".join(lines)
    if "AlumniPortal" in joined:
        print("SKIP  " + APP_PATH + " already patched.")
        return

    import_idx = find_line_index(lines, "AdminPortal from './pages/portal/AdminPortal'")
    if import_idx is None:
        import_idx = find_line_index(lines, "AdminPortal")
    if import_idx is None:
        print("ERROR: could not find an anchor import in " + APP_PATH + ". Patch manually.")
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
    print("PATCHED " + APP_PATH + " (added 5 imports + 5 routes)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    write_pages(args.force)
    patch_layout()
    patch_redirect()
    patch_app()

    print("")
    print("Done. Review with:")
    print("  git diff src/App.tsx src/pages/PortalRedirect.tsx src/components/portal/PortalLayout.tsx")


if __name__ == "__main__":
    main()
