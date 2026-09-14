#!/usr/bin/env python3
"""
Adds department-wide AI timetable generation, so a registrar doesn't have
to repeat the generate->review->save cycle once per programme:
  1. ai.routes.ts -> refactor timetable-suggestion into a reusable
     function, extend the route to accept EITHER programId (unchanged,
     single-programme) OR departmentId (loops every programme in that
     department sequentially, carrying forward already-drafted slots so
     programmes sharing a lecturer/room don't collide with each other)
  2. RegistrarTimetable.tsx -> add a "By Programme" / "By Department"
     toggle in the AI Generate section; department mode shows every
     drafted entry across all that department's programmes in one
     combined review table, with a Programme column, before one Save All.

REQUIRES add_timetable_engine.py to have already been run successfully
first -- this script's anchors match that script's exact output.

No schema change, no migration needed.
Safe to re-run: checks whether already applied first.
"""
import os

ROOT = os.path.join(os.path.expanduser("~"), "runyenjes-platform")
AI_ROUTES_PATH = os.path.join(ROOT, "backend", "src", "routes", "ai.routes.ts")
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
# 1. ai.routes.ts -- refactor into a reusable function + department mode
# ------------------------------------------------------------------
if already_applied(AI_ROUTES_PATH, "generateDraftForProgramme"):
    print(f"[SKIP] Department-wide generation already present -> {AI_ROUTES_PATH}")
else:
    old_route = '''// ---------- AI Timetable Suggestion: draft schedule for a programme's unscheduled units ----------
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

'''

    new_route = '''// ---------- Shared helper: draft a schedule for ONE programme's unscheduled ----------
// units, given a running list of slots already busy (from the DB plus
// anything drafted earlier in the same batch, so sibling programmes in a
// department-wide generation don't collide with each other).
type BusySlot = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  lecturerId: string | null;
};

async function generateDraftForProgramme(
  programId: string,
  termId: string,
  busySlots: BusySlot[]
): Promise<{ programId: string; programName: string; entries: any[]; message?: string }> {
  const program = await prisma.program.findUnique({ where: { id: programId }, include: { units: true } });
  if (!program) {
    return { programId, programName: 'Unknown programme', entries: [], message: 'Programme not found' };
  }

  const existingForProgram = await prisma.timetableEntry.findMany({
    where: { termId, unitId: { in: program.units.map((u) => u.id) } },
  });
  const scheduledUnitIds = new Set(existingForProgram.map((e) => e.unitId));
  const unitsNeeding = program.units.filter((u) => !scheduledUnitIds.has(u.id));

  if (unitsNeeding.length === 0) {
    return {
      programId,
      programName: program.name,
      entries: [],
      message: 'Every unit in this programme already has a timetable entry this term.',
    };
  }

  const assignments = await prisma.unitLecturer.findMany({
    where: { unitId: { in: unitsNeeding.map((u) => u.id) }, termId },
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

  const busyText =
    busySlots
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
${busyText}

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
    return { programId, programName: program.name, entries: parsed.entries || [] };
  } catch (err) {
    return {
      programId,
      programName: program.name,
      entries: [],
      message: err instanceof SyntaxError ? 'The AI returned an unexpected format for this programme.' : 'AI generation failed for this programme.',
    };
  }
}

// ---------- AI Timetable Suggestion: single programme OR a whole department ----------
// Returns a DRAFT only -- nothing is saved here. The registrar reviews
// and edits in the grid, then explicitly saves via the bulk endpoint.
// Department mode loops every programme in the department SEQUENTIALLY,
// carrying forward each programme's drafted slots into the next
// programme's prompt, so two programmes sharing a lecturer/room in the
// same batch don't collide with each other either.
router.post(
  '/timetable-suggestion',
  requireAuth,
  requireRole('REGISTRAR', 'ADMIN'),
  async (req, res) => {
    const { programId, departmentId } = req.body;
    if (!programId && !departmentId) {
      return res.status(400).json({ error: 'programId or departmentId is required' });
    }

    const term = await prisma.term.findFirst({ where: { isActive: true } });
    if (!term) return res.status(400).json({ error: 'No active academic term' });

    const existingEntries = await prisma.timetableEntry.findMany({ where: { termId: term.id } });
    const busySlots: BusySlot[] = existingEntries.map((e) => ({
      dayOfWeek: e.dayOfWeek,
      startTime: e.startTime,
      endTime: e.endTime,
      room: e.room,
      lecturerId: e.lecturerId,
    }));

    if (programId) {
      const result = await generateDraftForProgramme(programId, term.id, busySlots);
      return res.json({
        entries: result.entries.map((e: any) => ({ ...e, programName: result.programName })),
        message: result.message,
      });
    }

    // Department mode: every programme in the department, one at a time.
    const programmes = await prisma.program.findMany({ where: { departmentId }, select: { id: true } });
    if (programmes.length === 0) {
      return res.json({ entries: [], message: 'This department has no programmes.' });
    }

    const allEntries: any[] = [];
    const perProgrammeMessages: string[] = [];

    for (const p of programmes) {
      const result = await generateDraftForProgramme(p.id, term.id, busySlots);

      for (const e of result.entries) {
        allEntries.push({ ...e, programName: result.programName });
        // Carry this newly-drafted slot forward so the NEXT programme's
        // prompt in this loop knows not to collide with it.
        busySlots.push({
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          endTime: e.endTime,
          room: e.room || null,
          lecturerId: e.lecturerId || null,
        });
      }

      if (result.message) {
        perProgrammeMessages.push(`${result.programName}: ${result.message}`);
      }
    }

    res.json({
      entries: allEntries,
      message: allEntries.length === 0
        ? 'No units needed scheduling across this department.'
        : perProgrammeMessages.length > 0
          ? `Generated ${allEntries.length} entries. Notes: ${perProgrammeMessages.join('; ')}`
          : undefined,
    });
  }
);

'''

    replace_once(AI_ROUTES_PATH, old_route, new_route, "ai.routes.ts department-wide timetable generation")

# ------------------------------------------------------------------
# 2. RegistrarTimetable.tsx -- add By Programme / By Department toggle
# ------------------------------------------------------------------
if already_applied(TIMETABLE_PAGE_PATH, "genMode"):
    print(f"[SKIP] Department toggle already wired into {TIMETABLE_PAGE_PATH}")
else:
    old_interface = "interface DraftEntry {\n  unitId: string;\n  unitName: string;\n  lecturerId: string | null;\n  dayOfWeek: number;\n  startTime: string;\n  endTime: string;\n  room: string;\n}\n"
    new_interface = "interface DraftEntry {\n  unitId: string;\n  unitName: string;\n  programName?: string;\n  lecturerId: string | null;\n  dayOfWeek: number;\n  startTime: string;\n  endTime: string;\n  room: string;\n}\n"
    replace_once(TIMETABLE_PAGE_PATH, old_interface, new_interface, "DraftEntry programName field")

    old_state = (
        "  // AI generation\n"
        "  const [genProgramme, setGenProgramme] = useState('');\n"
    )
    new_state = (
        "  // AI generation\n"
        "  const [genMode, setGenMode] = useState<'programme' | 'department'>('programme');\n"
        "  const [genProgramme, setGenProgramme] = useState('');\n"
        "  const [genDepartment, setGenDepartment] = useState('');\n"
    )
    replace_once(TIMETABLE_PAGE_PATH, old_state, new_state, "genMode/genDepartment state")

    old_generate = '''  async function handleGenerate() {
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
  }'''

    new_generate = '''  async function handleGenerate() {
    if (genMode === 'programme' && !genProgramme) {
      setGenMessage('Select a programme first.');
      return;
    }
    if (genMode === 'department' && !genDepartment) {
      setGenMessage('Select a department first.');
      return;
    }
    setGenerating(true);
    setGenMessage('');
    setDraft(null);
    try {
      const data = await api('/ai/timetable-suggestion', {
        method: 'POST',
        token,
        body:
          genMode === 'programme'
            ? { programId: genProgramme }
            : { departmentId: genDepartment },
      });
      if (data.message) setGenMessage(data.message);
      if (!data.entries || data.entries.length === 0) {
        return;
      }
      const unitNameOf = (id: string) => options.units.find((u) => u.id === id)?.name || id;
      setDraft(
        data.entries.map((e: any) => ({
          unitId: e.unitId,
          unitName: unitNameOf(e.unitId),
          programName: e.programName,
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
  }'''

    replace_once(TIMETABLE_PAGE_PATH, old_generate, new_generate, "handleGenerate supports department mode")

    old_ui = '''          <div className="flex flex-wrap gap-2 items-center">
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
          </div>'''

    new_ui = '''          <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
            <button
              type="button"
              onClick={() => setGenMode('programme')}
              className={`px-3 py-1.5 text-xs rounded-md ${genMode === 'programme' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
            >
              By Programme
            </button>
            <button
              type="button"
              onClick={() => setGenMode('department')}
              className={`px-3 py-1.5 text-xs rounded-md ${genMode === 'department' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
            >
              By Department (faster for bulk setup)
            </button>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {genMode === 'programme' ? (
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
            ) : (
              <select
                value={genDepartment}
                onChange={(e) => setGenDepartment(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select department</option>
                {Array.from(new Set(options.programmes.map((p) => p.departmentId)))
                  .map((deptId) => options.programmes.find((p) => p.departmentId === deptId)?.department)
                  .filter((d): d is { id: string; name: string } => !!d)
                  .map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
              </select>
            )}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {generating ? (genMode === 'department' ? 'Generating (this may take a while)...' : 'Generating...') : 'Generate Draft'}
            </button>
          </div>'''

    replace_once(TIMETABLE_PAGE_PATH, old_ui, new_ui, "AI generate section mode toggle UI")

    old_table_head = '''                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2">Lecturer</th>'''
    new_table_head = '''                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    {genMode === 'department' && <th className="px-3 py-2">Programme</th>}
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2">Lecturer</th>'''
    replace_once(TIMETABLE_PAGE_PATH, old_table_head, new_table_head, "draft table Programme column header")

    old_table_row = '''                    <tr key={`${d.unitId}-${i}`}>
                      <td className="px-3 py-2 font-medium text-gray-800">{d.unitName}</td>'''
    new_table_row = '''                    <tr key={`${d.unitId}-${i}`}>
                      {genMode === 'department' && (
                        <td className="px-3 py-2 text-gray-500">{d.programName || '—'}</td>
                      )}
                      <td className="px-3 py-2 font-medium text-gray-800">{d.unitName}</td>'''
    replace_once(TIMETABLE_PAGE_PATH, old_table_row, new_table_row, "draft table Programme column cell")

print("\nDone. Next: npx tsc --noEmit in both backend/ and frontend/ (no migration needed -- no schema change).")
