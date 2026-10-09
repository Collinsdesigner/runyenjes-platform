// RUNYENJES-SETUP-V1
// The one place that lists optional modules. To make a new module switchable,
// add it here; nothing else in the setup flow needs to change.
// Always on (not listed): admissions, academics and learning materials, users,
// announcements, student requests, the AI assistant, groups and notebook.

export const MODULES = [
  { key: 'finance', label: 'Finance', description: 'Finance portal: invoices, fee payments and approvals' },
  { key: 'hr', label: 'Human Resources', description: 'HR portal: staff profiles, leave requests and staff self-service' },
  { key: 'examinations', label: 'Examinations', description: 'Examinations portal: exams and result recording' },
  { key: 'stores', label: 'Stores / Inventory', description: 'Stores portal: inventory items and stock movements' },
  { key: 'procurement', label: 'Procurement', description: 'Procurement portal: purchase requests and approvals' },
  { key: 'alumni', label: 'Alumni', description: 'Alumni portal and graduating students to alumni' },
  { key: 'jobs', label: 'Job Connection', description: 'Job board for staff and alumni' },
] as const;

export type ModuleKey = (typeof MODULES)[number]['key'];

export const MODULE_KEYS: string[] = MODULES.map((m) => m.key);
