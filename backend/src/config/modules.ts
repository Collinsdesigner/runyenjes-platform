// RUNYENJES-SETUP-V1
// The one place that lists the areas an institution can switch to "we use our
// own system". Always on (not listed): admissions, academics and learning
// materials, examinations, users, announcements, student requests, the AI
// assistant, groups and notebook.
//
// Switching an area off hides it and refuses its backend routes. Nothing is
// deleted, so switching it back on restores everything.

export const MODULES = [
  { key: 'finance', label: 'Finance', description: 'Finance portal, student fees and receipts, finance approvals' },
  { key: 'hr', label: 'Human Resources', description: 'HR portal, staff profiles, leave requests and staff self-service' },
  { key: 'stores', label: 'Stores / Inventory', description: 'Stores portal: items and stock movements' },
  { key: 'procurement', label: 'Procurement', description: 'Purchase requests (works with Stores)' },
  { key: 'alumni', label: 'Alumni and Job Board', description: 'Alumni portal, graduating students to alumni, and the job board' },
] as const;

export type ModuleKey = (typeof MODULES)[number]['key'];

export const MODULE_KEYS: string[] = MODULES.map((m) => m.key);

const STAFF_ROLES = [
  'ADMIN',
  'REGISTRAR',
  'TEACHER',
  'FINANCE_OFFICER',
  'HR_OFFICER',
  'EXAM_OFFICER',
  'STORES_OFFICER',
  'PROCUREMENT_OFFICER',
  'SUPPORT_STAFF',
];

// Who sees the link card to the institution's own system when an area is off.
export const MODULE_AUDIENCE: Record<string, string[]> = {
  finance: ['FINANCE_OFFICER', 'ADMIN'],
  hr: STAFF_ROLES,
  stores: ['STORES_OFFICER', 'ADMIN'],
  procurement: ['PROCUREMENT_OFFICER', 'ADMIN'],
  alumni: ['ALUMNI', 'ADMIN'],
};

// Procurement writes to Stores' tables, so it cannot run without Stores.
export function normalizeModules(input: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of MODULE_KEYS) out[key] = input[key] !== false;
  if (!out.stores) out.procurement = false;
  return out;
}
