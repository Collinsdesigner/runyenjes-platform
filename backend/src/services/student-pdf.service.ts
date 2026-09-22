import PDFDocument from 'pdfkit';

// Server-side PDF generators for student self-service documents.
// Every function returns a Buffer. No institution-specific text is hard-coded:
// the institution's identity is always passed in from SiteSettings.

type Doc = InstanceType<typeof PDFDocument>;

export interface InstitutionInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface Column {
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

const MARGIN = 50;
const FOOTER_RESERVE = 40;
const GREY = '#666666';
const LIGHT = '#eeeeee';

function newDoc(): { doc: Doc; done: Promise<Buffer> } {
  const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  return { doc, done };
}

function pageBottom(doc: Doc): number {
  return doc.page.height - MARGIN - FOOTER_RESERVE;
}

function contentWidth(doc: Doc): number {
  return doc.page.width - MARGIN * 2;
}

function ensureSpace(doc: Doc, needed: number) {
  if (doc.y + needed > pageBottom(doc)) doc.addPage();
}

function money(n: number): string {
  return 'KES ' + n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return 'TBA';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function header(doc: Doc, inst: InstitutionInfo, title: string) {
  doc.font('Helvetica-Bold').fontSize(17).fillColor('#000000').text(inst.name, { align: 'center' });
  const contact = [inst.address, inst.phone, inst.email].filter(Boolean).join('  |  ');
  if (contact) {
    doc.moveDown(0.2).font('Helvetica').fontSize(8.5).fillColor(GREY).text(contact, { align: 'center' });
  }
  doc.moveDown(0.6);
  const y = doc.y;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + contentWidth(doc), y).lineWidth(1).strokeColor('#000000').stroke();
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#000000').text(title, { align: 'center' });
  doc.moveDown(0.8);
}

function infoRows(doc: Doc, rows: Array<[string, string]>) {
  const labelW = 120;
  for (const [label, value] of rows) {
    ensureSpace(doc, 16);
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text(label, MARGIN, y, { width: labelW });
    doc.font('Helvetica').fontSize(10).text(value, MARGIN + labelW, y, { width: contentWidth(doc) - labelW });
    doc.y = Math.max(doc.y, y + 14);
  }
  doc.moveDown(0.6);
}

function sectionTitle(doc: Doc, text: string) {
  ensureSpace(doc, 40);
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000').text(text, MARGIN, doc.y);
  doc.moveDown(0.3);
}

function drawTableHeader(doc: Doc, cols: Column[]) {
  const y = doc.y;
  doc.rect(MARGIN, y, contentWidth(doc), 18).fill(LIGHT);
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9);
  let x = MARGIN;
  for (const c of cols) {
    doc.text(c.header, x + 4, y + 5, { width: c.width - 8, align: c.align || 'left', lineBreak: false });
    x += c.width;
  }
  doc.y = y + 22;
}

function table(doc: Doc, cols: Column[], rows: string[][], boldLast = false) {
  ensureSpace(doc, 60);
  drawTableHeader(doc, cols);
  rows.forEach((row, idx) => {
    doc.font(boldLast && idx === rows.length - 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    let h = 0;
    cols.forEach((c, i) => {
      h = Math.max(h, doc.heightOfString(row[i] ?? '', { width: c.width - 8 }));
    });
    h += 8;
    if (doc.y + h > pageBottom(doc)) {
      doc.addPage();
      drawTableHeader(doc, cols);
      doc.font(boldLast && idx === rows.length - 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    }
    const y = doc.y;
    let x = MARGIN;
    cols.forEach((c, i) => {
      doc.fillColor('#000000').text(row[i] ?? '', x + 4, y + 3, { width: c.width - 8, align: c.align || 'left' });
      x += c.width;
    });
    const bottom = y + h;
    doc.moveTo(MARGIN, bottom).lineTo(MARGIN + contentWidth(doc), bottom).lineWidth(0.4).strokeColor('#cccccc').stroke();
    doc.y = bottom;
  });
  doc.moveDown(0.5);
}

function note(doc: Doc, text: string) {
  ensureSpace(doc, 30);
  doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(GREY).text(text, MARGIN, doc.y, { width: contentWidth(doc) });
  doc.fillColor('#000000');
}

// Adds "Generated <date> | Page x of y" to every page. Margins are zeroed while writing the footer,
// otherwise pdfkit treats text below the bottom margin as overflow and adds a blank page.
function addFooters(doc: Doc, label: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor(GREY).text(
      label + '  |  Page ' + (i - range.start + 1) + ' of ' + range.count,
      MARGIN,
      doc.page.height - 40,
      { width: contentWidth(doc), align: 'center', lineBreak: false }
    );
    doc.page.margins.bottom = oldBottom;
  }
}

function signatureLine(doc: Doc, label: string) {
  ensureSpace(doc, 50);
  doc.moveDown(2);
  const y = doc.y;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + 200, y).lineWidth(0.6).strokeColor('#000000').stroke();
  doc.font('Helvetica').fontSize(9).fillColor('#000000').text(label, MARGIN, y + 4);
}

// ---------------------------------------------------------------- Results slip

export interface ResultsSlipData {
  institution: InstitutionInfo;
  studentName: string;
  admissionNumber?: string | null;
  programmes: string[];
  terms: Array<{
    termName: string;
    rows: Array<{ unitName: string; examName: string; score: number; maxScore: number; grade?: string | null; remarks?: string | null }>;
  }>;
  generatedAt: Date;
}

export async function generateResultsSlipPdf(d: ResultsSlipData): Promise<Buffer> {
  const { doc, done } = newDoc();
  header(doc, d.institution, 'STUDENT RESULTS SLIP');
  infoRows(doc, [
    ['Name', d.studentName],
    ['Admission No.', d.admissionNumber || 'Not assigned'],
    ['Programme', d.programmes.length ? d.programmes.join(', ') : 'Not enrolled'],
    ['Date issued', fmtDate(d.generatedAt)],
  ]);

  const cw = contentWidth(doc);
  const cols: Column[] = [
    { header: 'Unit', width: cw * 0.34 },
    { header: 'Assessment', width: cw * 0.22 },
    { header: 'Score', width: cw * 0.16, align: 'right' },
    { header: 'Grade', width: cw * 0.1, align: 'center' },
    { header: 'Remarks', width: cw * 0.18 },
  ];

  if (d.terms.length === 0) {
    doc.font('Helvetica').fontSize(10).text('No results have been recorded.');
  }
  for (const t of d.terms) {
    sectionTitle(doc, t.termName);
    table(
      doc,
      cols,
      t.rows.map((r) => [r.unitName, r.examName, r.score + ' / ' + r.maxScore, r.grade || '-', r.remarks || ''])
    );
  }

  note(doc, 'This slip lists the scores recorded on the system. It is not an official transcript unless stamped by the Registrar.');
  addFooters(doc, 'Generated ' + fmtDate(d.generatedAt));
  doc.end();
  return done;
}

// ---------------------------------------------------------------- Fee statement

export interface FeeStatementData {
  institution: InstitutionInfo;
  studentName: string;
  admissionNumber?: string | null;
  invoices: Array<{ termName: string; description: string; amount: number; paid: number; status: string }>;
  payments: Array<{ date: Date; receiptNo: string; description: string; method: string; reference?: string | null; amount: number }>;
  generatedAt: Date;
}

export async function generateFeeStatementPdf(d: FeeStatementData): Promise<Buffer> {
  const { doc, done } = newDoc();
  header(doc, d.institution, 'FEE STATEMENT');
  infoRows(doc, [
    ['Name', d.studentName],
    ['Admission No.', d.admissionNumber || 'Not assigned'],
    ['Date issued', fmtDate(d.generatedAt)],
  ]);

  const cw = contentWidth(doc);

  sectionTitle(doc, 'Invoices');
  if (d.invoices.length === 0) {
    doc.font('Helvetica').fontSize(10).text('No invoices on record.');
  } else {
    const live = d.invoices.filter((i) => i.status !== 'CANCELLED');
    const totalBilled = live.reduce((s, i) => s + i.amount, 0);
    const totalPaid = live.reduce((s, i) => s + i.paid, 0);
    const rows = d.invoices.map((i) => [
      i.termName,
      i.description,
      money(i.amount),
      money(i.paid),
      i.status === 'CANCELLED' ? '-' : money(i.amount - i.paid),
      i.status.replace(/_/g, ' '),
    ]);
    rows.push(['TOTAL', '', money(totalBilled), money(totalPaid), money(totalBilled - totalPaid), '']);
    table(
      doc,
      [
        { header: 'Term', width: cw * 0.15 },
        { header: 'Description', width: cw * 0.24 },
        { header: 'Billed', width: cw * 0.15, align: 'right' },
        { header: 'Paid', width: cw * 0.15, align: 'right' },
        { header: 'Balance', width: cw * 0.15, align: 'right' },
        { header: 'Status', width: cw * 0.16 },
      ],
      rows,
      true
    );
    note(doc, 'Cancelled invoices are shown for reference and excluded from the totals.');
  }

  sectionTitle(doc, 'Payments received');
  if (d.payments.length === 0) {
    doc.font('Helvetica').fontSize(10).text('No payments on record.');
  } else {
    table(
      doc,
      [
        { header: 'Date', width: cw * 0.14 },
        { header: 'Receipt No.', width: cw * 0.17 },
        { header: 'For', width: cw * 0.24 },
        { header: 'Method', width: cw * 0.11 },
        { header: 'Reference', width: cw * 0.16 },
        { header: 'Amount', width: cw * 0.18, align: 'right' },
      ],
      d.payments.map((p) => [fmtDate(p.date), p.receiptNo, p.description, p.method, p.reference || '-', money(p.amount)])
    );
  }

  addFooters(doc, 'Generated ' + fmtDate(d.generatedAt));
  doc.end();
  return done;
}

// ---------------------------------------------------------------- Receipt

export interface ReceiptData {
  institution: InstitutionInfo;
  receiptNo: string;
  studentName: string;
  admissionNumber?: string | null;
  termName: string;
  invoiceDescription: string;
  amount: number;
  method: string;
  reference?: string | null;
  paidAt: Date;
  recordedByName: string;
  invoiceBalanceAfter: number;
}

export async function generateReceiptPdf(d: ReceiptData): Promise<Buffer> {
  const { doc, done } = newDoc();
  header(doc, d.institution, 'PAYMENT RECEIPT');
  infoRows(doc, [
    ['Receipt No.', d.receiptNo],
    ['Date', fmtDate(d.paidAt)],
    ['Received from', d.studentName],
    ['Admission No.', d.admissionNumber || 'Not assigned'],
    ['Term', d.termName],
    ['Payment for', d.invoiceDescription],
    ['Method', d.method],
    ['Reference', d.reference || '-'],
    ['Amount received', money(d.amount)],
    ['Balance on invoice', money(d.invoiceBalanceAfter)],
    ['Received by', d.recordedByName],
  ]);
  signatureLine(doc, 'Authorised signature / stamp');
  doc.moveDown(2);
  note(doc, 'This receipt was generated from the payment record held on the system.');
  addFooters(doc, 'Generated ' + fmtDate(new Date()));
  doc.end();
  return done;
}

// ---------------------------------------------------------------- Exam card

export interface ExamCardData {
  institution: InstitutionInfo;
  studentName: string;
  admissionNumber?: string | null;
  programmeName: string;
  termName: string;
  units: string[];
  exams: Array<{ unitName: string; examName: string; examDate: Date | null }>;
  generatedAt: Date;
}

export async function generateExamCardPdf(d: ExamCardData): Promise<Buffer> {
  const { doc, done } = newDoc();
  header(doc, d.institution, 'EXAMINATION CARD');
  infoRows(doc, [
    ['Name', d.studentName],
    ['Admission No.', d.admissionNumber || 'Not assigned'],
    ['Programme', d.programmeName],
    ['Term', d.termName],
    ['Date issued', fmtDate(d.generatedAt)],
  ]);

  const cw = contentWidth(doc);

  sectionTitle(doc, 'Registered units');
  table(
    doc,
    [
      { header: 'No.', width: cw * 0.1, align: 'center' },
      { header: 'Unit', width: cw * 0.9 },
    ],
    d.units.map((u, i) => [String(i + 1), u])
  );

  sectionTitle(doc, 'Examination schedule');
  if (d.exams.length === 0) {
    doc.font('Helvetica').fontSize(10).text('No examinations have been scheduled yet for your registered units.');
    doc.moveDown(0.5);
  } else {
    table(
      doc,
      [
        { header: 'Unit', width: cw * 0.45 },
        { header: 'Assessment', width: cw * 0.3 },
        { header: 'Date', width: cw * 0.25 },
      ],
      d.exams.map((e) => [e.unitName, e.examName, fmtDate(e.examDate)])
    );
  }

  signatureLine(doc, 'Registrar / Examinations Office stamp');
  doc.moveDown(2);
  note(doc, 'Present this card, together with your student ID, at every examination.');
  addFooters(doc, 'Generated ' + fmtDate(d.generatedAt));
  doc.end();
  return done;
}
