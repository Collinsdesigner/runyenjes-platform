import PDFDocument from 'pdfkit';

export interface LetterPdfOptions {
  institutionName: string;
  title: string;
  body: string;
  studentName: string;
  issuedByName: string;
  date: Date;
}

// Renders a simple, professional letter/certificate PDF server-side.
// Returns a Buffer, ready to upload via media.service's uploadBuffer.
export function generateLetterPdf(opts: LetterPdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 60 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).font('Helvetica-Bold').text(opts.institutionName, { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(10).font('Helvetica').text(opts.date.toDateString(), { align: 'right' });
    doc.moveDown();

    doc.fontSize(14).font('Helvetica-Bold').text(opts.title);
    doc.moveDown();

    doc.fontSize(11).font('Helvetica').text(`To: ${opts.studentName}`);
    doc.moveDown();

    doc.fontSize(11).font('Helvetica').text(opts.body, { align: 'left', lineGap: 4 });
    doc.moveDown(3);

    doc.fontSize(11).font('Helvetica').text('Issued by:');
    doc.fontSize(11).font('Helvetica-Bold').text(opts.issuedByName);

    doc.end();
  });
}
