export type RequestType = 'PROGRAMME_CHANGE' | 'CLEARANCE' | 'GRADUATION' | 'ACADEMIC_REQUISITION';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export const REQUEST_TYPES: RequestType[] = ['PROGRAMME_CHANGE', 'CLEARANCE', 'GRADUATION', 'ACADEMIC_REQUISITION'];

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  PROGRAMME_CHANGE: 'Programme Change Request',
  CLEARANCE: 'Clearance Request',
  GRADUATION: 'Graduation Request',
  ACADEMIC_REQUISITION: 'Academic Requisition',
};

export const REQUEST_TYPE_DESCRIPTIONS: Record<RequestType, string> = {
  PROGRAMME_CHANGE: 'Ask the Registrar to move you to a different programme.',
  CLEARANCE: 'Get cleared by Finance and the Registrar — required before you can request graduation.',
  GRADUATION: 'Request graduation clearance. You need an approved Clearance Request first.',
  ACADEMIC_REQUISITION: 'Request a specific academic document, e.g. a transcript or reference letter.',
};

export function roleLabel(role: string): string {
  return role
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'APPROVED':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'REJECTED':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'CANCELLED':
      return 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    default:
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
  }
}

// What POST /requests expects in `payload` for types that need extra input.
// Kept in one place so the student form and any future caller build the same shape.
export function buildPayload(type: RequestType, documentType: string): Record<string, unknown> | undefined {
  if (type === 'ACADEMIC_REQUISITION') {
    return { documentType: documentType.trim() };
  }
  return undefined;
}
