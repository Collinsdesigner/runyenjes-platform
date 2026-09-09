#!/usr/bin/env python3
"""
Adds Registrar -> Student Documents:
  1. schema.prisma        -> StudentDocument model + User relations
  2. media.service.ts     -> uploadDocument + deleteDocument (resource_type
                              'auto', no image transforms -- uploadImage is
                              hardcoded for images and would corrupt a PDF)
  3. documents.routes.ts  -> new file: upload (multer), list, delete
  4. index.ts              -> import + mount at /documents
  5. client.ts             -> uploadStudentDocument() helper, same
                              FormData+fetch pattern as uploadImage/
                              uploadInstitutionLogo (not the JSON api() helper)
  6. RegistrarDocuments.tsx -> new page: search student -> upload -> list/delete
  7. App.tsx                -> import + route at /registrar/documents

Needs a migration (new model) -- run prisma migrate dev after this.
Safe to re-run: every step checks whether it was already applied first.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

BACKEND = os.path.join(ROOT, "backend", "src")
FRONTEND = os.path.join(ROOT, "frontend", "src")

SCHEMA_PATH = os.path.join(ROOT, "backend", "prisma", "schema.prisma")
MEDIA_SERVICE_PATH = os.path.join(BACKEND, "services", "media.service.ts")
DOCUMENTS_ROUTES_PATH = os.path.join(BACKEND, "routes", "documents.routes.ts")
INDEX_TS_PATH = os.path.join(BACKEND, "index.ts")
CLIENT_TS_PATH = os.path.join(FRONTEND, "api", "client.ts")
APP_TSX_PATH = os.path.join(FRONTEND, "App.tsx")
PAGES_DIR = os.path.join(FRONTEND, "pages", "registrar")
DOCUMENTS_PAGE_PATH = os.path.join(PAGES_DIR, "RegistrarDocuments.tsx")


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
if already_applied(SCHEMA_PATH, "StudentDocument"):
    print(f"[SKIP] StudentDocument already present -> {SCHEMA_PATH}")
else:
    user_anchor = "  reportNotesUpdated ReportNote[]\n"
    user_new = (
        "  reportNotesUpdated ReportNote[]\n"
        '  documentsOwned    StudentDocument[] @relation("StudentDocuments")\n'
        '  documentsUploaded StudentDocument[] @relation("DocumentUploadedBy")\n'
    )
    replace_once(SCHEMA_PATH, user_anchor, user_new, "User relations for StudentDocument")

    model_anchor = (
        "// ─────────────────────────────────────────────\n"
        "// ASSIGNMENTS\n"
        "// ─────────────────────────────────────────────\n"
    )
    model_new = (
        "// ─────────────────────────────────────────────\n"
        "// STUDENT DOCUMENTS\n"
        "// ─────────────────────────────────────────────\n"
        "// Issued by Registrar/Admin against a student (transcripts, ID scans,\n"
        "// certificates, etc.). Stored via Cloudinary resource_type 'auto' --\n"
        "// no image transforms, since these are often PDFs/DOCX, not photos.\n\n"
        "model StudentDocument {\n"
        "  id           String   @id @default(uuid())\n"
        "  studentId    String\n"
        '  student      User     @relation("StudentDocuments", fields: [studentId], references: [id])\n'
        "  title        String\n"
        "  fileUrl      String\n"
        "  filePublicId String\n"
        "  resourceType String   @default(\"auto\")\n"
        "  uploadedById String\n"
        '  uploadedBy   User     @relation("DocumentUploadedBy", fields: [uploadedById], references: [id])\n\n'
        "  createdAt DateTime @default(now())\n\n"
        "  @@index([studentId])\n"
        "}\n\n"
        "// ─────────────────────────────────────────────\n"
        "// ASSIGNMENTS\n"
        "// ─────────────────────────────────────────────\n"
    )
    replace_once(SCHEMA_PATH, model_anchor, model_new, "StudentDocument model")

# ------------------------------------------------------------------
# 2. media.service.ts -- uploadDocument + deleteDocument
# ------------------------------------------------------------------
if already_applied(MEDIA_SERVICE_PATH, "uploadDocument"):
    print(f"[SKIP] uploadDocument already present -> {MEDIA_SERVICE_PATH}")
else:
    anchor = "export default cloudinary;\n"
    new_block = '''// Generic document upload (PDF, DOCX, images, etc.) -- unlike uploadImage,
// this does NOT force resource_type 'image' or apply resize transforms,
// since a resized/re-encoded PDF would be corrupted.
export async function uploadDocument(
  file: Express.Multer.File,
  folder: string
): Promise<UploadedImage> {
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

    streamifier.createReadStream(file.buffer).pipe(stream);
  });
}

export async function deleteDocument(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId, {
    resource_type: 'auto',
  });
}

export default cloudinary;
'''
    replace_once(MEDIA_SERVICE_PATH, anchor, new_block, "media.service.ts uploadDocument/deleteDocument")

# ------------------------------------------------------------------
# 3. documents.routes.ts -- new file
# ------------------------------------------------------------------
if os.path.exists(DOCUMENTS_ROUTES_PATH):
    print(f"[SKIP] {DOCUMENTS_ROUTES_PATH} already exists -- not overwriting")
else:
    documents_routes_content = """import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { uploadDocument, deleteDocument } from '../services/media.service';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB -- documents can be larger than avatars
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (file.mimetype.startsWith('image/') || allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images, PDF, or Word documents are allowed'));
    }
  },
});

// ---------- Registrar/Admin: upload a document for a student ----------
router.post(
  '/students/:studentId',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  upload.single('file'),
  async (req, res) => {
    const { studentId } = req.params;
    const { title } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No file was uploaded' });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    const student = await prisma.user.findUnique({ where: { id: studentId } });
    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({ error: 'Student not found' });
    }

    try {
      const uploaded = await uploadDocument(req.file, 'student-documents');

      const doc = await prisma.studentDocument.create({
        data: {
          studentId,
          title: title.trim(),
          fileUrl: uploaded.secureUrl,
          filePublicId: uploaded.publicId,
          uploadedById: req.user!.userId,
        },
      });

      res.status(201).json(doc);
    } catch (error) {
      console.error('Document upload failed:', error);
      res.status(500).json({ error: 'Document upload failed' });
    }
  }
);

// ---------- List a student's documents (Registrar/Admin for anyone, student for themselves) ----------
router.get('/students/:studentId', requireAuth, async (req, res) => {
  const { studentId } = req.params;

  const isSelf = req.user!.userId === studentId;
  const isStaff = req.user!.role === 'REGISTRAR' || req.user!.role === 'ADMIN';
  if (!isSelf && !isStaff) {
    return res.status(403).json({ error: 'You cannot view these documents' });
  }

  const documents = await prisma.studentDocument.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    include: { uploadedBy: { select: { name: true } } },
  });

  res.json(documents);
});

// ---------- Registrar/Admin: delete a document ----------
router.delete('/:id', requireAuth, requireRole('REGISTRAR', 'ADMIN'), async (req, res) => {
  const { id } = req.params;

  const doc = await prisma.studentDocument.findUnique({ where: { id } });
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  try {
    await deleteDocument(doc.filePublicId);
  } catch (error) {
    console.error('Cloudinary delete failed (continuing to remove DB record):', error);
  }

  await prisma.studentDocument.delete({ where: { id } });
  res.status(204).send();
});

export default router;
"""
    os.makedirs(os.path.dirname(DOCUMENTS_ROUTES_PATH), exist_ok=True)
    with open(DOCUMENTS_ROUTES_PATH, "w", encoding="utf-8") as f:
        f.write(documents_routes_content)
    print(f"[OK] Created {DOCUMENTS_ROUTES_PATH}")

# ------------------------------------------------------------------
# 4. index.ts -- import + mount
# ------------------------------------------------------------------
if already_applied(INDEX_TS_PATH, "documentsRoutes"):
    print(f"[SKIP] documentsRoutes already wired into {INDEX_TS_PATH}")
else:
    index_import_anchor = "import reportsRoutes from './routes/reports.routes';\n"
    index_import_new = (
        "import reportsRoutes from './routes/reports.routes';\n"
        "import documentsRoutes from './routes/documents.routes';\n"
    )
    replace_once(INDEX_TS_PATH, index_import_anchor, index_import_new, "index.ts import")

    index_mount_anchor = "app.use('/reports', reportsRoutes);\n"
    index_mount_new = (
        "app.use('/reports', reportsRoutes);\n"
        "app.use('/documents', documentsRoutes);\n"
    )
    replace_once(INDEX_TS_PATH, index_mount_anchor, index_mount_new, "index.ts app.use")

# ------------------------------------------------------------------
# 5. client.ts -- uploadStudentDocument helper
# ------------------------------------------------------------------
if already_applied(CLIENT_TS_PATH, "uploadStudentDocument"):
    print(f"[SKIP] uploadStudentDocument already present -> {CLIENT_TS_PATH}")
else:
    anchor = "// ------------------------------------------------------------\n// Standard API client\n// ------------------------------------------------------------\n"
    new_block = '''// ------------------------------------------------------------
// Upload a student document
// ------------------------------------------------------------
export async function uploadStudentDocument(
  studentId: string,
  file: File,
  title: string,
  token: string | null
): Promise<{ id: string; fileUrl: string; filePublicId: string; title: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);

  const headers: Record<string, string> = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}/documents/students/${studentId}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    handleUnauthorized();
  }

  if (!res.ok) {
    throw new Error(data.error || 'Document upload failed');
  }

  return data;
}

// ------------------------------------------------------------
// Standard API client
// ------------------------------------------------------------
'''
    replace_once(CLIENT_TS_PATH, anchor, new_block, "client.ts uploadStudentDocument")

# ------------------------------------------------------------------
# 6. RegistrarDocuments.tsx -- new page
# ------------------------------------------------------------------
os.makedirs(PAGES_DIR, exist_ok=True)

if os.path.exists(DOCUMENTS_PAGE_PATH):
    print(f"[SKIP] {DOCUMENTS_PAGE_PATH} already exists -- not overwriting")
else:
    documents_page_content = """import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api, uploadStudentDocument } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface StudentRow {
  id: string;
  name: string;
  email: string;
  admissionNumber: string | null;
}

interface DocumentRow {
  id: string;
  title: string;
  fileUrl: string;
  createdAt: string;
  uploadedBy: { name: string };
}

export default function RegistrarDocuments() {
  const { token } = useAuth();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<StudentRow[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

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
    setDocsLoading(true);
    setError('');
    try {
      const data = await api(`/documents/students/${student.id}`, { token });
      setDocuments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load documents');
    } finally {
      setDocsLoading(false);
    }
  }

  async function handleUpload() {
    if (!selectedStudent || !file || !title.trim()) {
      setError('Select a student, a title, and a file');
      return;
    }
    setUploading(true);
    setError('');
    setMessage('');
    try {
      await uploadStudentDocument(selectedStudent.id, file, title.trim(), token);
      setMessage('Document uploaded');
      setTitle('');
      setFile(null);
      selectStudent(selectedStudent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload document');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    setError('');
    setMessage('');
    try {
      await api(`/documents/${id}`, { method: 'DELETE', token });
      setMessage('Document deleted');
      if (selectedStudent) selectStudent(selectedStudent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete document');
    }
  }

  return (
    <PortalLayout title="Student Documents">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Student Documents</h2>
          <p className="text-sm text-gray-500 mt-1">Search a student, then upload or manage their documents.</p>
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
          <button
            type="button"
            onClick={handleSearch}
            className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
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
                <span className="text-xs text-gray-400">
                  {s.admissionNumber || 'No admission number'} · {s.email}
                </span>
              </button>
            ))}
          </div>
        )}

        {selectedStudent && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Managing documents for <span className="font-semibold">{selectedStudent.name}</span>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedStudent(null); setDocuments([]); }}
                className="text-xs text-gray-500"
              >
                Change student
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
              <h3 className="font-semibold text-gray-900">Upload Document</h3>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='Title (e.g. "Transcript 2026")'
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-sm"
              />
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-4 border-b border-gray-200 font-semibold text-gray-900">Documents</div>
              {docsLoading ? (
                <p className="text-sm text-gray-400 p-4">Loading...</p>
              ) : documents.length === 0 ? (
                <p className="text-sm text-gray-400 p-4">No documents uploaded yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {documents.map((d) => (
                    <div key={d.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div>
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-rgreen"
                        >
                          {d.title}
                        </a>
                        <div className="text-xs text-gray-400 mt-1">
                          Uploaded by {d.uploadedBy.name} · {new Date(d.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(d.id)}
                        className="text-xs font-medium text-red-600"
                      >
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
    with open(DOCUMENTS_PAGE_PATH, "w", encoding="utf-8") as f:
        f.write(documents_page_content)
    print(f"[OK] Created {DOCUMENTS_PAGE_PATH}")

# ------------------------------------------------------------------
# 7. App.tsx -- import + route
# ------------------------------------------------------------------
if already_applied(APP_TSX_PATH, "RegistrarDocuments"):
    print(f"[SKIP] RegistrarDocuments already wired into {APP_TSX_PATH}")
else:
    with open(APP_TSX_PATH, "r", encoding="utf-8") as f:
        app_content = f.read()

    import_marker = "import RegistrarAcademicRecords from './pages/registrar/RegistrarAcademicRecords';\n"
    if import_marker not in app_content:
        raise SystemExit(
            "[FAIL] Could not find the RegistrarAcademicRecords import line in App.tsx to anchor against.\n"
            "       Run: grep -n 'RegistrarAcademicRecords' App.tsx and paste the output."
        )
    app_content = app_content.replace(
        import_marker,
        import_marker + "import RegistrarDocuments from './pages/registrar/RegistrarDocuments';\n",
        1,
    )

    route_marker = '<Route path="/registrar/academic" element={<RegistrarAcademicRecords />} />\n'
    if app_content.count(route_marker) != 1:
        raise SystemExit(
            "[FAIL] Could not find exactly one /registrar/academic route line in App.tsx to anchor against."
        )
    app_content = app_content.replace(
        route_marker,
        route_marker + '                <Route path="/registrar/documents" element={<RegistrarDocuments />} />\n',
        1,
    )

    with open(APP_TSX_PATH, "w", encoding="utf-8") as f:
        f.write(app_content)
    print(f"[OK] App.tsx imports + route -> {APP_TSX_PATH}")

print("\nDone. Next: cd backend && npx prisma migrate dev --name add_student_documents, then npx tsc --noEmit in both backend/ and frontend/.")
