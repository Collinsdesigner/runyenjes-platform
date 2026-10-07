// RUNYENJES-SETUP-V1
// The one place that lists optional modules. To make a new module switchable,
// add it here; nothing else in the setup flow needs to change.
// Core modules (admissions, academics, users, announcements) are not listed
// because the platform does not work without them.

export const MODULES = [
  { key: 'finance', label: 'Finance', description: 'Invoices, fee payments and balances' },
  { key: 'hr', label: 'Human Resources', description: 'Staff profiles and leave requests' },
  { key: 'library', label: 'Library', description: 'Library catalogue and resources' },
  { key: 'examinations', label: 'Examinations', description: 'Exams and result recording' },
  { key: 'stores', label: 'Stores / Inventory', description: 'Item catalogue and stock movements' },
  { key: 'procurement', label: 'Procurement', description: 'Purchase requests and approvals' },
  { key: 'alumni', label: 'Alumni', description: 'Alumni profiles and graduation' },
  { key: 'jobs', label: 'Job Connection', description: 'Job board for staff and alumni' },
] as const;

export type ModuleKey = (typeof MODULES)[number]['key'];

export const MODULE_KEYS: string[] = MODULES.map((m) => m.key);
