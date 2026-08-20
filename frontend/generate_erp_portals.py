#!/usr/bin/env python3
"""
Generates frontend pages for the four new ERP roles (Finance, HR,
Examinations, Stores) plus a real Admin Users page for granting/revoking
roles, matching the existing Registrar portal pattern.

Creates:
  src/pages/portal/FinancePortal.tsx
  src/pages/finance/FinanceInvoices.tsx
  src/pages/portal/HrPortal.tsx
  src/pages/hr/HrStaff.tsx
  src/pages/portal/ExaminationsPortal.tsx
  src/pages/examinations/ExaminationsResults.tsx
  src/pages/portal/StoresPortal.tsx
  src/pages/stores/StoresInventory.tsx
  src/pages/admin/AdminUsers.tsx

Patches:
  src/components/portal/PortalLayout.tsx  (fixes broken Staff icon string,
                                            adds nav sections for the 4 new roles)
  src/pages/PortalRedirect.tsx            (adds redirect cases for the 4 new roles)
  src/App.tsx                             (adds imports + routes for all new pages)

NOTE: AdminUsers.tsx calls PATCH /admin/users/:id/role and allows creating
users with the new ERP roles. Those backend endpoints only exist after you
run patch_admin_roles.py in the backend. Run that first if you haven't.

USAGE (run from ~/runyenjes-platform/frontend):
    python3 generate_erp_portals.py

Idempotent: skips any file that already exists (use --force to overwrite),
and skips a patch if it detects the target was already patched.
"""

import argparse
import os
import sys

PAGES_DIR = os.path.join("src", "pages")
LAYOUT_PATH = os.path.join("src", "components", "portal", "PortalLayout.tsx")
REDIRECT_PATH = os.path.join(PAGES_DIR, "PortalRedirect.tsx")
APP_PATH = os.path.join("src", "App.tsx")

# ─────────────────────────────────────────────
# FINANCE
# ─────────────────────────────────────────────

FINANCE_PORTAL_TSX = """import { useNavigate } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';

export default function FinancePortal() {
  const navigate = useNavigate();

  const cards = [
    {
      title: 'Invoices & Payments',
      description: 'Bill students for a term and record payments against their invoices.',
      action: () => navigate('/finance/invoices'),
      icon: '\\ud83d\\udcb0',
    },
  ];

  return (
    <PortalLayout title="Finance Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Finance Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Fees, invoices and payments workspace.</p>
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

FINANCE_INVOICES_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Payment {
  id: string;
  amount: string;
  method: string;
  paidAt: string;
}

interface Invoice {
  id: string;
  description: string;
  amount: string;
  status: string;
  dueDate: string | null;
  student: { id: string; name: string; email: string; admissionNumber: string | null };
  term: { id: string; name: string };
  payments: Payment[];
}

export default function FinanceInvoices() {
  const { token } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [activeTermId, setActiveTermId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [studentId, setStudentId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payReference, setPayReference] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [invoiceData, term] = await Promise.all([
        api('/finance/invoices', { token }),
        api('/terms/active').catch(() => null),
      ]);
      setInvoices(invoiceData);
      if (term?.id) setActiveTermId(term.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load invoices');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!studentId || !description || !amount) {
      setError('Student ID, description and amount are required');
      return;
    }
    if (!activeTermId) {
      setError('No active term is open right now — open one from Registrar > Terms first');
      return;
    }
    try {
      await api('/finance/invoices', {
        method: 'POST',
        token,
        body: {
          studentId: studentId.trim(),
          termId: activeTermId,
          description,
          amount: Number(amount),
          dueDate: dueDate || undefined,
        },
      });
      setMessage('Invoice created');
      setStudentId('');
      setDescription('');
      setAmount('');
      setDueDate('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create invoice');
    }
  }

  async function handleRecordPayment(invoiceId: string) {
    setError('');
    setMessage('');
    if (!payAmount || !payMethod) {
      setError('Payment amount and method are required');
      return;
    }
    try {
      await api(`/finance/invoices/${invoiceId}/payments`, {
        method: 'POST',
        token,
        body: { amount: Number(payAmount), method: payMethod, reference: payReference || undefined },
      });
      setMessage('Payment recorded');
      setPayingId(null);
      setPayAmount('');
      setPayMethod('CASH');
      setPayReference('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment');
    }
  }

  return (
    <PortalLayout title="Invoices & Payments">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Invoices & Payments</h2>
          <p className="text-sm text-gray-500 mt-1">
            Bill a student for the active term, then record payments as they come in.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleCreateInvoice} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">New Invoice</h3>
          <p className="text-xs text-gray-400">
            Student ID is the student's account ID (ask Registrar/Admin for it, or pull it from Admin &gt; Users).
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
              placeholder="Amount (KES)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2"
              placeholder="Description (e.g. Term 2 tuition fee)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Create Invoice
          </button>
        </form>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Student</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Paid</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">Loading...</td>
                </tr>
              )}
              {!loading && invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">No invoices yet</td>
                </tr>
              )}
              {invoices.map((inv) => {
                const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
                return (
                  <>
                    <tr key={inv.id} className="border-t border-gray-100">
                      <td className="px-4 py-2">{inv.student?.name}</td>
                      <td className="px-4 py-2">{inv.description}</td>
                      <td className="px-4 py-2">{inv.amount}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{inv.status}</span>
                      </td>
                      <td className="px-4 py-2">{paid}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          className="text-rgreen text-xs font-medium"
                          onClick={() => setPayingId(payingId === inv.id ? null : inv.id)}
                        >
                          {payingId === inv.id ? 'Cancel' : 'Record payment'}
                        </button>
                      </td>
                    </tr>
                    {payingId === inv.id && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="flex flex-wrap gap-2 items-center">
                            <input
                              className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-32"
                              placeholder="Amount"
                              type="number"
                              value={payAmount}
                              onChange={(e) => setPayAmount(e.target.value)}
                            />
                            <select
                              className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                              value={payMethod}
                              onChange={(e) => setPayMethod(e.target.value)}
                            >
                              <option value="CASH">Cash</option>
                              <option value="MPESA">M-Pesa</option>
                              <option value="BANK">Bank</option>
                              <option value="CHEQUE">Cheque</option>
                              <option value="OTHER">Other</option>
                            </select>
                            <input
                              className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-40"
                              placeholder="Reference (optional)"
                              value={payReference}
                              onChange={(e) => setPayReference(e.target.value)}
                            />
                            <button
                              className="bg-rgreen text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                              onClick={() => handleRecordPayment(inv.id)}
                            >
                              Save Payment
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}
"""

# ─────────────────────────────────────────────
# HR
# ─────────────────────────────────────────────

HR_PORTAL_TSX = """import { useNavigate } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';

export default function HrPortal() {
  const navigate = useNavigate();

  const cards = [
    {
      title: 'Staff & Leave',
      description: 'Manage staff profiles and review/approve leave requests.',
      action: () => navigate('/hr/staff'),
      icon: '\\ud83d\\udc65',
    },
  ];

  return (
    <PortalLayout title="HR Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">HR Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Staff records and leave management workspace.</p>
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

HR_STAFF_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface StaffProfile {
  id: string;
  employeeNumber: string | null;
  position: string | null;
  employmentType: string;
  status: string;
  user: { id: string; name: string; email: string; role: string };
}

interface LeaveRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  staff: { id: string; name: string; email: string };
}

export default function HrStaff() {
  const { token } = useAuth();
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [userId, setUserId] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [position, setPosition] = useState('');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [staffData, leaveData] = await Promise.all([
        api('/hr/staff', { token }),
        api('/hr/leave-requests', { token }),
      ]);
      setStaff(staffData);
      setLeave(leaveData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load HR data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!userId) {
      setError('User ID is required');
      return;
    }
    try {
      await api('/hr/staff', {
        method: 'POST',
        token,
        body: {
          userId: userId.trim(),
          employeeNumber: employeeNumber || undefined,
          position: position || undefined,
          employmentType,
        },
      });
      setMessage('Staff profile created');
      setUserId('');
      setEmployeeNumber('');
      setPosition('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create staff profile');
    }
  }

  async function handleDecision(id: string, decision: 'APPROVED' | 'REJECTED') {
    setError('');
    try {
      await api(`/hr/leave-requests/${id}/decision`, { method: 'PATCH', token, body: { decision } });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update leave request');
    }
  }

  return (
    <PortalLayout title="Staff & Leave">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Staff & Leave</h2>
          <p className="text-sm text-gray-500 mt-1">Staff profiles and leave request approvals.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleCreateStaff} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">New Staff Profile</h3>
          <p className="text-xs text-gray-400">
            User ID is the staff member's account ID (create the account in Admin &gt; Users first).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="User ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Employee number (optional)"
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Position (optional)"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
            >
              <option value="FULL_TIME">Full time</option>
              <option value="PART_TIME">Part time</option>
              <option value="CONTRACT">Contract</option>
            </select>
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Create Staff Profile
          </button>
        </form>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900 text-sm">Staff Profiles</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Employee #</th>
                <th className="px-4 py-2">Position</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && staff.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No staff profiles yet</td></tr>
              )}
              {staff.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{s.user?.name}</td>
                  <td className="px-4 py-2">{s.employeeNumber || '—'}</td>
                  <td className="px-4 py-2">{s.position || '—'}</td>
                  <td className="px-4 py-2">{s.employmentType}</td>
                  <td className="px-4 py-2">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900 text-sm">Leave Requests</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Staff</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Dates</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {leave.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No leave requests</td></tr>
              )}
              {leave.map((l) => (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{l.staff?.name}</td>
                  <td className="px-4 py-2">{l.type}</td>
                  <td className="px-4 py-2">
                    {new Date(l.startDate).toLocaleDateString()} \\u2192 {new Date(l.endDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">{l.status}</td>
                  <td className="px-4 py-2 text-right space-x-2">
                    {l.status === 'PENDING' && (
                      <>
                        <button
                          className="text-green-600 text-xs font-medium"
                          onClick={() => handleDecision(l.id, 'APPROVED')}
                        >
                          Approve
                        </button>
                        <button
                          className="text-red-600 text-xs font-medium"
                          onClick={() => handleDecision(l.id, 'REJECTED')}
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
# EXAMINATIONS
# ─────────────────────────────────────────────

EXAMINATIONS_PORTAL_TSX = """import { useNavigate } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';

export default function ExaminationsPortal() {
  const navigate = useNavigate();

  const cards = [
    {
      title: 'Exams & Results',
      description: 'Create exams for a unit and record student scores.',
      action: () => navigate('/examinations/results'),
      icon: '\\ud83d\\udcca',
    },
  ];

  return (
    <PortalLayout title="Examinations Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Examinations Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Exams, CATs and results workspace.</p>
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

EXAMINATIONS_RESULTS_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface ExamResult {
  id: string;
  score: string;
  grade: string | null;
  student: { id: string; name: string; admissionNumber: string | null };
}

interface Exam {
  id: string;
  name: string;
  maxScore: string;
  unit: { id: string; name: string };
  term: { id: string; name: string };
}

export default function ExaminationsResults() {
  const { token } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [activeTermId, setActiveTermId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [unitId, setUnitId] = useState('');
  const [examName, setExamName] = useState('');
  const [maxScore, setMaxScore] = useState('100');

  const [openExamId, setOpenExamId] = useState<string | null>(null);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [studentId, setStudentId] = useState('');
  const [score, setScore] = useState('');
  const [grade, setGrade] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [examData, term] = await Promise.all([
        api('/examinations/exams', { token }),
        api('/terms/active').catch(() => null),
      ]);
      setExams(examData);
      if (term?.id) setActiveTermId(term.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load exams');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCreateExam(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!unitId || !examName) {
      setError('Unit ID and exam name are required');
      return;
    }
    if (!activeTermId) {
      setError('No active term is open right now');
      return;
    }
    try {
      await api('/examinations/exams', {
        method: 'POST',
        token,
        body: { unitId: unitId.trim(), termId: activeTermId, name: examName, maxScore: Number(maxScore) || 100 },
      });
      setMessage('Exam created');
      setUnitId('');
      setExamName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create exam');
    }
  }

  async function openExam(examId: string) {
    if (openExamId === examId) {
      setOpenExamId(null);
      return;
    }
    setOpenExamId(examId);
    try {
      const data = await api(`/examinations/exams/${examId}/results`, { token });
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load results');
    }
  }

  async function handleRecordResult(examId: string) {
    setError('');
    setMessage('');
    if (!studentId || !score) {
      setError('Student ID and score are required');
      return;
    }
    try {
      await api(`/examinations/exams/${examId}/results`, {
        method: 'POST',
        token,
        body: { studentId: studentId.trim(), score: Number(score), grade: grade || undefined },
      });
      setMessage('Result recorded');
      setStudentId('');
      setScore('');
      setGrade('');
      const data = await api(`/examinations/exams/${examId}/results`, { token });
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record result');
    }
  }

  return (
    <PortalLayout title="Exams & Results">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Exams & Results</h2>
          <p className="text-sm text-gray-500 mt-1">Create exams for a unit and record student scores.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleCreateExam} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">New Exam</h3>
          <p className="text-xs text-gray-400">
            Unit ID is the course unit's ID (find it in Registrar &gt; Programmes &gt; unit list).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Unit ID"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Exam name (e.g. CAT 1)"
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Max score"
              type="number"
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Create Exam
          </button>
        </form>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Exam</th>
                <th className="px-4 py-2">Unit</th>
                <th className="px-4 py-2">Term</th>
                <th className="px-4 py-2">Max Score</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && exams.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No exams yet</td></tr>
              )}
              {exams.map((exam) => (
                <>
                  <tr key={exam.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{exam.name}</td>
                    <td className="px-4 py-2">{exam.unit?.name}</td>
                    <td className="px-4 py-2">{exam.term?.name}</td>
                    <td className="px-4 py-2">{exam.maxScore}</td>
                    <td className="px-4 py-2 text-right">
                      <button className="text-rgreen text-xs font-medium" onClick={() => openExam(exam.id)}>
                        {openExamId === exam.id ? 'Close' : 'Results'}
                      </button>
                    </td>
                  </tr>
                  {openExamId === exam.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex flex-wrap gap-2 items-center mb-3">
                          <input
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-48"
                            placeholder="Student ID"
                            value={studentId}
                            onChange={(e) => setStudentId(e.target.value)}
                          />
                          <input
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-24"
                            placeholder="Score"
                            type="number"
                            value={score}
                            onChange={(e) => setScore(e.target.value)}
                          />
                          <input
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-24"
                            placeholder="Grade"
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                          />
                          <button
                            className="bg-rgreen text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                            onClick={() => handleRecordResult(exam.id)}
                          >
                            Save Result
                          </button>
                        </div>
                        <table className="w-full text-xs">
                          <thead className="text-gray-500 text-left">
                            <tr>
                              <th className="pr-4 py-1">Student</th>
                              <th className="pr-4 py-1">Score</th>
                              <th className="pr-4 py-1">Grade</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.map((r) => (
                              <tr key={r.id} className="border-t border-gray-200">
                                <td className="pr-4 py-1">{r.student?.name}</td>
                                <td className="pr-4 py-1">{r.score}</td>
                                <td className="pr-4 py-1">{r.grade || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
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
# STORES
# ─────────────────────────────────────────────

STORES_PORTAL_TSX = """import { useNavigate } from 'react-router-dom';
import PortalLayout from '../../components/portal/PortalLayout';

export default function StoresPortal() {
  const navigate = useNavigate();

  const cards = [
    {
      title: 'Inventory',
      description: 'Manage stock items and record receipts, issues and adjustments.',
      action: () => navigate('/stores/items'),
      icon: '\\ud83d\\udce6',
    },
  ];

  return (
    <PortalLayout title="Stores Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Stores Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Stock and inventory workspace.</p>
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

STORES_INVENTORY_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface InventoryItem {
  id: string;
  name: string;
  category: string | null;
  uom: string;
  quantityOnHand: string;
  reorderLevel: string;
}

export default function StoresInventory() {
  const { token } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [uom, setUom] = useState('pcs');
  const [reorderLevel, setReorderLevel] = useState('0');

  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveType, setMoveType] = useState('RECEIPT');
  const [moveQty, setMoveQty] = useState('');
  const [moveReason, setMoveReason] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api('/stores/items', { token });
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load inventory');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!name) {
      setError('Item name is required');
      return;
    }
    try {
      await api('/stores/items', {
        method: 'POST',
        token,
        body: { name, category: category || undefined, uom, reorderLevel: Number(reorderLevel) || 0 },
      });
      setMessage('Item created');
      setName('');
      setCategory('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create item');
    }
  }

  async function handleMovement(itemId: string) {
    setError('');
    setMessage('');
    if (!moveQty) {
      setError('Quantity is required');
      return;
    }
    try {
      await api(`/stores/items/${itemId}/movements`, {
        method: 'POST',
        token,
        body: { type: moveType, quantity: Number(moveQty), reason: moveReason || undefined },
      });
      setMessage('Movement recorded');
      setMovingId(null);
      setMoveQty('');
      setMoveReason('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record movement');
    }
  }

  return (
    <PortalLayout title="Inventory">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Inventory</h2>
          <p className="text-sm text-gray-500 mt-1">Stock items and movement history.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleCreateItem} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">New Item</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Item name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Category (optional)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Unit (pcs, kg, litres...)"
              value={uom}
              onChange={(e) => setUom(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Reorder level"
              type="number"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Create Item
          </button>
        </form>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">On hand</th>
                <th className="px-4 py-2">Reorder level</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No items yet</td></tr>
              )}
              {items.map((item) => (
                <>
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{item.name}</td>
                    <td className="px-4 py-2">{item.category || '—'}</td>
                    <td className="px-4 py-2">
                      {item.quantityOnHand} {item.uom}
                    </td>
                    <td className="px-4 py-2">{item.reorderLevel}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        className="text-rgreen text-xs font-medium"
                        onClick={() => setMovingId(movingId === item.id ? null : item.id)}
                      >
                        {movingId === item.id ? 'Cancel' : 'Record movement'}
                      </button>
                    </td>
                  </tr>
                  {movingId === item.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex flex-wrap gap-2 items-center">
                          <select
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                            value={moveType}
                            onChange={(e) => setMoveType(e.target.value)}
                          >
                            <option value="RECEIPT">Receipt (stock in)</option>
                            <option value="ISSUE">Issue (stock out)</option>
                            <option value="ADJUSTMENT">Adjustment</option>
                          </select>
                          <input
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-24"
                            placeholder="Quantity"
                            type="number"
                            value={moveQty}
                            onChange={(e) => setMoveQty(e.target.value)}
                          />
                          <input
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-48"
                            placeholder="Reason (optional)"
                            value={moveReason}
                            onChange={(e) => setMoveReason(e.target.value)}
                          />
                          <button
                            className="bg-rgreen text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                            onClick={() => handleMovement(item.id)}
                          >
                            Save Movement
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
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
# ADMIN USERS (role granting/revoking)
# ─────────────────────────────────────────────

ADMIN_USERS_TSX = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

const ALL_ROLES = [
  'ADMIN',
  'REGISTRAR',
  'TEACHER',
  'STUDENT',
  'FINANCE_OFFICER',
  'HR_OFFICER',
  'EXAM_OFFICER',
  'STORES_OFFICER',
];

// NOTE: creating a user with one of the 4 ERP roles below, and changing an
// existing user's role, both require the backend to have been patched with
// patch_admin_roles.py. If you see a 400 error here, that script hasn't
// been run yet.
export default function AdminUsers() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('FINANCE_OFFICER');

  const [roleEdits, setRoleEdits] = useState<Record<string, string>>({});

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      const data = await api(`/admin/users?${params.toString()}`, { token });
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, roleFilter]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!name || !email || !password) {
      setError('Name, email and password are required');
      return;
    }
    try {
      await api('/admin/users', {
        method: 'POST',
        token,
        body: { name, email, password, role: newUserRole },
      });
      setMessage(`${name} created as ${newUserRole}`);
      setName('');
      setEmail('');
      setPassword('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user');
    }
  }

  async function handleRoleChange(userId: string) {
    setError('');
    setMessage('');
    const role = roleEdits[userId];
    if (!role) return;
    try {
      await api(`/admin/users/${userId}/role`, { method: 'PATCH', token, body: { role } });
      setMessage('Role updated');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update role');
    }
  }

  return (
    <PortalLayout title="Users">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Users</h2>
          <p className="text-sm text-gray-500 mt-1">
            Create accounts and grant or change roles — this is how privileges are managed.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleCreateUser} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
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
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value)}
            >
              {ALL_ROLES.filter((r) => r !== 'STUDENT').map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Create User
          </button>
        </form>

        <div className="flex flex-wrap gap-3">
          <input
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Search name, email, admission #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All roles</option>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Change role</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No users found</td></tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{u.name}</td>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{u.role}</span>
                  </td>
                  <td className="px-4 py-2">{u.status}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <select
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                        value={roleEdits[u.id] ?? u.role}
                        onChange={(e) => setRoleEdits((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      >
                        {ALL_ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <button
                        className="text-rgreen text-xs font-medium"
                        onClick={() => handleRoleChange(u.id)}
                      >
                        Save
                      </button>
                    </div>
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

FILES = {
    os.path.join(PAGES_DIR, "portal", "FinancePortal.tsx"): FINANCE_PORTAL_TSX,
    os.path.join(PAGES_DIR, "finance", "FinanceInvoices.tsx"): FINANCE_INVOICES_TSX,
    os.path.join(PAGES_DIR, "portal", "HrPortal.tsx"): HR_PORTAL_TSX,
    os.path.join(PAGES_DIR, "hr", "HrStaff.tsx"): HR_STAFF_TSX,
    os.path.join(PAGES_DIR, "portal", "ExaminationsPortal.tsx"): EXAMINATIONS_PORTAL_TSX,
    os.path.join(PAGES_DIR, "examinations", "ExaminationsResults.tsx"): EXAMINATIONS_RESULTS_TSX,
    os.path.join(PAGES_DIR, "portal", "StoresPortal.tsx"): STORES_PORTAL_TSX,
    os.path.join(PAGES_DIR, "stores", "StoresInventory.tsx"): STORES_INVENTORY_TSX,
    os.path.join(PAGES_DIR, "admin", "AdminUsers.tsx"): ADMIN_USERS_TSX,
}

# ─────────────────────────────────────────────
# PortalLayout.tsx patch: fix broken emoji + add 4 new role nav sections
# ─────────────────────────────────────────────

LAYOUT_OLD_ANCHOR = """  ADMIN: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', path: '/admin', icon: '\u2302' },
      ],
    },
    {
      title: 'Administration',
      items: [
        { label: 'Users', path: '/admin/users', icon: '\U0001f465' },
        { label: 'Students', path: '/admin/students', icon: '\U0001f393' },
        { label: 'Staff', path: '/admin/staff', icon: '\U0001f468\u200d\U0001f3eb},
      ],
    },
    {
      title: 'Academic',
      items: [
        { label: 'Academic', path: '/admin/academic', icon: '\U0001f4da' },
        { label: 'Admissions', path: '/admin/admissions', icon: '\U0001f4dd' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { label: 'Finance', path: '/admin/finance', icon: '\U0001f4b0' },
        { label: 'Library', path: '/admin/library', icon: '\U0001f4d6' },
        { label: 'Communication', path: '/admin/communication', icon: '\U0001f4ac' },
      ],
    },
    {
      title: 'Management',
      items: [
        { label: 'Reports', path: '/admin/reports', icon: '\U0001f4ca' },
        { label: 'Settings', path: '/admin/settings', icon: '\u2699' },
      ],
    },
  ],
};"""

LAYOUT_NEW_ANCHOR = """  ADMIN: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', path: '/admin', icon: '\u2302' },
      ],
    },
    {
      title: 'Administration',
      items: [
        { label: 'Users', path: '/admin/users', icon: '\U0001f465' },
        { label: 'Students', path: '/admin/students', icon: '\U0001f393' },
        { label: 'Staff', path: '/admin/staff', icon: '\U0001f468\u200d\U0001f3eb' },
      ],
    },
    {
      title: 'Academic',
      items: [
        { label: 'Academic', path: '/admin/academic', icon: '\U0001f4da' },
        { label: 'Admissions', path: '/admin/admissions', icon: '\U0001f4dd' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { label: 'Finance', path: '/admin/finance', icon: '\U0001f4b0' },
        { label: 'Library', path: '/admin/library', icon: '\U0001f4d6' },
        { label: 'Communication', path: '/admin/communication', icon: '\U0001f4ac' },
      ],
    },
    {
      title: 'Management',
      items: [
        { label: 'Reports', path: '/admin/reports', icon: '\U0001f4ca' },
        { label: 'Settings', path: '/admin/settings', icon: '\u2699' },
      ],
    },
  ],

  FINANCE_OFFICER: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/finance', icon: '\u2302' }],
    },
    {
      title: 'Finance',
      items: [{ label: 'Invoices & Payments', path: '/finance/invoices', icon: '\U0001f4b0' }],
    },
  ],

  HR_OFFICER: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/hr', icon: '\u2302' }],
    },
    {
      title: 'Human Resources',
      items: [{ label: 'Staff & Leave', path: '/hr/staff', icon: '\U0001f465' }],
    },
  ],

  EXAM_OFFICER: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/examinations', icon: '\u2302' }],
    },
    {
      title: 'Examinations',
      items: [{ label: 'Exams & Results', path: '/examinations/results', icon: '\U0001f4ca' }],
    },
  ],

  STORES_OFFICER: [
    {
      title: 'Overview',
      items: [{ label: 'Dashboard', path: '/stores', icon: '\u2302' }],
    },
    {
      title: 'Stores',
      items: [{ label: 'Inventory', path: '/stores/items', icon: '\U0001f4e6' }],
    },
  ],
};"""

# ─────────────────────────────────────────────
# PortalRedirect.tsx patch
# ─────────────────────────────────────────────

REDIRECT_OLD_ANCHOR = """    case 'STUDENT':
      return <Navigate to="/student" replace />;

    default:"""

REDIRECT_NEW_ANCHOR = """    case 'STUDENT':
      return <Navigate to="/student" replace />;

    case 'FINANCE_OFFICER':
      return <Navigate to="/finance" replace />;

    case 'HR_OFFICER':
      return <Navigate to="/hr" replace />;

    case 'EXAM_OFFICER':
      return <Navigate to="/examinations" replace />;

    case 'STORES_OFFICER':
      return <Navigate to="/stores" replace />;

    default:"""

# ─────────────────────────────────────────────
# App.tsx patch
# ─────────────────────────────────────────────

APP_IMPORT_ANCHOR = "import StudentTimetable from './pages/portal/StudentTimetable';"

APP_NEW_IMPORTS = """
import FinancePortal from './pages/portal/FinancePortal';
import FinanceInvoices from './pages/finance/FinanceInvoices';
import HrPortal from './pages/portal/HrPortal';
import HrStaff from './pages/hr/HrStaff';
import ExaminationsPortal from './pages/portal/ExaminationsPortal';
import ExaminationsResults from './pages/examinations/ExaminationsResults';
import StoresPortal from './pages/portal/StoresPortal';
import StoresInventory from './pages/stores/StoresInventory';
import AdminUsers from './pages/admin/AdminUsers';"""

APP_ROUTE_ANCHOR = '<Route path="/registrar/timetable" element={<RegistrarTimetable />} />'

APP_NEW_ROUTES = """
                <Route path="/finance" element={<FinancePortal />} />
                <Route path="/finance/invoices" element={<FinanceInvoices />} />
                <Route path="/hr" element={<HrPortal />} />
                <Route path="/hr/staff" element={<HrStaff />} />
                <Route path="/examinations" element={<ExaminationsPortal />} />
                <Route path="/examinations/results" element={<ExaminationsResults />} />
                <Route path="/stores" element={<StoresPortal />} />
                <Route path="/stores/items" element={<StoresInventory />} />
                <Route path="/admin/users" element={<AdminUsers />} />"""


def write_pages(force: bool) -> None:
    if not os.path.isdir(PAGES_DIR):
        print(f"ERROR: '{PAGES_DIR}' not found. Run this from ~/runyenjes-platform/frontend.")
        sys.exit(1)

    for path, content in FILES.items():
        dirname = os.path.dirname(path)
        os.makedirs(dirname, exist_ok=True)
        if os.path.exists(path) and not force:
            print(f"SKIP  {path} already exists (use --force to overwrite)")
            continue
        with open(path, "w") as f:
            f.write(content)
        print(f"WROTE {path}")


def patch_layout() -> None:
    if not os.path.isfile(LAYOUT_PATH):
        print(f"ERROR: '{LAYOUT_PATH}' not found.")
        sys.exit(1)
    with open(LAYOUT_PATH, "r") as f:
        content = f.read()
    if "FINANCE_OFFICER:" in content:
        print(f"SKIP  {LAYOUT_PATH} already patched.")
        return
    if LAYOUT_OLD_ANCHOR not in content:
        print(f"ERROR: could not find expected ADMIN block in {LAYOUT_PATH}. Patch manually.")
        sys.exit(1)
    content = content.replace(LAYOUT_OLD_ANCHOR, LAYOUT_NEW_ANCHOR)
    with open(LAYOUT_PATH, "w") as f:
        f.write(content)
    print(f"PATCHED {LAYOUT_PATH} (fixed broken Staff icon + added 4 new role nav sections)")


def patch_redirect() -> None:
    if not os.path.isfile(REDIRECT_PATH):
        print(f"ERROR: '{REDIRECT_PATH}' not found.")
        sys.exit(1)
    with open(REDIRECT_PATH, "r") as f:
        content = f.read()
    if "FINANCE_OFFICER" in content:
        print(f"SKIP  {REDIRECT_PATH} already patched.")
        return
    if REDIRECT_OLD_ANCHOR not in content:
        print(f"ERROR: could not find expected STUDENT/default block in {REDIRECT_PATH}. Patch manually.")
        sys.exit(1)
    content = content.replace(REDIRECT_OLD_ANCHOR, REDIRECT_NEW_ANCHOR)
    with open(REDIRECT_PATH, "w") as f:
        f.write(content)
    print(f"PATCHED {REDIRECT_PATH} (added redirect cases for 4 new roles)")


def patch_app() -> None:
    if not os.path.isfile(APP_PATH):
        print(f"ERROR: '{APP_PATH}' not found.")
        sys.exit(1)
    with open(APP_PATH, "r") as f:
        content = f.read()
    if "FinancePortal" in content:
        print(f"SKIP  {APP_PATH} already patched.")
        return
    if APP_IMPORT_ANCHOR not in content:
        print(f"ERROR: could not find import anchor in {APP_PATH}. Patch manually.")
        sys.exit(1)
    content = content.replace(APP_IMPORT_ANCHOR, APP_IMPORT_ANCHOR + APP_NEW_IMPORTS)

    if APP_ROUTE_ANCHOR not in content:
        print(f"ERROR: could not find route anchor in {APP_PATH}. Patch manually.")
        sys.exit(1)
    content = content.replace(APP_ROUTE_ANCHOR, APP_ROUTE_ANCHOR + APP_NEW_ROUTES)

    with open(APP_PATH, "w") as f:
        f.write(content)
    print(f"PATCHED {APP_PATH} (added 9 imports + 9 routes)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="overwrite existing page files if present")
    args = parser.parse_args()

    write_pages(args.force)
    patch_layout()
    patch_redirect()
    patch_app()

    print("\nDone. Review with: git diff src/App.tsx src/pages/PortalRedirect.tsx src/components/portal/PortalLayout.tsx")
    print("New/untracked files: git status")
    print("\nReminder: AdminUsers.tsx needs backend patch_admin_roles.py to have been run")
    print("before role changes / new-role user creation will work.")


if __name__ == "__main__":
    main()
