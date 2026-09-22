// backend/src/config/requestWorkflows.config.ts
//
// The entire definition of what makes a Clearance Request different from
// a Graduation Request lives here: the approval chain, and -- for types
// that end in an issued document -- how to build that document's title
// and body. Adding a new request type later means adding one entry here;
// no new routes, no new tables.

import { Role, RequestType } from '@prisma/client';

export interface RequestDocumentContext {
  submitterName: string;
  payload: Record<string, unknown> | null;
}

export interface RequestDocument {
  type: string;   // stored on IssuedLetter.type
  title: string;  // stored on IssuedLetter.title
  body: string;   // stored on IssuedLetter.bodyText
}

export interface WorkflowConfig {
  label: string;
  stages: Role[]; // ordered approval chain
  generatesDocument: boolean;
  buildDocument?: (ctx: RequestDocumentContext) => RequestDocument;
}

export const REQUEST_WORKFLOWS: Record<RequestType, WorkflowConfig> = {
  PROGRAMME_CHANGE: {
    label: 'Programme Change Request',
    stages: [Role.REGISTRAR],
    generatesDocument: false,
  },

  CLEARANCE: {
    label: 'Clearance Request',
    stages: [Role.FINANCE_OFFICER, Role.REGISTRAR],
    generatesDocument: true,
    buildDocument: (ctx) => ({
      type: 'CLEARANCE_CERTIFICATE',
      title: 'Clearance Certificate',
      body: `This is to certify that ${ctx.submitterName} has been cleared by all relevant departments and has no outstanding obligations to the institution.`,
    }),
  },

  GRADUATION: {
    label: 'Graduation Request',
    // Enforced in the route handler: a GRADUATION request cannot be
    // created unless an APPROVED CLEARANCE request already exists for
    // that submitter.
    stages: [Role.REGISTRAR, Role.FINANCE_OFFICER],
    generatesDocument: true,
    buildDocument: (ctx) => ({
      type: 'GRADUATION_CLEARANCE',
      title: 'Graduation Clearance Letter',
      body: `This is to certify that ${ctx.submitterName} has satisfied all academic and financial requirements for graduation and is cleared to proceed to graduation.`,
    }),
  },

  ACADEMIC_REQUISITION: {
    label: 'Academic Requisition',
    stages: [Role.REGISTRAR],
    generatesDocument: true,
    buildDocument: (ctx) => {
      const requested =
        typeof ctx.payload?.documentType === 'string' ? ctx.payload.documentType : 'the requested document';
      return {
        type: 'ACADEMIC_REQUISITION',
        title: `Academic Requisition — ${requested}`,
        body: `This confirms approval of ${ctx.submitterName}'s request for: ${requested}.`,
      };
    },
  },
};

export function getWorkflow(type: RequestType): WorkflowConfig {
  return REQUEST_WORKFLOWS[type];
}
