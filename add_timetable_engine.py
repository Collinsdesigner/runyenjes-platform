#!/usr/bin/env python3
"""
Upgrades the Timetable from single-entry-only to a full weekly engine:
  1. ai.routes.ts        -> new POST /ai/timetable-suggestion (AI draft,
                             not saved -- registrar reviews before saving)
  2. academic.routes.ts  -> new POST /academic/timetable/entries/bulk
                             (reuses the SAME conflict logic as the
                             existing single-entry POST, extended to also
                             catch conflicts within the same batch)
  3. RegistrarTimetable.tsx -> full rewrite: adds a weekly grid view,
                             AI-generate + review-before-save flow,
                             keeps the existing single-entry form and
                             list view exactly as they were.

No schema change, no migration needed.
Safe to re-run: checks whether already applied first.
"""
import os

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, "runyenjes-platform")

AI_ROUTES_PATH = os.path.join(ROOT, "backend", "src", "routes", "ai.routes.ts")
ACADEMIC_ROUTES_PATH = os.path.join(ROOT, "backend", "src", "routes", "academic.routes.ts")
TIMETABLE_PAGE_PATH = os.path.join(ROOT, "frontend", "src", "pages", "registrar", "RegistrarTimetable.tsx")


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
# 1. ai.routes.ts -- new AI timetable suggestion endpoint
# ------------------------------------------------------------------
if already_applied(AI_ROUTES_PATH, "timetable-suggestion"):
    print(f"[SKIP] timetable-suggestion route already present -> {AI_ROUTES_PATH}")
else:
    anchor = (
        "// ─────────────────────────────────────────────\n"
        "// AI ASSIST: role-specific one-click quick actions\n"
        "// ─────────────────────────────────────────────\n"
    )
    new_block = '''// ---------- AI Timetable Suggestion: draft schedule for a programme's unscheduled units ----------
// Returns a DRAFT only -- nothing is saved here. The registrar reviews
// and edits in the grid, then explicitly saves via the bulk endpoint.
router.post(
  '/timetable-suggestion',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { programId } = req.body;
    if (!programId) return res.status(400).json({ error: 'programId is required' });

    const term = await prisma.term.findFirst({ where: { isActive: true } });
    if (!term) return res.status(400).json({ error: 'No active academic term' });

    const program = await prisma.program.findUnique({ where: { id: programId }, include: { units: true } });
    if (!program) return res.status(404).json({ error: 'Programme not found' });

    const existingEntries = await prisma.timetableEntry.findMany({ where: { termId: term.id } });
    const programUnitIds = new Set(program.units.map((u) => u.id));
    const scheduledUnitIds = new Set(existingEntries.filter((e) => programUnitIds.has(e.unitId)).map((e) => e.unitId));
    const unitsNeeding = program.units.filter((u) => !scheduledUnitIds.has(u.id));

    if (unitsNeeding.length === 0) {
      return res.json({ entries: [], message: 'Every unit in this programme already has a timetable entry this term.' });
    }

    const assignments = await prisma.unitLecturer.findMany({
      where: { unitId: { in: unitsNeeding.map((u) => u.id) }, termId: term.id },
      include: { lecturer: { select: { id: true, name: true } } },
    });
    const lecturerByUnit = new Map(assignments.map((a) => [a.unitId, a.lecturer]));

    const unitList = unitsNeeding
      .map((u) => {
        const lecturer = lecturerByUnit.get(u.id);
        return `- unitId: ${u.id}, name: "${u.name}"${
          lecturer ? `, lecturer name: ${lecturer.name}, lecturerId: ${lecturer.id}` : ', lecturer: unassigned'
        }`;
      })
      .join('\\n');

    const busySlots =
      existingEntries
        .map(
          (e) =>
            `day ${e.dayOfWeek} ${e.startTime}-${e.endTime}${e.room ? ` room ${e.room}` : ''}${
              e.lecturerId ? ` lecturerId ${e.lecturerId}` : ''
            }`
        )
        .join('\\n') || 'none';

    const prompt = `Programme: ${program.name}
Units needing a timetable slot this term:
${unitList}

Already-occupied slots this term across the whole institution (avoid overlapping these on the same lecturer/room/day/time):
${busySlots}

Propose a Monday-Saturday (dayOfWeek 1-6), 08:00-17:00 class schedule for each unit listed above. Use the exact lecturerId given for each unit if one is listed, otherwise use null. Respond with ONLY valid JSON, no markdown, in exactly this shape:
{"entries": [{"unitId": "...", "lecturerId": "..." or null, "dayOfWeek": 1, "startTime": "08:00", "endTime": "10:00", "room": "..."}]}`;

    try {
      const reply = await callGroq(
        'You create conflict-free weekly class timetables for a TVET college. Respond with ONLY valid JSON, nothing else.',
        prompt,
        1800
      );
      const cleaned = reply.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      res.json(parsed);
    } catch (err) {
      if (err instanceof SyntaxError) {
        return res.status(502).json({ error: 'The AI returned an unexpected format. Please try again.' });
      }
      handleGroqError(err, res);
    }
  }
);

''' + anchor
    replace_once(AI_ROUTES_PATH, anchor, new_block, "ai.routes.ts timetable-suggestion route")

# ------------------------------------------------------------------
# 2. academic.routes.ts -- bulk save endpoint
# ------------------------------------------------------------------
if already_applied(ACADEMIC_ROUTES_PATH, "/timetable/entries/bulk"):
    print(f"[SKIP] bulk endpoint already present -> {ACADEMIC_ROUTES_PATH}")
else:
    anchor = "export default router;\n"
    new_block = '''// Bulk-create timetable entries (e.g. from an AI-generated draft, or
// several manual grid edits at once). Reuses the exact same conflict
// rules as the single-entry POST above, extended to also catch
// conflicts between entries within this same batch.
router.post(
  '/timetable/entries/bulk',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { entries } = req.body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries[] is required' });
    }

    const term = await prisma.term.findFirst({ where: { isActive: true } });
    if (!term) return res.status(400).json({ error: 'No active academic term' });

    const existingEntries = await prisma.timetableEntry.findMany({ where: { termId: term.id } });

    type ConflictCheckable = {
      unitId: string;
      lecturerId: string | null;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      room: string | null;
    };

    const accepted: ConflictCheckable[] = existingEntries.map((e) => ({
      unitId: e.unitId,
      lecturerId: e.lecturerId,
      dayOfWeek: e.dayOfWeek,
      startTime: e.startTime,
      endTime: e.endTime,
      room: e.room,
    }));

    const created: any[] = [];
    const skipped: any[] = [];

    for (const raw of entries) {
      const { unitId, lecturerId, dayOfWeek, startTime, endTime, room, notes } = raw;

      if (!unitId || dayOfWeek === undefined || !startTime || !endTime) {
        skipped.push({ ...raw, reason: 'Missing required fields' });
        continue;
      }
      if (typeof dayOfWeek !== 'number' || dayOfWeek < 1 || dayOfWeek > 7) {
        skipped.push({ ...raw, reason: 'Invalid day of week' });
        continue;
      }
      if (startTime >= endTime) {
        skipped.push({ ...raw, reason: 'End time must be later than start time' });
        continue;
      }

      const overlapping = accepted.filter(
        (e) => e.dayOfWeek === dayOfWeek && e.startTime < endTime && e.endTime > startTime
      );

      if (overlapping.some((e) => e.unitId === unitId)) {
        skipped.push({ ...raw, reason: 'This unit is already scheduled during this time' });
        continue;
      }
      if (lecturerId && overlapping.some((e) => e.lecturerId === lecturerId)) {
        skipped.push({ ...raw, reason: 'This lecturer is already teaching another unit during this time' });
        continue;
      }
      if (room && overlapping.some((e) => e.room && e.room.trim().toLowerCase() === String(room).trim().toLowerCase())) {
        skipped.push({ ...raw, reason: 'This room is already occupied during this time' });
        continue;
      }

      const entry = await prisma.timetableEntry.create({
        data: {
          termId: term.id,
          unitId,
          lecturerId: lecturerId || null,
          dayOfWeek,
          startTime,
          endTime,
          room: room || null,
          notes: notes || null,
        },
        include: {
          unit: { include: { program: true } },
          lecturer: { select: { id: true, name: true, email: true, departmentId: true } },
          term: true,
        },
      });

      accepted.push({
        unitId: entry.unitId,
        lecturerId: entry.lecturerId,
        dayOfWeek: entry.dayOfWeek,
        startTime: entry.startTime,
        endTime: entry.endTime,
        room: entry.room,
      });
      created.push(entry);
    }

    res.status(201).json({ created, skipped });
  }
);

export default router;
'''
    replace_once(ACADEMIC_ROUTES_PATH, anchor, new_block, "academic.routes.ts bulk timetable endpoint")

# ------------------------------------------------------------------
# 3. RegistrarTimetable.tsx -- full rewrite
# ------------------------------------------------------------------
timetable_page_content = """import { useEffect, useMemo, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Programme {
  id: string;
  name: string;
  level?: string | number | null;
  departmentId: string;
  department?: {
    id: string;
    name: string;
  };
}

interface Unit {
  id: string;
  name: string;
  code?: string | null;
  programId: string;
  program?: Programme;
}

interface Lecturer {
  id: string;
  name: string;
  email: string;
  departmentId?: string | null;
}

interface Term {
  id: string;
  name: string;
}

interface TimetableEntry {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  notes: string | null;
  unit: Unit;
  lecturer: Lecturer | null;
  term: Term;
}

interface OptionsResponse {
  programmes: Programme[];
  units: Unit[];
  lecturers: Lecturer[];
  activeTerm: Term | null;
}

interface DraftEntry {
  unitId: string;
  unitName: string;
  lecturerId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string;
}

const days = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const GRID_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16];

function hourLabel(h: number) {
  return `${String(h).padStart(2, '0')}:00`;
}

export default function RegistrarTimetable() {
  const { token } = useAuth();

  const [view, setView] = useState<'grid' | 'list'>('grid');

  const [options, setOptions] = useState<OptionsResponse>({
    programmes: [],
    units: [],
    lecturers: [],
    activeTerm: null,
  });

  const [entries, setEntries] = useState<TimetableEntry[]>([]);

  const [selectedProgramme, setSelectedProgramme] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [selectedLecturer, setSelectedLecturer] = useState('');

  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [room, setRoom] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // AI generation
  const [genProgramme, setGenProgramme] = useState('');
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<DraftEntry[] | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [genMessage, setGenMessage] = useState('');

  async function load() {
    if (!token) return;

    setLoading(true);
    setError('');

    try {
      const [optionsResponse, entriesResponse] = await Promise.all([
        api('/academic/timetable/options', { token }),
        api('/academic/timetable/entries', { token }),
      ]);

      setOptions(
        optionsResponse ?? {
          programmes: [],
          units: [],
          lecturers: [],
          activeTerm: null,
        }
      );

      setEntries(entriesResponse ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load timetable data'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedUnit('');
  }, [selectedProgramme]);

  useEffect(() => {
    if (token) {
      load();
    }
  }, [token]);

  const filteredUnits = useMemo(() => {
    if (!selectedProgramme) {
      return [];
    }

    return options.units.filter(
      (unit) => unit.programId === selectedProgramme
    );
  }, [options.units, selectedProgramme]);

  function changeProgramme(value: string) {
    setSelectedProgramme(value);
    setSelectedUnit('');
  }

  async function createEntry() {
    if (
      !token ||
      !selectedUnit ||
      !dayOfWeek ||
      !startTime ||
      !endTime
    ) {
      setError(
        'Unit, day, start time and end time are required.'
      );
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await api('/academic/timetable/entries', {
        method: 'POST',
        token,
        body: {
          programId: selectedProgramme,
          unitId: selectedUnit,
          lecturerId: selectedLecturer || null,
          dayOfWeek: Number(dayOfWeek),
          startTime,
          endTime,
          room: room || null,
          notes: notes || null,
        },
      });

      setMessage('Timetable entry created successfully.');

      setSelectedUnit('');
      setSelectedLecturer('');
      setStartTime('');
      setEndTime('');
      setRoom('');
      setNotes('');

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not create timetable entry'
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!token) return;

    if (!window.confirm('Delete this timetable entry?')) {
      return;
    }

    setError('');
    setMessage('');

    try {
      await api(`/academic/timetable/entries/${id}`, {
        method: 'DELETE',
        token,
      });

      setMessage('Timetable entry deleted.');
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not delete timetable entry'
      );
    }
  }

  async function handleGenerate() {
    if (!genProgramme) {
      setGenMessage('Select a programme first.');
      return;
    }
    setGenerating(true);
    setGenMessage('');
    setDraft(null);
    try {
      const data = await api('/ai/timetable-suggestion', {
        method: 'POST',
        token,
        body: { programId: genProgramme },
      });
      if (!data.entries || data.entries.length === 0) {
        setGenMessage(data.message || 'No units need scheduling for this programme right now.');
        return;
      }
      const unitNameOf = (id: string) => options.units.find((u) => u.id === id)?.name || id;
      setDraft(
        data.entries.map((e: any) => ({
          unitId: e.unitId,
          unitName: unitNameOf(e.unitId),
          lecturerId: e.lecturerId || null,
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          endTime: e.endTime,
          room: e.room || '',
        }))
      );
    } catch (err) {
      setGenMessage(err instanceof Error ? err.message : 'Could not generate a draft timetable');
    } finally {
      setGenerating(false);
    }
  }

  function updateDraftRow(index: number, patch: Partial<DraftEntry>) {
    if (!draft) return;
    const next = [...draft];
    next[index] = { ...next[index], ...patch };
    setDraft(next);
  }

  function removeDraftRow(index: number) {
    if (!draft) return;
    setDraft(draft.filter((_, i) => i !== index));
  }

  async function handleSaveDraft() {
    if (!draft || draft.length === 0) return;
    setSavingDraft(true);
    setGenMessage('');
    try {
      const result = await api('/academic/timetable/entries/bulk', {
        method: 'POST',
        token,
        body: {
          entries: draft.map((d) => ({
            unitId: d.unitId,
            lecturerId: d.lecturerId,
            dayOfWeek: d.dayOfWeek,
            startTime: d.startTime,
            endTime: d.endTime,
            room: d.room || null,
          })),
        },
      });
      const skippedCount = result.skipped?.length || 0;
      setGenMessage(
        `${result.created.length} entr${result.created.length === 1 ? 'y' : 'ies'} saved.` +
          (skippedCount > 0 ? ` ${skippedCount} skipped due to conflicts (see below).` : '')
      );
      if (skippedCount > 0) {
        setDraft(
          result.skipped.map((s: any) => ({
            unitId: s.unitId,
            unitName: options.units.find((u) => u.id === s.unitId)?.name || s.unitId,
            lecturerId: s.lecturerId || null,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            room: s.room || '',
          }))
        );
      } else {
        setDraft(null);
      }
      await load();
    } catch (err) {
      setGenMessage(err instanceof Error ? err.message : 'Could not save the draft timetable');
    } finally {
      setSavingDraft(false);
    }
  }

  return (
    <PortalLayout title="Timetable Management">
      <div className="space-y-6">

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Timetable Management
            </h1>

            <p className="text-gray-500 mt-1">
              Create and manage the academic timetable.
            </p>
          </div>

          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`px-3 py-1.5 text-sm rounded-md ${view === 'grid' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`px-3 py-1.5 text-sm rounded-md ${view === 'list' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
            >
              List
            </button>
          </div>
        </div>

        {options.activeTerm && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="text-sm text-green-700">
              Active Academic Term
            </div>
            <div className="font-semibold text-green-900">
              {options.activeTerm.name}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-4">
            {message}
          </div>
        )}

        {/* ============ AI GENERATE ============ */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
          <h2 className="font-semibold text-gray-900">✦ AI: Generate Draft Schedule</h2>
          <p className="text-sm text-gray-500">
            Pick a programme -- AI proposes slots for every unit that doesn't have a timetable entry yet this term.
            Nothing is saved until you review and confirm below.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={genProgramme}
              onChange={(e) => setGenProgramme(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select programme</option>
              {options.programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.level ? ` — Level ${p.level}` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate Draft'}
            </button>
          </div>

          {genMessage && (
            <p className="text-sm text-gray-600">{genMessage}</p>
          )}

          {draft && draft.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-x-auto mt-3">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2">Lecturer</th>
                    <th className="px-3 py-2">Day</th>
                    <th className="px-3 py-2">Start</th>
                    <th className="px-3 py-2">End</th>
                    <th className="px-3 py-2">Room</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {draft.map((d, i) => (
                    <tr key={`${d.unitId}-${i}`}>
                      <td className="px-3 py-2 font-medium text-gray-800">{d.unitName}</td>
                      <td className="px-3 py-2">
                        <select
                          value={d.lecturerId || ''}
                          onChange={(e) => updateDraftRow(i, { lecturerId: e.target.value || null })}
                          className="border border-gray-300 rounded px-2 py-1 text-xs"
                        >
                          <option value="">Unassigned</option>
                          {options.lecturers.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={d.dayOfWeek}
                          onChange={(e) => updateDraftRow(i, { dayOfWeek: Number(e.target.value) })}
                          className="border border-gray-300 rounded px-2 py-1 text-xs"
                        >
                          {days.map((day) => (
                            <option key={day.value} value={day.value}>{day.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          value={d.startTime}
                          onChange={(e) => updateDraftRow(i, { startTime: e.target.value })}
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-24"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          value={d.endTime}
                          onChange={(e) => updateDraftRow(i, { endTime: e.target.value })}
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-24"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={d.room}
                          onChange={(e) => updateDraftRow(i, { room: e.target.value })}
                          placeholder="Room"
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-20"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => removeDraftRow(i)} className="text-red-600 text-xs">
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={savingDraft}
                  className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {savingDraft ? 'Saving...' : `Confirm & Save ${draft.length} Entries`}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ============ MANUAL SINGLE ENTRY ============ */}
        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-5">
            Create Timetable Entry
          </h2>

          {loading ? (
            <div className="text-gray-500">
              Loading programmes, units and lecturers...
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Programme
                </label>

                <select
                  value={selectedProgramme}
                  onChange={(e) => changeProgramme(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">Select programme</option>
                  {options.programmes.map((programme) => (
                    <option
                      key={programme.id}
                      value={programme.id}
                    >
                      {programme.name}
                      {programme.level
                        ? ` — Level ${programme.level}`
                        : ''}
                      {programme.department?.name
                        ? ` — ${programme.department.name}`
                        : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit *
                </label>

                <select
                  value={selectedUnit}
                  onChange={(e) =>
                    setSelectedUnit(e.target.value)
                  }
                  disabled={!selectedProgramme || filteredUnits.length === 0}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-100"
                >
                  <option value="">
                    {!selectedProgramme
                      ? 'Select programme first'
                      : filteredUnits.length === 0
                        ? 'No units available'
                        : 'Select unit'}
                  </option>

                  {filteredUnits.map((unit) => (
                    <option
                      key={unit.id}
                      value={unit.id}
                    >
                      {unit.code ? `${unit.code} — ` : ''}
                      {unit.name}
                    </option>
                  ))}
                </select>

                {!filteredUnits.length && (
                  <p className="text-xs text-gray-500 mt-1">
                    No units found for this selection.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lecturer
                </label>

                <select
                  value={selectedLecturer}
                  onChange={(e) =>
                    setSelectedLecturer(e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">
                    Select lecturer
                  </option>

                  {options.lecturers.map((lecturer) => (
                    <option
                      key={lecturer.id}
                      value={lecturer.id}
                    >
                      {lecturer.name}
                      {lecturer.email
                        ? ` — ${lecturer.email}`
                        : ''}
                    </option>
                  ))}
                </select>

                {!options.lecturers.length && (
                  <p className="text-xs text-red-500 mt-1">
                    No users with TEACHER role were found.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Day *
                </label>

                <select
                  value={dayOfWeek}
                  onChange={(e) =>
                    setDayOfWeek(e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  {days.map((day) => (
                    <option
                      key={day.value}
                      value={day.value}
                    >
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time *
                </label>

                <input
                  type="time"
                  value={startTime}
                  onChange={(e) =>
                    setStartTime(e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Time *
                </label>

                <input
                  type="time"
                  value={endTime}
                  onChange={(e) =>
                    setEndTime(e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Room
                </label>

                <input
                  value={room}
                  onChange={(e) =>
                    setRoom(e.target.value)
                  }
                  placeholder="e.g. Lab 1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>

                <input
                  value={notes}
                  onChange={(e) =>
                    setNotes(e.target.value)
                  }
                  placeholder="Optional"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  onClick={createEntry}
                  disabled={saving}
                  className="bg-rgreen text-white px-5 py-2.5 rounded-lg disabled:opacity-50"
                >
                  {saving
                    ? 'Creating...'
                    : 'Create Timetable Entry'}
                </button>
              </div>

            </div>
          )}
        </section>

        {/* ============ GRID VIEW ============ */}
        {view === 'grid' && (
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Weekly Grid</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="border border-gray-100 bg-gray-50 px-2 py-2 w-16"></th>
                    {days.map((d) => (
                      <th key={d.value} className="border border-gray-100 bg-gray-50 px-2 py-2 text-left">
                        {d.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GRID_HOURS.map((hour) => (
                    <tr key={hour}>
                      <td className="border border-gray-100 px-2 py-2 text-gray-400 align-top">
                        {hourLabel(hour)}
                      </td>
                      {days.map((d) => {
                        const cellEntries = entries.filter((e) => {
                          const startHour = parseInt(e.startTime.split(':')[0], 10);
                          return e.dayOfWeek === d.value && startHour === hour;
                        });
                        return (
                          <td key={d.value} className="border border-gray-100 px-2 py-2 align-top min-w-[140px]">
                            {cellEntries.map((e) => (
                              <div key={e.id} className="bg-green-50 border border-green-200 rounded-lg p-2 mb-1">
                                <div className="font-medium text-gray-900">{e.unit.name}</div>
                                <div className="text-gray-500">{e.startTime}–{e.endTime}</div>
                                <div className="text-gray-500">{e.lecturer?.name || 'Unassigned'}</div>
                                {e.room && <div className="text-gray-400">{e.room}</div>}
                                <button
                                  type="button"
                                  onClick={() => deleteEntry(e.id)}
                                  className="text-red-600 mt-1"
                                >
                                  Delete
                                </button>
                              </div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ============ LIST VIEW ============ */}
        {view === 'list' && (
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">
                Current Timetable
              </h2>
            </div>

            {entries.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No timetable entries have been created yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3">Day</th>
                      <th className="text-left px-4 py-3">Time</th>
                      <th className="text-left px-4 py-3">Unit</th>
                      <th className="text-left px-4 py-3">Programme</th>
                      <th className="text-left px-4 py-3">Lecturer</th>
                      <th className="text-left px-4 py-3">Room</th>
                      <th className="text-left px-4 py-3">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-3">
                          {days.find((day) => day.value === entry.dayOfWeek)?.label ?? entry.dayOfWeek}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {entry.startTime} – {entry.endTime}
                        </td>
                        <td className="px-4 py-3">
                          {entry.unit.name}
                          {entry.unit.code && (
                            <div className="text-xs text-gray-500">{entry.unit.code}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">{entry.unit.program?.name ?? '—'}</td>
                        <td className="px-4 py-3">{entry.lecturer?.name ?? 'Not assigned'}</td>
                        <td className="px-4 py-3">{entry.room ?? '—'}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => deleteEntry(entry.id)} className="text-red-600 hover:underline">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

      </div>
    </PortalLayout>
  );
}
"""

with open(TIMETABLE_PAGE_PATH, "w", encoding="utf-8") as f:
    f.write(timetable_page_content)
print(f"[OK] Rewrote {TIMETABLE_PAGE_PATH} (grid view + AI generate + list view preserved)")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/ (no migration needed -- no schema change).")
