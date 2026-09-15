#!/usr/bin/env python3
"""
Adds Bulk Unit Import to Registrar -> Academic Structure:
  1. academic.routes.ts   -> new POST /programmes/:programId/units/bulk
                              (dedupes against existing units + within the
                              same paste, skips instead of erroring)
  2. AcademicStructure.tsx -> new "bulk add units, one per line" textarea
                              right next to the existing single-add input

This is a GENERIC capability -- no institution-specific data (CDACC or
otherwise) is hardcoded anywhere in the code. Registrars paste whatever
units their own institution's curriculum uses.

No schema change, no migration needed.
Safe to re-run: every step checks whether it was already applied first.
"""
import os

ROOT = os.path.join(os.path.expanduser("~"), "runyenjes-platform")
ACADEMIC_ROUTES_PATH = os.path.join(ROOT, "backend", "src", "routes", "academic.routes.ts")
STRUCTURE_PAGE_PATH = os.path.join(ROOT, "frontend", "src", "pages", "registrar", "AcademicStructure.tsx")


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
# 1. academic.routes.ts -- bulk unit creation
# ------------------------------------------------------------------
if already_applied(ACADEMIC_ROUTES_PATH, "/units/bulk"):
    print(f"[SKIP] /units/bulk route already present -> {ACADEMIC_ROUTES_PATH}")
else:
    anchor = "export default router;\n"
    new_block = '''// ---------- Bulk-create units for a programme (one name per line) ----------
// Generic import capability -- the unit NAMES come entirely from the
// caller (whatever curriculum this institution uses), nothing is
// hardcoded here. Dedupes against existing units and within the same
// paste, case-insensitively, so re-running a paste is safe.
router.post(
  '/programmes/:programId/units/bulk',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { programId } = req.params;
    const { unitNames } = req.body;

    if (!Array.isArray(unitNames) || unitNames.length === 0) {
      return res.status(400).json({ error: 'unitNames[] is required' });
    }

    const program = await prisma.program.findUnique({ where: { id: programId } });
    if (!program) return res.status(404).json({ error: 'Programme not found' });

    const existing = await prisma.unit.findMany({ where: { programId }, select: { name: true } });
    const existingLower = new Set(existing.map((u) => u.name.trim().toLowerCase()));

    const toCreate: string[] = [];
    const skipped: string[] = [];

    for (const raw of unitNames) {
      const name = String(raw).trim();
      if (!name) continue;

      const lower = name.toLowerCase();
      if (existingLower.has(lower) || toCreate.some((n) => n.toLowerCase() === lower)) {
        skipped.push(name);
        continue;
      }
      toCreate.push(name);
    }

    const created = await prisma.$transaction(
      toCreate.map((name) => prisma.unit.create({ data: { programId, name } }))
    );

    res.status(201).json({ created: created.length, skipped });
  }
);

export default router;
'''
    replace_once(ACADEMIC_ROUTES_PATH, anchor, new_block, "academic.routes.ts bulk unit import")

# ------------------------------------------------------------------
# 2. AcademicStructure.tsx -- bulk-add UI
# ------------------------------------------------------------------
if already_applied(STRUCTURE_PAGE_PATH, "bulkUnitText"):
    print(f"[SKIP] Bulk unit UI already present -> {STRUCTURE_PAGE_PATH}")
else:
    state_anchor = "  const [newUnit, setNewUnit] = useState('');\n"
    state_new = (
        "  const [newUnit, setNewUnit] = useState('');\n"
        "  const [bulkUnitText, setBulkUnitText] = useState('');\n"
        "  const [bulkSubmitting, setBulkSubmitting] = useState(false);\n"
        "  const [bulkResultMessage, setBulkResultMessage] = useState('');\n"
    )
    replace_once(STRUCTURE_PAGE_PATH, state_anchor, state_new, "AcademicStructure.tsx bulk state")

    function_anchor = '''  async function createUnit() {
    if (!selectedProgramme || !newUnit.trim()) return;

    try {
      await api(`/academic/programmes/${selectedProgramme}/units`, {
        method: 'POST',
        token,
        body: { name: newUnit.trim() },
      });

      setNewUnit('');
      await loadStructure();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create unit');
    }
  }'''
    function_new = function_anchor + '''

  async function bulkCreateUnits() {
    if (!selectedProgramme || !bulkUnitText.trim()) return;

    const unitNames = bulkUnitText
      .split('\\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (unitNames.length === 0) return;

    setBulkSubmitting(true);
    setBulkResultMessage('');
    setError('');

    try {
      const result = await api(`/academic/programmes/${selectedProgramme}/units/bulk`, {
        method: 'POST',
        token,
        body: { unitNames },
      });

      setBulkResultMessage(
        `${result.created} unit${result.created === 1 ? '' : 's'} added.` +
          (result.skipped.length > 0 ? ` ${result.skipped.length} skipped (already existed): ${result.skipped.join(', ')}` : '')
      );
      setBulkUnitText('');
      await loadStructure();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not bulk-add units');
    } finally {
      setBulkSubmitting(false);
    }
  }'''
    replace_once(STRUCTURE_PAGE_PATH, function_anchor, function_new, "AcademicStructure.tsx bulkCreateUnits function")

    ui_anchor = '''                    <button
                      type="button"
                      onClick={createUnit}
                      className="bg-rgreen text-white px-4 py-2 rounded-lg text-sm"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>'''
    ui_new = '''                    <button
                      type="button"
                      onClick={createUnit}
                      className="bg-rgreen text-white px-4 py-2 rounded-lg text-sm"
                    >
                      Add
                    </button>
                  </div>
                )}

                {programme && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Bulk add units (one per line)
                    </label>
                    <textarea
                      value={bulkUnitText}
                      onChange={(e) => setBulkUnitText(e.target.value)}
                      placeholder={'Communication Skills\\nEntrepreneurship\\nICT Skills'}
                      rows={5}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={bulkCreateUnits}
                      disabled={bulkSubmitting}
                      className="mt-2 bg-rgreen text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                    >
                      {bulkSubmitting ? 'Adding...' : 'Bulk Add Units'}
                    </button>
                    {bulkResultMessage && (
                      <p className="text-xs text-gray-500 mt-2">{bulkResultMessage}</p>
                    )}
                  </div>
                )}
              </div>'''
    replace_once(STRUCTURE_PAGE_PATH, ui_anchor, ui_new, "AcademicStructure.tsx bulk-add UI")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/ (no migration needed -- no schema change).")
