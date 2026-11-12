// POE_PDF_V1
// POE_NAV_PDF_V1
import PDFDocument from 'pdfkit';

type Doc = InstanceType<typeof PDFDocument>;

export interface PoePdfEntry {
  title: string;
  description?: string | null;
  performedOn: Date;
  status: string;
  assessedAt?: Date | null;
  assessorFeedback?: string | null;
  assessedBy?: { name: string } | null;
  unit: { name: string };
  media: { kind: string; url: string; fileName?: string | null }[];
}

const MARGIN = 50;
const LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted, not yet marked',
  COMPETENT: 'Competent',
  NOT_YET_COMPETENT: 'Not yet competent',
  RESUBMIT_REQUESTED: 'Resubmission requested',
};

function fmt(d?: Date | null): string {
  return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
}

function ensure(doc: Doc, needed: number) {
  if (doc.y + needed > doc.page.height - MARGIN - 20) doc.addPage();
}

async function thumb(url: string): Promise<Buffer | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const t = url.replace('/upload/', '/upload/w_240,h_240,c_fill,f_jpg/');
    const r = await fetch(t, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function buildPoePortfolioPdf(
  institutionName: string,
  student: { name: string; admissionNumber?: string | null },
  entries: PoePdfEntry[],
  opts: { draftCount?: number } = {}
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // Cover page
  doc.font('Helvetica-Bold').fontSize(20).text(institutionName, { align: 'center' });
  doc.moveDown(3);
  doc.fontSize(26).text('Portfolio of Evidence', { align: 'center' });
  doc.moveDown(2);
  doc.font('Helvetica').fontSize(16).text(student.name, { align: 'center' });
  if (student.admissionNumber) doc.fontSize(12).text('Admission number: ' + student.admissionNumber, { align: 'center' });
  doc.moveDown(2);
  const competent = entries.filter((e) => e.status === 'COMPETENT').length;
  doc.fontSize(12).text(`Entries: ${entries.length}   Competent: ${competent}`, { align: 'center' });
  if (opts.draftCount !== undefined) {
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#666666').text(`Draft entries not included: ${opts.draftCount}`, { align: 'center' });
    doc.fillColor('#000000');
  }
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#666666').text('Generated on ' + fmt(new Date()), { align: 'center' });
  doc.fillColor('#000000');

  // Entries grouped by unit
  const byUnit = new Map<string, PoePdfEntry[]>();
  for (const e of entries) {
    const arr = byUnit.get(e.unit.name) || [];
    arr.push(e);
    byUnit.set(e.unit.name, arr);
  }

  for (const [unitName, list] of byUnit) {
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(15).text(unitName);
    doc.moveDown(0.5);
    for (const e of list) {
      ensure(doc, 150);
      doc.font('Helvetica-Bold').fontSize(12).text(e.title);
      doc.font('Helvetica').fontSize(10).fillColor('#666666').text(`Performed ${fmt(e.performedOn)}   Status: ${LABEL[e.status] || e.status}`);
      doc.fillColor('#000000');
      if (e.description) doc.fontSize(10).text(e.description);

      const images = e.media.filter((m) => m.kind === 'IMAGE').slice(0, 6);
      if (images.length) {
        ensure(doc, 100);
        const y = doc.y + 4;
        let x = MARGIN;
        let failed = 0;
        for (const m of images) {
          const buf = await thumb(m.url);
          let ok = false;
          if (buf) {
            try { doc.image(buf, x, y, { fit: [90, 90] }); ok = true; } catch { /* skip unreadable image */ }
          }
          if (!ok) failed++;
          x += 100;
        }
        doc.y = y + 96;
        doc.x = MARGIN;
        if (failed) {
          doc.fontSize(9).fillColor('#b00020').text(`Photo could not be loaded (${failed})`);
          doc.fillColor('#000000');
        }
      }
      for (const m of e.media.filter((x) => x.kind !== 'IMAGE')) {
        ensure(doc, 16);
        doc.fontSize(9).fillColor('#0645ad').text(`${m.kind === 'VIDEO' ? 'Video' : 'Document'}: ${m.fileName || m.url}`, { link: m.url });
        doc.fillColor('#000000');
      }

      ensure(doc, 50);
      if (e.assessorFeedback) doc.fontSize(10).text('Feedback: ' + e.assessorFeedback);
      doc.fontSize(10).text(e.assessedAt ? `Assessor: ${e.assessedBy?.name || '-'}   Date: ${fmt(e.assessedAt)}` : 'Not yet assessed');
      doc.moveDown(1);
    }
  }

  doc.end();
  return done;
}
