#!/usr/bin/env node
/**
 * DEMO DATA SEEDER  (fictional data only)
 *
 * Fills a SEPARATE demo database so every screen has examples: students, teachers, attendance, results,
 * assignments, applications (with a duplicate pair for the AI to spot), requests at each approval stage,
 * fees, stores, HR, alumni, announcements, chat history.
 *
 * It NEVER reads DATABASE_URL. It only uses DEMO_DATABASE_URL, and it refuses to run when:
 *   - the database is called "neondb" (the live one)
 *   - it points at the same database as backend/.env
 *   - CONFIRM_DEMO is not exactly the database name (you type it, as a deliberate second step)
 *
 * Usage (from ~/runyenjes-platform/backend, after the demo database has its tables, see the steps I gave):
 *   DEMO_DATABASE_URL='postgresql://...' CONFIRM_DEMO=demo node scripts/seed_demo.js
 * To wipe and re-seed an already seeded DEMO database:  add  RESET=yes
 */
const fs = require('fs');
const path = require('path');

function die(msg) { console.error('\n[STOP] ' + msg + '\n'); process.exit(1); }

const url = process.env.DEMO_DATABASE_URL;
if (!url) die('DEMO_DATABASE_URL is not set. (This script never uses DATABASE_URL.)');
let parsed;
try { parsed = new URL(url); } catch { die('DEMO_DATABASE_URL is not a valid URL.'); }
const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
if (!dbName) die('DEMO_DATABASE_URL has no database name.');
if (dbName === 'neondb') die('That is the database called "neondb", which is the LIVE one. Refusing.');
if (process.env.CONFIRM_DEMO !== dbName) die(`To confirm, set CONFIRM_DEMO=${dbName} (the database name, typed by you).`);

// refuse when it matches the database in backend/.env
for (const envPath of [path.join(__dirname, '..', '.env'), path.join(process.cwd(), '.env')]) {
  try {
    const m = fs.readFileSync(envPath, 'utf8').match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\r\n]+)/m);
    if (m) {
      const live = new URL(m[1]);
      const liveDb = decodeURIComponent(live.pathname.replace(/^\//, ''));
      if (live.hostname === parsed.hostname && liveDb === dbName) die('DEMO_DATABASE_URL is the same database as backend/.env. Refusing.');
    }
  } catch (e) { if (e.code !== 'ENOENT' && !String(e.message).startsWith('Invalid URL')) throw e; }
}

process.env.DATABASE_URL = url;
const { PrismaClient } = require(process.env.SEED_PRISMA_MODULE || '@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// ------------------------------------------------------------------ helpers
let seed = 20261029;
function rnd() { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => Math.round(lo + rnd() * (hi - lo));
const DAY = 86400000;
const now = new Date();
const daysAgo = (n) => new Date(now.getTime() - n * DAY);
const daysAhead = (n) => new Date(now.getTime() + n * DAY);
const midnight = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const FIRST = ['Wanjiru', 'Kamau', 'Achieng', 'Otieno', 'Njeri', 'Kiptoo', 'Chebet', 'Mutiso', 'Wambui', 'Omondi', 'Atieno', 'Karanja', 'Nyokabi', 'Kibet', 'Akinyi', 'Muthoni', 'Barasa', 'Naliaka', 'Hassan', 'Fatuma', 'Kiprono', 'Wafula', 'Auma', 'Mwikali', 'Cheruiyot', 'Nafula', 'Maina', 'Jepkorir', 'Odhiambo', 'Wairimu', 'Kioko', 'Adhiambo', 'Ruto', 'Syokau', 'Gitau', 'Mumbi'];
const LAST = ['Mwangi', 'Ochieng', 'Kariuki', 'Wekesa', 'Kimani', 'Rotich', 'Ndegwa', 'Juma', 'Macharia', 'Simiyu', 'Njoroge', 'Langat', 'Mutua', 'Okello', 'Waweru', 'Koech', 'Nyaga', 'Abdi', 'Gathoni', 'Kosgei', 'Mbugua', 'Owino', 'Nzioka', 'Chelimo', 'Wanyama'];
const usedNames = new Set();
function uniqueName(offset) {
  for (let i = 0; i < 500; i++) {
    const n = `${FIRST[(offset + i * 5) % FIRST.length]} ${LAST[(offset * 7 + i * 3) % LAST.length]}`;
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
  throw new Error('out of names');
}
const emailOf = (name, tag = '') => name.toLowerCase().replace(/[^a-z]+/g, '.') + tag + '@demo.test';
const phoneOf = () => '07' + String(between(10000000, 29999999));
const grade = (s) => (s >= 70 ? 'Distinction' : s >= 60 ? 'Credit' : s >= 50 ? 'Pass' : 'Fail');
const PASSWORD = '1234';

(async () => {
  const host = parsed.hostname;
  console.log(`Demo database: ${dbName} on ${host}`);

  // ---- reset or refuse
  const existing = await prisma.user.count();
  if (existing > 0 && process.env.RESET !== 'yes') die(`This demo database already has ${existing} users. Add RESET=yes to wipe it and seed again.`);
  if (process.env.RESET === 'yes') {
    const rows = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    const list = rows.map((r) => `"${r.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    console.log('[OK]   demo database wiped');
  }

  const hash = await bcrypt.hash(PASSWORD, 10);

  // ---- settings
  await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1, institutionName: 'Runyenjes Technical and Vocational College', shortName: 'Runyenjes TVC',
      tagline: 'Skills for a working future', primaryColor: '#14A84A', secondaryColor: '#0E3B2E',
      address: 'P.O. Box 000, Runyenjes', phone: '+254 700 000 000', email: 'info@demo.test', website: 'https://demo.test',
      about: 'Demo data for presentation only.', mpesaPaybill: '000000', mpesaAccountNumber: 'ADMISSION',
    },
  });
  await prisma.reportNote.upsert({ where: { id: 1 }, update: {}, create: { id: 1, content: 'Term 3: enrolment is steady. Attendance in two classes needs follow-up. Fee balances are being tracked by Finance.' } });
  console.log('[OK]   settings');

  // ---- departments and programmes
  // The college's real departments and programmes (88), copied from the live Programmes page.
  const T = 'TVET CDACC';
  const L = (n, ...lv) => lv.map((x) => [n, 'Level ' + x, T, false]);
  const CATALOG = [
    ['Agriculture & Environment Studies', [...L('Agricultural Extension', 5, 6), ...L('Sustainable Agriculture for Rural Development', 4, 5), ...L('General Agriculture', 4), ...L('Horticulture Nursery Management', 4)]],
    ['Building & Civil Engineering', [...L('Land Survey', 5, 6), ...L('Civil Engineering', 6), ...L('Building Technology', 4, 5, 6), ...L('Masonry', 3, 4, 5), ...L('Plumbing', 3, 4, 5), ...L('Carpentry', 4, 5, 6)]],
    ['Business Studies & Entrepreneurship', [...L('Office Administration', 5, 6), ...L('Office Assistant', 4), ...L('Business Management', 5, 6), ...L('ATD', 1, 2, 3), ['CPA', 'Foundation', 'KASNEB', false], ['CPA', 'Intermediate', 'KASNEB', false], ['CPA', 'Advanced', 'KASNEB', false], ...L('Supply Chain Management', 5, 6)]],
    ['Computing & Informatics', [...L('ICT Technician', 5, 6), ...L('ICT Assistant', 4), ...L('Mobile Repair', 4)]],
    ['Cosmetology', [...L('Cosmetology', 3, 4, 5, 6)]],
    ['Electrical & Electronics Engineering', [...L('Electrical Engineering', 5, 6), ...L('Electrical Installation', 3, 4)]],
    ['Fashion & Design', [...L('Fashion & Design', 3, 4, 5, 6)]],
    ['Hospitality & Institutional Management', [...L('Food & Beverage Management', 6), ...L('Food & Beverage Operations', 5), ...L('Food & Beverage Production', 3, 4)]],
    ['Liberal Studies', [...L('Social Work & Community Development', 4, 5, 6)]],
    ['Mechanical & Automotive Engineering', [...L('Automotive Technology', 5, 6), ...L('Welding', 3, 4, 5), ...L('Motor Vehicle Mechanics', 3, 4)]],
    ['Short Courses', ['Motor Rewinding', 'Machine Automation', 'CCTV Camera Installation', 'Bread Baking', 'Cake Baking & Decoration', 'Graphic Design', 'Web Design', 'QuickBooks', 'AutoCAD', 'Computer Networking', 'Computer Repair', 'Laptop Repair', 'Programming (C, C++, Java)', 'Nail Technology', 'Make Up', 'Barbering', 'Customer Care', 'Public Relations', 'Screen Printing', 'Soft Furnishing', 'Tie and Die', 'Tiling', 'Painting', 'Computer Packages'].map((n) => [n, null, null, true])],
  ];
  // The programmes that get units, students, attendance and results in the demo.
  const DEMO = {
    'Agricultural Extension|Level 6': { fee: 12000, units: ['Extension Methods', 'Crop Husbandry', 'Animal Production', 'Farm Management', 'Soil and Water Conservation'] },
    'Civil Engineering|Level 6': { fee: 18000, units: ['Engineering Mathematics', 'Surveying', 'Structural Mechanics', 'Construction Materials', 'Highway Engineering'] },
    'Building Technology|Level 5': { fee: 16000, units: ['Building Drawing', 'Masonry and Concrete Work', 'Carpentry and Joinery', 'Plumbing Basics', 'Site Safety'] },
    'ICT Technician|Level 6': { fee: 15000, units: ['Computer Networks', 'Database Systems', 'Web Development', 'Systems Analysis', 'Computer Maintenance'] },
    'Business Management|Level 5': { fee: 14000, units: ['Principles of Management', 'Accounting', 'Entrepreneurship', 'Marketing', 'Business Law'] },
    'Electrical Engineering|Level 6': { fee: 18000, units: ['Circuit Theory', 'Electrical Installation', 'Electronics', 'Electrical Machines', 'Power Systems'] },
    'Cosmetology|Level 4': { fee: 13000, units: ['Hair Care and Styling', 'Skin Care', 'Nail Care', 'Salon Management', 'Health and Hygiene'] },
    'Automotive Technology|Level 5': { fee: 17000, units: ['Engine Systems', 'Vehicle Electrical Systems', 'Transmission', 'Workshop Practice', 'Vehicle Diagnostics'] },
  };
  const depts = {};
  const programs = [];
  let progTotal = 0;
  for (const [dn, plist] of CATALOG) {
    depts[dn] = await prisma.department.create({ data: { name: dn } });
    for (const [pn, level, body, short] of plist) {
      const prog = await prisma.program.create({
        data: { departmentId: depts[dn].id, name: pn, level, examBody: body, isShortCourse: short, entryRequirements: short ? null : 'KCSE mean grade of D plain or above' },
      });
      progTotal++;
      const d = DEMO[pn + '|' + level];
      if (!d) continue;
      await prisma.programFee.create({ data: { programId: prog.id, amount: d.fee, setBy: 'demo' } });
      const units = [];
      for (const u of d.units) units.push(await prisma.unit.create({ data: { programId: prog.id, name: u } }));
      programs.push({ dept: dn, name: pn, level, fee: d.fee, units: d.units, id: prog.id, deptId: depts[dn].id, unitRows: units, students: [] });
    }
  }
  console.log(`[OK]   ${CATALOG.length} departments, ${progTotal} programmes (${programs.length} with units and students)`);

  // ---- term
  const term = await prisma.term.create({ data: { name: 'Term 3 2026', startDate: daysAgo(42), endDate: daysAhead(35), isActive: true } });

  // ---- staff
  async function mkUser(name, role, extra = {}) {
    return prisma.user.create({ data: { name, email: extra.email || emailOf(name), passwordHash: hash, role, phone: phoneOf(), ...extra } });
  }
  const staff = {};
  staff.admin = await mkUser('Demo Administrator', 'ADMIN', { email: 'admin@demo.test' });
  staff.registrar = await mkUser('Demo Registrar', 'REGISTRAR', { email: 'registrar@demo.test' });
  staff.finance = await mkUser('Demo Finance Officer', 'FINANCE_OFFICER', { email: 'finance@demo.test' });
  staff.hr = await mkUser('Demo HR Officer', 'HR_OFFICER', { email: 'hr@demo.test' });
  staff.exam = await mkUser('Demo Exam Officer', 'EXAM_OFFICER', { email: 'exams@demo.test' });
  staff.stores = await mkUser('Demo Stores Officer', 'STORES_OFFICER', { email: 'stores@demo.test' });
  staff.procurement = await mkUser('Demo Procurement Officer', 'PROCUREMENT_OFFICER', { email: 'procurement@demo.test' });
  staff.support = await mkUser('Demo Support Staff', 'SUPPORT_STAFF', { email: 'support@demo.test' });
  const roleUser = { ADMIN: staff.admin, REGISTRAR: staff.registrar, FINANCE_OFFICER: staff.finance, HR_OFFICER: staff.hr, EXAM_OFFICER: staff.exam, STORES_OFFICER: staff.stores, PROCUREMENT_OFFICER: staff.procurement };

  // teachers: one per programme
  const teachers = [];
  for (let i = 0; i < programs.length; i++) {
    const t = await mkUser('Mr/Ms ' + uniqueName(i * 2 + 1), 'TEACHER', { email: i === 0 ? 'teacher@demo.test' : `teacher${i + 1}@demo.test`, departmentId: programs[i].deptId });
    teachers.push(t);
    programs[i].teacher = t;
  }

  // staff profiles and leave
  const staffList = [staff.registrar, staff.finance, staff.hr, staff.exam, staff.stores, staff.procurement, staff.support, ...teachers];
  let empNo = 100;
  for (const u of staffList) {
    await prisma.staffProfile.create({
      data: {
        userId: u.id, employeeNumber: 'EMP-' + String(++empNo), position: u.role === 'TEACHER' ? 'Instructor' : u.name.replace('Demo ', ''),
        employmentType: u.role === 'TEACHER' && empNo % 3 === 0 ? 'CONTRACT' : 'FULL_TIME', dateHired: daysAgo(between(200, 2500)), nationalId: String(between(20000000, 39999999)),
      },
    });
  }
  await prisma.leaveRequest.createMany({
    data: [
      { staffId: teachers[0].id, type: 'ANNUAL', startDate: daysAhead(20), endDate: daysAhead(27), reason: 'Family visit', status: 'PENDING' },
      { staffId: teachers[2].id, type: 'SICK', startDate: daysAgo(12), endDate: daysAgo(10), reason: 'Medical', status: 'APPROVED', approvedById: staff.hr.id },
      { staffId: staff.finance.id, type: 'ANNUAL', startDate: daysAhead(40), endDate: daysAhead(50), reason: 'Annual leave', status: 'PENDING' },
      { staffId: teachers[4].id, type: 'OTHER', startDate: daysAgo(30), endDate: daysAgo(29), reason: 'Training workshop', status: 'REJECTED', approvedById: staff.hr.id },
    ],
  });
  console.log('[OK]   staff, teachers, HR profiles and leave');

  // ---- students (30)
  const students = [];
  for (let i = 0; i < 32; i++) {
    const prog = programs[i % programs.length];
    const name = uniqueName(i * 3 + 11);
    const adm = String(i + 1).padStart(4, '0');
    const atRisk = i === 0 || i === 2 || i === 4 || i === 9;
    const u = await prisma.user.create({
      data: { name, email: i === 0 ? 'student@demo.test' : `s${adm}@demo.test`, passwordHash: hash, role: 'STUDENT', admissionNumber: adm, phone: phoneOf(), departmentId: prog.deptId },
    });
    const enr = await prisma.enrollment.create({ data: { studentId: u.id, programId: prog.id, enrolledAt: daysAgo(between(60, 300)) } });
    for (const unit of prog.unitRows) await prisma.unitRegistration.create({ data: { enrollmentId: enr.id, studentId: u.id, unitId: unit.id, termId: term.id } });
    const s = { user: u, adm, prog, enr, atRisk, ability: atRisk ? between(28, 42) : between(55, 90) };
    students.push(s);
    prog.students.push(s);
    if (i % 2 === 0) await prisma.continuationCheckIn.create({ data: { termId: term.id, userId: u.id, status: 'CONFIRMED', confirmedAt: daysAgo(40) } });
  }
  console.log(`[OK]   ${students.length} students with unit registrations`);

  // ---- teaching, timetable
  const TIMES = [['08:00', '10:00'], ['10:30', '12:30'], ['14:00', '16:00'], ['08:00', '10:00']];
  for (let pi = 0; pi < programs.length; pi++) {
    const prog = programs[pi];
    for (let ui = 0; ui < prog.unitRows.length; ui++) {
      const unit = prog.unitRows[ui];
      await prisma.unitLecturer.create({ data: { unitId: unit.id, lecturerId: prog.teacher.id, termId: term.id } });
      const [start, end] = TIMES[(pi + ui) % 3];
      await prisma.timetableEntry.create({
        data: { unitId: unit.id, lecturerId: prog.teacher.id, termId: term.id, dayOfWeek: (ui % 5) + 1, startTime: start, endTime: end, room: `Room ${String.fromCharCode(65 + pi)}${ui + 1}` },
      });
      await prisma.material.create({ data: { unitId: unit.id, uploadedBy: prog.teacher.id, fileUrl: 'https://example.com/demo/' + unit.name.toLowerCase().replace(/[^a-z]+/g, '-') + '-notes.pdf', type: 'PDF' } });
    }
  }
  console.log('[OK]   lecturers, timetable, learning materials');

  // ---- attendance: last 8 weekdays
  const dates = [];
  for (let d = 0; dates.length < 8; d++) { const x = midnight(daysAgo(d)); const dow = x.getUTCDay(); if (dow !== 0 && dow !== 6) dates.push(x); }
  const attendance = [];
  for (const st of students) {
    for (const unit of st.prog.unitRows) {
      for (const date of dates) {
        const r = rnd();
        const status = st.atRisk ? (r < 0.5 ? 'ABSENT' : r < 0.6 ? 'LATE' : 'PRESENT') : r < 0.85 ? 'PRESENT' : r < 0.9 ? 'LATE' : r < 0.97 ? 'ABSENT' : 'EXCUSED';
        attendance.push({ unitId: unit.id, termId: term.id, studentId: st.user.id, date, status, recordedById: st.prog.teacher.id });
      }
    }
  }
  await prisma.attendanceRecord.createMany({ data: attendance });
  console.log(`[OK]   ${attendance.length} attendance records`);

  // ---- exams and results
  let resultCount = 0;
  for (const prog of programs) {
    for (const unit of prog.unitRows) {
      const cat = await prisma.exam.create({ data: { unitId: unit.id, termId: term.id, name: 'CAT 1', examDate: daysAgo(21), maxScore: 100, weight: 30, createdById: prog.teacher.id } });
      await prisma.exam.create({ data: { unitId: unit.id, termId: term.id, name: 'End of Term Exam', examDate: daysAhead(25), maxScore: 100, weight: 70, createdById: prog.teacher.id } });
      const rows = prog.students.map((st) => {
        const score = Math.max(5, Math.min(98, st.ability + between(-8, 8)));
        resultCount++;
        return { examId: cat.id, studentId: st.user.id, score, grade: grade(score), recordedById: prog.teacher.id };
      });
      if (rows.length) await prisma.examResult.createMany({ data: rows });
    }
  }
  console.log(`[OK]   exams and ${resultCount} results`);

  // ---- assignments
  let subCount = 0;
  for (const prog of programs) {
    for (let ui = 0; ui < 3; ui++) {
      const unit = prog.unitRows[ui];
      const past = ui < 2;
      const a = await prisma.assignment.create({
        data: {
          unitId: unit.id, termId: term.id, title: past ? `${unit.name}: practical report` : `${unit.name}: group task`,
          description: 'Submit a short report with your findings. Plain language is fine.', dueDate: past ? daysAgo(10 - ui * 3) : daysAhead(7), maxScore: 100, createdById: prog.teacher.id,
        },
      });
      for (const st of prog.students) {
        if (rnd() > (past ? 0.85 : 0.35)) continue;
        const score = past ? Math.max(20, Math.min(98, st.ability + between(-10, 10))) : null;
        await prisma.assignmentSubmission.create({
          data: {
            assignmentId: a.id, studentId: st.user.id, textAnswer: 'Demo submission text for the assignment.', submittedAt: daysAgo(past ? 11 : 1),
            ...(past ? { score, feedback: score >= 60 ? 'Good work. Clear and well organised.' : 'Please add more detail and examples.', gradedById: prog.teacher.id, gradedAt: daysAgo(6) } : {}),
          },
        });
        subCount++;
      }
    }
  }
  console.log(`[OK]   assignments and ${subCount} submissions`);

  // ---- fees
  let paid = 0, partial = 0, unpaid = 0;
  for (let i = 0; i < students.length; i++) {
    const st = students[i];
    const fee = st.prog.fee;
    const inv = await prisma.invoice.create({
      data: { studentId: st.user.id, termId: term.id, description: 'Term 3 2026 tuition', amount: fee, dueDate: daysAgo(7), status: 'PENDING' },
    });
    const r = i % 10;
    let amountPaid = 0;
    if (r < 6) amountPaid = fee; else if (r < 9) amountPaid = Math.round(fee * (0.3 + rnd() * 0.4) / 100) * 100;
    if (amountPaid > 0) {
      await prisma.feePayment.create({ data: { invoiceId: inv.id, amount: amountPaid, method: 'MPESA', reference: 'DM' + String(between(10000000, 99999999)), recordedById: staff.finance.id, paidAt: daysAgo(between(5, 35)) } });
    }
    const status = amountPaid >= fee ? 'PAID' : amountPaid > 0 ? 'PARTIALLY_PAID' : 'OVERDUE';
    if (status === 'PAID') paid++; else if (status === 'PARTIALLY_PAID') partial++; else unpaid++;
    await prisma.invoice.update({ where: { id: inv.id }, data: { status } });
  }
  console.log(`[OK]   invoices: ${paid} paid, ${partial} part-paid, ${unpaid} overdue`);

  // ---- applications (12) with one duplicate pair and verified / pending payments
  const apps = [
    ['Esther Wangui', 'esther.wangui@demo.test', 0, 'January 2027', 'SUBMITTED', true],
    ['Esther wangui', 'esther.w@demo.test', 0, 'January 2027', 'SUBMITTED', false],
    ['Brian Kiprop', 'brian.kiprop@demo.test', 4, 'January 2027', 'SUBMITTED', true],
    ['Salome Nduta', 'salome.nduta@demo.test', 5, 'January 2027', 'SUBMITTED', true],
    ['Peter Mwenda', 'peter.mwenda@demo.test', 2, 'January 2027', 'SUBMITTED', false],
    ['Lilian Chepkoech', 'lilian.chepkoech@demo.test', 1, 'May 2027', 'SUBMITTED', true],
    ['Dennis Kinyua', 'dennis.kinyua@demo.test', 6, 'January 2027', 'WAITLISTED', true],
    ['Faith Mueni', 'faith.mueni@demo.test', 3, 'January 2027', 'ADMITTED', true],
    ['Joseph Lekishon', 'joseph.lekishon@demo.test', 4, 'September 2026', 'REPORTED', true],
    ['Rose Nyambura', 'rose.nyambura@demo.test', 5, 'January 2027', 'REJECTED', true],
    ['Samuel Mugo', 'samuel.mugo@demo.test', 2, 'January 2027', 'SUBMITTED', true],
    ['Cynthia Akoth', 'cynthia.akoth@demo.test', 6, 'May 2027', 'SUBMITTED', false],
  ];
  for (const [name, email, pi, intake, status, payOk] of apps) {
    const a = await prisma.application.create({
      data: {
        applicantName: name, email, phone: phoneOf(), idNumber: String(between(30000000, 39999999)), programId: programs[pi].id, intake, status,
        ...(status !== 'SUBMITTED' ? { reviewedById: staff.registrar.id } : {}), createdAt: daysAgo(between(1, 14)),
      },
    });
    await prisma.payment.create({
      data: { applicationId: a.id, amount: 1000, method: 'MPESA', reference: payOk ? 'AD' + String(between(10000000, 99999999)) : null, status: payOk ? 'verified' : 'pending', ...(payOk ? { verifiedById: staff.registrar.id } : {}) },
    });
  }
  console.log(`[OK]   ${apps.length} applications (includes a duplicate pair)`);

  // ---- requests at each stage (chains are an assumption: see message)
  const CHAINS = {
    CLEARANCE: ['STORES_OFFICER', 'FINANCE_OFFICER', 'REGISTRAR'],
    ACADEMIC_REQUISITION: ['REGISTRAR'],
    PROGRAMME_CHANGE: ['REGISTRAR', 'ADMIN'],
    GRADUATION: ['EXAM_OFFICER', 'FINANCE_OFFICER', 'REGISTRAR'],
  };
  async function mkRequest(student, type, doneStages, finalStatus, payload) {
    const chain = CHAINS[type];
    const rejected = finalStatus === 'REJECTED';
    const status = doneStages >= chain.length && !rejected ? 'APPROVED' : rejected ? 'REJECTED' : 'PENDING';
    const req = await prisma.request.create({ data: { type, status, submitterId: student.user.id, payload, currentStage: Math.min(doneStages, chain.length - 1), createdAt: daysAgo(between(2, 9)) } });
    for (let i = 0; i < chain.length; i++) {
      const done = i < doneStages;
      const rejectedHere = rejected && i === doneStages - 1;
      await prisma.requestStage.create({
        data: {
          requestId: req.id, order: i, approverRole: chain[i],
          status: rejectedHere ? 'REJECTED' : done ? 'APPROVED' : 'PENDING',
          ...(done ? { actedById: roleUser[chain[i]].id, actedAt: daysAgo(1), comment: rejectedHere ? 'Outstanding fee balance.' : 'Cleared.' } : {}),
        },
      });
    }
  }
  await mkRequest(students[1], 'CLEARANCE', 0, 'PENDING', { reason: 'End of programme clearance' });
  await mkRequest(students[3], 'CLEARANCE', 1, 'PENDING', { reason: 'End of programme clearance' });
  await mkRequest(students[5], 'CLEARANCE', 2, 'PENDING', { reason: 'End of programme clearance' });
  await mkRequest(students[6], 'CLEARANCE', 3, 'APPROVED', { reason: 'End of programme clearance' });
  await mkRequest(students[7], 'ACADEMIC_REQUISITION', 0, 'PENDING', { reason: 'Request for a copy of results slip' });
  await mkRequest(students[8], 'PROGRAMME_CHANGE', 0, 'PENDING', { reason: 'Wishes to move to a related programme' });
  await mkRequest(students[10], 'GRADUATION', 2, 'REJECTED', { reason: 'Graduation application' });
  console.log('[OK]   requests at several approval stages');

  // ---- announcements and home feed
  const ann = [
    ['Graduation day: Thursday 29 October', 'Graduates and guests are invited to the graduation ceremony. A rehearsal is planned for Wednesday. Graduates should be in the hall by 8:00 am.', 1],
    ['End of term examinations', 'The end of term examination timetable will be released next week. Please clear any fee balance before sitting.', 3],
    ['Fee payment reminder', 'Students with outstanding balances should visit the Finance office. Payments can be made by M-Pesa; keep your receipt.', 5],
    ['ICT department open day', 'The ICT department will open its labs to visitors on Friday afternoon. All students are welcome.', 8],
  ];
  for (const [title, body, ago] of ann) await prisma.announcement.create({ data: { title, body, postedById: staff.registrar.id, createdAt: daysAgo(ago) } });
  const posts = ['Welcome back for Term 3. Please check your timetable on the platform.', 'Congratulations to our graduating class. We are proud of you.', 'Reminder: the library closes at 5:00 pm on weekdays.'];
  for (let i = 0; i < posts.length; i++) await prisma.post.create({ data: { authorId: staff.admin.id, content: posts[i], createdAt: daysAgo(i * 2 + 1) } });

  // ---- groups and chat
  const school = await prisma.group.create({ data: { type: 'SCHOOL', name: 'Whole College' } });
  const allUsers = [...Object.values(staff), ...teachers, ...students.map((s) => s.user)];
  await prisma.groupMember.createMany({ data: allUsers.map((u) => ({ groupId: school.id, userId: u.id })), skipDuplicates: true });
  await prisma.message.create({ data: { groupId: school.id, senderId: staff.registrar.id, content: 'Welcome to the college group. Official notices will be posted here.' } });
  for (const prog of programs) {
    const g = await prisma.group.create({ data: { type: 'CLASS', name: `${prog.name} ${prog.level}`, programId: prog.id, departmentId: prog.deptId } });
    await prisma.groupMember.createMany({ data: [{ groupId: g.id, userId: prog.teacher.id, roleInGroup: 'teacher' }, ...prog.students.map((s) => ({ groupId: g.id, userId: s.user.id }))], skipDuplicates: true });
    await prisma.message.create({ data: { groupId: g.id, senderId: prog.teacher.id, content: 'Please bring your notes to the next class.' } });
    if (prog.students[0]) await prisma.message.create({ data: { groupId: g.id, senderId: prog.students[0].user.id, content: 'Noted, thank you.' } });
  }
  console.log('[OK]   announcements, feed, groups and chat');

  // ---- stores and procurement
  const items = [
    ['Cement (50 kg bag)', 'Building', 'bags', 120, 40, 'Building & Civil Engineering'], ['River sand', 'Building', 'tonnes', 18, 10, 'Building & Civil Engineering'],
    ['Copper wire 2.5 mm', 'Electrical', 'rolls', 6, 10, 'Electrical & Electronics Engineering'], ['Circuit breakers', 'Electrical', 'pcs', 45, 20, 'Electrical & Electronics Engineering'],
    ['Maize seed', 'Agriculture', 'kg', 80, 30, 'Agriculture & Environment Studies'], ['Fertiliser (DAP)', 'Agriculture', 'kg', 15, 40, 'Agriculture & Environment Studies'],
    ['A4 paper', 'Office', 'reams', 60, 20, 'Business Studies & Entrepreneurship'], ['Network cables (Cat6)', 'ICT', 'pcs', 12, 15, 'Computing & Informatics'],
    ['Safety helmets', 'Safety', 'pcs', 35, 15, 'Building & Civil Engineering'], ['Whiteboard markers', 'Office', 'boxes', 24, 8, 'Business Studies & Entrepreneurship'],
  ];
  const itemRows = [];
  for (const [name, category, uom, qty, reorder, dept] of items) {
    const it = await prisma.inventoryItem.create({ data: { name, category, uom, quantityOnHand: qty, reorderLevel: reorder, departmentId: depts[dept].id } });
    itemRows.push(it);
    await prisma.stockMovement.create({ data: { itemId: it.id, type: 'RECEIPT', quantity: qty + 10, reason: 'Opening stock', recordedById: staff.stores.id, createdAt: daysAgo(40) } });
    await prisma.stockMovement.create({ data: { itemId: it.id, type: 'ISSUE', quantity: 10, reason: 'Issued to department for practicals', recordedById: staff.stores.id, createdAt: daysAgo(12) } });
  }
  const prs = [[2, 20, 'Copper wire is below the reorder level for installation practicals.', 'PENDING'], [5, 60, 'Fertiliser needed for the demonstration plots.', 'APPROVED'], [7, 20, 'Cabling for the networking lab.', 'ORDERED'], [0, 50, 'Restock for the construction workshop.', 'RECEIVED']];
  for (const [i, quantity, justification, status] of prs) {
    await prisma.purchaseRequest.create({ data: { itemId: itemRows[i].id, quantity, justification, status, requestedById: staff.stores.id, ...(status !== 'PENDING' ? { approvedById: staff.admin.id } : {}) } });
  }
  console.log('[OK]   stores and procurement');

  // ---- alumni and jobs
  const alumni = [];
  for (let i = 0; i < 4; i++) {
    const name = uniqueName(i * 4 + 5);
    const u = await prisma.user.create({ data: { name, email: i === 0 ? 'alumni@demo.test' : emailOf(name), passwordHash: hash, role: 'ALUMNI', phone: phoneOf() } });
    await prisma.alumniProfile.create({ data: { userId: u.id, graduationYear: 2023 + (i % 3), currentEmployer: ['Kenya Power', 'County Government', 'A local construction firm', 'A farmers cooperative'][i], currentPosition: ['Technician', 'ICT Officer', 'Site Supervisor', 'Extension Officer'][i] } });
    alumni.push(u);
  }
  await prisma.jobPosting.createMany({
    data: [
      { title: 'Electrical Technician', company: 'Demo Power Services', location: 'Embu', description: 'Install and maintain electrical systems. Diploma in Electrical Engineering required.', contactEmail: 'jobs@demo.test', postedById: alumni[0].id },
      { title: 'ICT Support Officer', company: 'Demo County Offices', location: 'Runyenjes', description: 'Support staff computers and networks. Diploma in ICT required.', applyLink: 'https://demo.test/apply', postedById: staff.admin.id },
      { title: 'Farm Extension Assistant', company: 'Demo Farmers Cooperative', location: 'Embu', description: 'Visit member farms and train on crop practices.', postedById: alumni[3].id, status: 'CLOSED' },
    ],
  });
  console.log('[OK]   alumni and job postings');

  // ---- AI chat history, notes, audit log
  const conv = await prisma.aIConversation.create({ data: { userId: students[0].user.id, unitId: programs[0].unitRows[1].id, title: 'Revision: crop rotation' } });
  await prisma.aIMessage.createMany({
    data: [
      { conversationId: conv.id, role: 'user', content: 'Can you explain crop rotation in simple words?' },
      { conversationId: conv.id, role: 'assistant', content: 'Crop rotation means growing different crops on the same piece of land in different seasons. It keeps the soil healthy, reduces pests and diseases, and cuts the need for fertiliser. For example, you can follow maize with beans, because beans put nitrogen back into the soil.' },
      { conversationId: conv.id, role: 'user', content: 'Give me one exam-style question on it.' },
      { conversationId: conv.id, role: 'assistant', content: 'Explain three benefits of crop rotation to a small-scale farmer. (6 marks)' },
    ],
  });
  const conv2 = await prisma.aIConversation.create({ data: { userId: teachers[4].id, title: 'Lesson plan: database design' } });
  await prisma.aIMessage.createMany({
    data: [
      { conversationId: conv2.id, role: 'user', content: 'Draft a 40 minute lesson plan on database normalisation for Level 6 ICT.' },
      { conversationId: conv2.id, role: 'assistant', content: 'Objective: learners explain first, second and third normal form with an example.\n1. Starter (5 minutes): show a messy student table and ask what goes wrong.\n2. Teaching (15 minutes): remove repeating groups, then partial dependencies, then transitive dependencies.\n3. Practice (15 minutes): pairs normalise a small fee-payment table.\n4. Review (5 minutes): quick quiz.' },
    ],
  });
  await prisma.note.createMany({
    data: [
      { userId: students[0].user.id, title: 'Soil pH', content: 'Most crops grow best between pH 6 and 7. Lime raises pH; sulphur lowers it.' },
      { userId: students[0].user.id, title: 'Questions for next class', content: 'Ask about drip irrigation costs.' },
    ],
  });
  const audit = [
    ['GRADE_UPDATED', 'ExamResult', 'CAT 1 score corrected', staff.registrar.id], ['USER_CREATED', 'User', 'New teacher account created', staff.admin.id],
    ['INVOICE_PAYMENT_RECORDED', 'Invoice', 'M-Pesa payment recorded', staff.finance.id], ['LETTER_ISSUED', 'IssuedLetter', 'Admission letter issued', staff.registrar.id],
    ['APPLICATION_ADMITTED', 'Application', 'Applicant admitted', staff.registrar.id], ['SETTINGS_UPDATED', 'SiteSettings', 'Contact details updated', staff.admin.id],
  ];
  for (let i = 0; i < audit.length; i++) await prisma.auditLog.create({ data: { actorId: audit[i][3], action: audit[i][0], entityType: audit[i][1], target: audit[i][2], createdAt: daysAgo(i + 1) } });
  console.log('[OK]   AI history, notes, audit log');

  console.log('\nDONE. Demo logins (password for all: ' + PASSWORD + ')');
  console.log('  Admin      admin@demo.test');
  console.log('  Registrar  registrar@demo.test');
  console.log('  Finance    finance@demo.test');
  console.log('  HR         hr@demo.test');
  console.log('  Exams      exams@demo.test');
  console.log('  Stores     stores@demo.test');
  console.log('  Teacher    teacher@demo.test   (Agricultural Extension, Level 6)');
  console.log('  Student    student@demo.test   admission number ' + students[0].adm);
  console.log('  Alumni     alumni@demo.test');
  console.log('  Other students: admission numbers 0002 to 0032, with email s0002@demo.test to s0032@demo.test');
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
