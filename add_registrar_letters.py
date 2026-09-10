#!/usr/bin/env python3
"""
Adds Registrar -> Letters & Certificates:
  1. schema.prisma        -> IssuedLetter model + User relations
  2. media.service.ts     -> uploadBuffer() (generic Buffer upload, for
                              server-generated PDFs, not multer files)
  3. letter-pdf.service.ts -> new file: renders a letter/certificate PDF
                              with pdfkit, institution-branded
  4. letters.routes.ts    -> new file: generate+issue, list, delete
  5. index.ts              -> import + mount at /letters
  6. ai.routes.ts          -> new 'draft_letter' text-assist task
  7. RegistrarLetters.tsx  -> new page
  8. App.tsx               -> import + route at /registrar/letters

Needs a migration (new model) and pdfkit installed first:
  cd backend && npm install pdfkit && npm install --save-dev @types/pdfkit
Safe to re-run: every step checks whether it was already applied first.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

BACKEND = os.path.join(ROOT, "backend", "src")
FRONTEND = os.path.join(ROOT, "frontend", "src")

SCHEMA_PATH = os.path.join(ROOT, "backend", "prisma", "schema.prisma")
MEDIA_SERVICE_PATH = os.path.join(BACKEND, "services", "media.service.ts")
LETTER_PDF_SERVICE_PATH = os.path.join(BACKEND, "services", "letter-pdf.service.ts")
LETTERS_ROUTES_PATH = os.path.join(BACKEND, "routes", "letters.routes.ts")
INDEX_TS_PATH = os.path.join(BACKEND, "index.ts")
AI_ROUTES_PATH = os.path.join(BACKEND, "routes", "ai.routes.ts")
APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PAGES_DIR = os.path.join(FRONTEND, "pages", "registrar")
LETTERS_PAGE_PATH = os.path.join(PAGES_DIR, "RegistrarLetters.tsx")


def already_applied(path, marker):
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        return marker in f.read()


def replace_once(path, old, new, label):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    count = content.count(old)
    if count == 0:
        raise SystemExit(f"[FAIL] Anchor not found for '{label}' in {path}\n"
                          f"       Looked for:\n{old!r}")
    if count > 1:
        raise SystemExit(f"[FAIL] Anchor for '{label}' appears {count} times in {path} "
                          f"(expected exactly once) -- refusing to guess which one.")

    content = content.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[OK] {label} -> {path}")


# ------------------------------------------------------------------
# 1. schema.prisma
# ------------------------------------------------------------------
if already_applied(SCHEMA_PATH, "IssuedLetter"):
    print(f"[SKIP] IssuedLetter already present -> {SCHEMA_PATH}")
else:
    user_anchor = '  documentsUploaded StudentDocument[] @relation("DocumentUploadedBy")\n'
    user_new = (
        '  documentsUploaded StudentDocument[] @relation("DocumentUploadedBy")\n'
        '  lettersReceived IssuedLetter[] @relation("LetterRecipient")\n'
        '  lettersIssued   IssuedLetter[] @relation("LetterIssuedBy")\n'
    )
    replace_once(SCHEMA_PATH, user_anchor, user_new, "User relations for IssuedLetter")

    model_anchor = (
        "// ─────────────────────────────────────────────\n"
        "// ASSIGNMENTS\n"
        "// ─────────────────────────────────────────────\n"
    )
    model_new = (
        "// ─────────────────────────────────────────────\n"
        "// LETTERS & CERTIFICATES\n"
        "// ─────────────────────────────────────────────\n"
        "// A real PDF is generated server-side (pdfkit) and stored via\n"
        "// Cloudinary, same pattern as StudentDocument.\n\n"
        "model IssuedLetter {\n"
        "  id           String   @id @default(uuid())\n"
        "  studentId    String\n"
        '  student      User     @relation("LetterRecipient", fields: [studentId], references: [id])\n'
        "  type         String\n"
        "  title        String\n"
        "  bodyText     String\n"
        "  fileUrl      String\n"
        "  filePublicId String\n"
        "  issuedById   String\n"
        '  issuedBy     User     @relation("LetterIssuedBy", fields: [issuedById], references: [id])\n\n'
        "  createdAt DateTime @default(now())\n\n"
        "  @@index([studentId])\n"
        "}\n\n"
        "// ─────────────────────────────────────────────\n"
        "// ASSIGNMENTS\n"
        "// ─────────────────────────────────────────────\n"
    )
    replace_once(SCHEMA_PATH, model_anchor, model_new, "IssuedLetter model")

# ------------------------------------------------------------------
# 2. media.service.ts -- uploadBuffer helper
# ------------------------------------------------------------------
if already_applied(MEDIA_SERVICE_PATH, "uploadBuffer"):
    print(f"[SKIP] uploadBuffer already present -> {MEDIA_SERVICE_PATH}")
else:
    anchor = "export default cloudinary;\n"
    new_block = '''// Upload a raw Buffer (e.g. a server-generated PDF) -- distinct from
// uploadImage/uploadDocument, which both expect a multer file object.
export async function uploadBuffer(buffer: Buffer, folder: string): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        if (!result) {
          return reject(new Error('Cloudinary upload failed.'));
        }

        resolve({
          secureUrl: result.secure_url,
          publicId: result.public_id,
        });
      }
    );

    stream.end(buffer);
  });
}

export default cloudinary;
'''
    replace_once(MEDIA_SERVICE_PATH, anchor, new_block, "media.service.ts uploadBuffer")

# ------------------------------------------------------------------
# 3. letter-pdf.service.ts -- new file
# ------------------------------------------------------------------
if os.path.exists(LETTER_PDF_SERVICE_PATH):
    print(f"[SKIP] {LETTER_PDF_SERVICE_PATH} already exists -- not overwriting")
else:
    letter_pdf_content = """import PDFDocument from 'pdfkit';

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
"""
    with open(LETTER_PDF_SERVICE_PATH, "w", encoding="utf-8") as f:
        f.write(letter_pdf_content)
    print(f"[OK] Created {LETTER_PDF_SERVICE_PATH}")

# ------------------------------------------------------------------
# 4. letters.routes.ts -- new file
# ------------------------------------------------------------------
if os.path.exists(LETTERS_ROUTES_PATH):
    print(f"[SKIP] {LETTERS_ROUTES_PATH} already exists -- not overwriting")
else:
    letters_routes_content = """import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { uploadBuffer } from '../services/media.service';
import { generateLetterPdf } from '../services/letter-pdf.service';

const router = Router();

// ---------- Registrar/Admin: generate + issue a letter/certificate ----------
router.post('/students/:studentId', requireAuth, requireRole('REGISTRAR', 'ADMIN'), async (req, res) => {
  const { studentId } = req.params;
  const { type, title, bodyText } = req.body;

  if (!type || !title || !bodyText || !bodyText.trim()) {
    return res.status(400).json({ error: 'type, title and bodyText are required' });
  }

  const student = await prisma.user.findUnique({ where: { id: studentId } });
  if (!student || student.role !== 'STUDENT') {
    return res.status(404).json({ error: 'Student not found' });
  }

  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const institutionName = settings?.institutionName || 'Institution';

  const issuedBy = await prisma.user.findUnique({ where: { id: req.user!.userId } });

  try {
    const pdfBuffer = await generateLetterPdf({
      institutionName,
      title,
      body: bodyText.trim(),
      studentName: student.name,
      issuedByName: issuedBy?.name || 'Registrar',
      date: new Date(),
    });

    const uploaded = await uploadBuffer(pdfBuffer, 'letters');

    const letter = await prisma.issuedLetter.create({
      data: {
        studentId,
        type,
        title,
        bodyText: bodyText.trim(),
        fileUrl: uploaded.secureUrl,
        filePublicId: uploaded.publicId,
        issuedById: req.user!.userId,
      },
    });

    res.status(201).json(letter);
  } catch (error) {
    console.error('Letter generation failed:', error);
    res.status(500).json({ error: 'Letter generation failed' });
  }
});

// ---------- List a student's letters (Registrar/Admin for anyone, student for themselves) ----------
router.get('/students/:studentId', requireAuth, async (req, res) => {
  const { studentId } = req.params;

  const isSelf = req.user!.userId === studentId;
  const isStaff = req.user!.role === 'REGISTRAR' || req.user!.role === 'ADMIN';
  if (!isSelf && !isStaff) {
    return res.status(403).json({ error: 'You cannot view these letters' });
  }

  const letters = await prisma.issuedLetter.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    include: { issuedBy: { select: { name: true } } },
  });

  res.json(letters);
});

// ---------- Registrar/Admin: delete an issued letter ----------
router.delete('/:id', requireAuth, requireRole('REGISTRAR', 'ADMIN'), async (req, res) => {
  const { id } = req.params;

  const letter = await prisma.issuedLetter.findUnique({ where: { id } });
  if (!letter) return res.status(404).json({ error: 'Letter not found' });

  await prisma.issuedLetter.delete({ where: { id } });
  res.status(204).send();
});

export default router;
"""
    os.makedirs(os.path.dirname(LETTERS_ROUTES_PATH), exist_ok=True)
    with open(LETTERS_ROUTES_PATH, "w", encoding="utf-8") as f:
        f.write(letters_routes_content)
    print(f"[OK] Created {LETTERS_ROUTES_PATH}")

# ------------------------------------------------------------------
# 5. index.ts -- import + mount
# ------------------------------------------------------------------
if already_applied(INDEX_TS_PATH, "lettersRoutes"):
    print(f"[SKIP] lettersRoutes already wired into {INDEX_TS_PATH}")
else:
    index_import_anchor = "import documentsRoutes from './routes/documents.routes';\n"
    index_import_new = (
        "import documentsRoutes from './routes/documents.routes';\n"
        "import lettersRoutes from './routes/letters.routes';\n"
    )
    replace_once(INDEX_TS_PATH, index_import_anchor, index_import_new, "index.ts import")

    index_mount_anchor = "app.use('/documents', documentsRoutes);\n"
    index_mount_new = (
        "app.use('/documents', documentsRoutes);\n"
        "app.use('/letters', lettersRoutes);\n"
    )
    replace_once(INDEX_TS_PATH, index_mount_anchor, index_mount_new, "index.ts app.use")

# ------------------------------------------------------------------
# 6. ai.routes.ts -- new draft_letter text-assist task
# ------------------------------------------------------------------
if already_applied(AI_ROUTES_PATH, "draft_letter"):
    print(f"[SKIP] draft_letter task already present -> {AI_ROUTES_PATH}")
else:
    with open(AI_ROUTES_PATH, "r", encoding="utf-8") as f:
        ai_content = f.read()

    marker = "  suggest_document_title: {"
    if marker not in ai_content:
        raise SystemExit(f"[FAIL] Could not find '{marker}' in ai.routes.ts to anchor draft_letter before it.")
    if ai_content.count(marker) != 1:
        raise SystemExit(f"[FAIL] '{marker}' appears more than once -- refusing to guess which one.")

    insertion = '''  draft_letter: {
    systemPrompt:
      'Turn the following rough notes into a clear, formal letter/certificate body for a TVET college '
      'registrar to issue to a student. Keep it professional and appropriately formal. Do not invent facts '
      'not implied by the input. Do not include a greeting/salutation or signature block -- just the body '
      'text itself.',
  },
'''
    ai_content = ai_content.replace(marker, insertion + marker, 1)
    with open(AI_ROUTES_PATH, "w", encoding="utf-8") as f:
        f.write(ai_content)
    print(f"[OK] draft_letter task inserted -> {AI_ROUTES_PATH}")

# ------------------------------------------------------------------
# 7. RegistrarLetters.tsx -- new page
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)

if os.path.exists(LETTERS_PAGE_PATH):
    print(f"[SKIP] {LETTERS_PAGE_PATH} already exists -- not overwriting")
else:
    letters_page_content = """import { useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import AIAssistBox from '../../components/ai/AIAssistBox';

interface StudentRow {
  id: string;
  name: string;
  email: string;
  admissionNumber: string | null;
}

interface LetterRow {
  id: string;
  type: string;
  title: string;
  fileUrl: string;
  createdAt: string;
  issuedBy: { name: string };
}

const LETTER_TYPES = ['Introduction Letter', 'Completion Certificate', 'Fee Clearance', 'Recommendation Letter', 'Custom'];

export default function RegistrarLetters() {
  const { token } = useAuth();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<StudentRow[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);

  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [lettersLoading, setLettersLoading] = useState(false);

  const [type, setType] = useState(LETTER_TYPES[0]);
  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [generating, setGenerating] = useState(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSearch() {
    if (!search.trim()) return;
    setError('');
    try {
      const data = await api(`/registrar/students?search=${encodeURIComponent(search.trim())}`, { token });
      setResults(data.students);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not search students');
    }
  }

  async function selectStudent(student: StudentRow) {
    setSelectedStudent(student);
    setLettersLoading(true);
    setError('');
    try {
      const data = await api(`/letters/students/${student.id}`, { token });
      setLetters(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load letters');
    } finally {
      setLettersLoading(false);
    }
  }

  async function handleGenerate() {
    if (!selectedStudent || !title.trim() || !bodyText.trim()) {
      setError('Title and body are required');
      return;
    }
    setGenerating(true);
    setError('');
    setMessage('');
    try {
      await api(`/letters/students/${selectedStudent.id}`, {
        method: 'POST',
        token,
        body: { type, title: title.trim(), bodyText: bodyText.trim() },
      });
      setMessage('Letter generated and issued');
      setTitle('');
      setBodyText('');
      selectStudent(selectedStudent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate letter');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: string) {
    setError('');
    setMessage('');
    try {
      await api(`/letters/${id}`, { method: 'DELETE', token });
      setMessage('Letter deleted');
      if (selectedStudent) selectStudent(selectedStudent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete letter');
    }
  }

  return (
    <PortalLayout title="Letters & Certificates">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Letters & Certificates</h2>
          <p className="text-sm text-gray-500 mt-1">Search a student, then draft and issue a real PDF letter or certificate.</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
        {message && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>}

        <div className="bg-white border border-gray-200 rounded-lg p-5 flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name, email, or admission number"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button type="button" onClick={handleSearch} className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Search
          </button>
        </div>

        {results.length > 0 && !selectedStudent && (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {results.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectStudent(s)}
                className="w-full text-left px-5 py-3 hover:bg-gray-50 text-sm"
              >
                <span className="font-medium text-gray-900">{s.name}</span>{' '}
                <span className="text-xs text-gray-400">{s.admissionNumber || 'No admission number'} · {s.email}</span>
              </button>
            ))}
          </div>
        )}

        {selectedStudent && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Issuing letters for <span className="font-semibold">{selectedStudent.name}</span>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedStudent(null); setLetters([]); }}
                className="text-xs text-gray-500"
              >
                Change student
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
              <h3 className="font-semibold text-gray-900">Draft a Letter / Certificate</h3>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {LETTER_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='Title (e.g. "Letter of Introduction")'
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Write rough notes, then ask AI to draft it into formal wording -- or write the full body yourself."
                rows={6}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <AIAssistBox
                task="draft_letter"
                label="Ask AI to draft this into formal wording"
                getInput={() => bodyText}
                onApply={(result) => setBodyText(result)}
                emptyMessage="Write some rough notes first, then ask AI to draft it."
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {generating ? 'Generating PDF...' : 'Generate & Issue Letter'}
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-4 border-b border-gray-200 font-semibold text-gray-900">Issued Letters</div>
              {lettersLoading ? (
                <p className="text-sm text-gray-400 p-4">Loading...</p>
              ) : letters.length === 0 ? (
                <p className="text-sm text-gray-400 p-4">No letters issued yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {letters.map((l) => (
                    <div key={l.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div>
                        <a href={l.fileUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-rgreen">
                          {l.title}
                        </a>
                        <div className="text-xs text-gray-400 mt-1">
                          {l.type} · Issued by {l.issuedBy.name} · {new Date(l.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button type="button" onClick={() => handleDelete(l.id)} className="text-xs font-medium text-red-600">
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
"""
    with open(LETTERS_PAGE_PATH, "w", encoding="utf-8") as f:
        f.write(letters_page_content)
    print(f"[OK] Created {LETTERS_PAGE_PATH}")

# ------------------------------------------------------------------
# 8. App.tsx -- import + route
# ------------------------------------------------------------------
if already_applied(APP_TSX_PATH, "RegistrarLetters"):
    print(f"[SKIP] RegistrarLetters already wired into {APP_TSX_PATH}")
else:
    with open(APP_TSX_PATH, "r", encoding="utf-8") as f:
        app_content = f.read()

    import_marker = "import RegistrarDocuments from './pages/registrar/RegistrarDocuments';\n"
    if import_marker not in app_content:
        raise SystemExit(
            "[FAIL] Could not find the RegistrarDocuments import line in App.tsx.\n"
            "       Run: grep -n 'RegistrarDocuments' App.tsx and paste the output."
        )
    app_content = app_content.replace(
        import_marker,
        import_marker + "import RegistrarLetters from './pages/registrar/RegistrarLetters';\n",
        1,
    )

    route_marker = '<Route path="/registrar/documents" element={<RegistrarDocuments />} />\n'
    if app_content.count(route_marker) != 1:
        raise SystemExit(
            "[FAIL] Could not find exactly one /registrar/documents route line in App.tsx."
        )
    app_content = app_content.replace(
        route_marker,
        route_marker + '                <Route path="/registrar/letters" element={<RegistrarLetters />} />\n',
        1,
    )

    with open(APP_TSX_PATH, "w", encoding="utf-8") as f:
        f.write(app_content)
    print(f"[OK] App.tsx import + route -> {APP_TSX_PATH}")

print("\nDone. Next: cd backend && npx prisma migrate dev --name add_issued_letters, then npx tsc --noEmit in both backend/ and frontend/.")
