// Seeds the database with real Runyenjes data: site settings, departments,
// programs (from the brochure), core groups, and a few starter accounts.
// Run with: npm run prisma:seed

import { PrismaClient, Role, GroupType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// department name -> list of { name, level, entryRequirements, examBody, isShortCourse }
const CATALOG: Record<
  string,
  { name: string; level: string | null; entryRequirements?: string; examBody?: string; isShortCourse?: boolean }[]
> = {
  'Building & Civil Engineering': [
    { name: 'Land Survey', level: 'Level 5' },
    { name: 'Land Survey', level: 'Level 6' },
    { name: 'Civil Engineering', level: 'Level 6' },
    { name: 'Building Technology', level: 'Level 4' },
    { name: 'Building Technology', level: 'Level 5' },
    { name: 'Building Technology', level: 'Level 6' },
    { name: 'Masonry', level: 'Level 3' },
    { name: 'Masonry', level: 'Level 4' },
    { name: 'Masonry', level: 'Level 5' },
    { name: 'Plumbing', level: 'Level 3' },
    { name: 'Plumbing', level: 'Level 4' },
    { name: 'Plumbing', level: 'Level 5' },
    { name: 'Carpentry', level: 'Level 4' },
    { name: 'Carpentry', level: 'Level 5' },
    { name: 'Carpentry', level: 'Level 6' },
  ],
  'Mechanical & Automotive Engineering': [
    { name: 'Automotive Technology', level: 'Level 5' },
    { name: 'Automotive Technology', level: 'Level 6' },
    { name: 'Welding', level: 'Level 3' },
    { name: 'Welding', level: 'Level 4' },
    { name: 'Welding', level: 'Level 5' },
    { name: 'Motor Vehicle Mechanics', level: 'Level 3' },
    { name: 'Motor Vehicle Mechanics', level: 'Level 4' },
  ],
  'Agriculture & Environment Studies': [
    { name: 'Agricultural Extension', level: 'Level 5' },
    { name: 'Agricultural Extension', level: 'Level 6' },
    { name: 'Sustainable Agriculture for Rural Development', level: 'Level 4' },
    { name: 'Sustainable Agriculture for Rural Development', level: 'Level 5' },
    { name: 'General Agriculture', level: 'Level 4' },
    { name: 'Horticulture Nursery Management', level: 'Level 4' },
  ],
  'Electrical & Electronics Engineering': [
    { name: 'Electrical Engineering', level: 'Level 5' },
    { name: 'Electrical Engineering', level: 'Level 6' },
    { name: 'Electrical Installation', level: 'Level 3' },
    { name: 'Electrical Installation', level: 'Level 4' },
  ],
  'Computing & Informatics': [
    { name: 'ICT Technician', level: 'Level 5' },
    { name: 'ICT Technician', level: 'Level 6' },
    { name: 'ICT Assistant', level: 'Level 4' },
    { name: 'Mobile Repair', level: 'Level 4' },
  ],
  'Business Studies & Entrepreneurship': [
    { name: 'Office Administration', level: 'Level 5' },
    { name: 'Office Administration', level: 'Level 6' },
    { name: 'Office Assistant', level: 'Level 4' },
    { name: 'Business Management', level: 'Level 5' },
    { name: 'Business Management', level: 'Level 6' },
    { name: 'ATD', level: 'Level 1' },
    { name: 'ATD', level: 'Level 2' },
    { name: 'ATD', level: 'Level 3' },
    { name: 'CPA', level: 'Foundation', examBody: 'KASNEB' },
    { name: 'CPA', level: 'Intermediate', examBody: 'KASNEB' },
    { name: 'CPA', level: 'Advanced', examBody: 'KASNEB' },
    { name: 'Supply Chain Management', level: 'Level 5' },
    { name: 'Supply Chain Management', level: 'Level 6' },
  ],
  'Liberal Studies': [
    { name: 'Social Work & Community Development', level: 'Level 4' },
    { name: 'Social Work & Community Development', level: 'Level 5' },
    { name: 'Social Work & Community Development', level: 'Level 6' },
  ],
  'Hospitality & Institutional Management': [
    { name: 'Food & Beverage Management', level: 'Level 6' },
    { name: 'Food & Beverage Operations', level: 'Level 5' },
    { name: 'Food & Beverage Production', level: 'Level 3' },
    { name: 'Food & Beverage Production', level: 'Level 4' },
  ],
  'Fashion & Design': [
    { name: 'Fashion & Design', level: 'Level 3' },
    { name: 'Fashion & Design', level: 'Level 4' },
    { name: 'Fashion & Design', level: 'Level 5' },
    { name: 'Fashion & Design', level: 'Level 6' },
  ],
  Cosmetology: [
    { name: 'Cosmetology', level: 'Level 3' },
    { name: 'Cosmetology', level: 'Level 4' },
    { name: 'Cosmetology', level: 'Level 5' },
    { name: 'Cosmetology', level: 'Level 6' },
  ],
};

// Short courses live in their own department for simplicity
const SHORT_COURSES = [
  'Motor Rewinding', 'Machine Automation', 'CCTV Camera Installation', 'Bread Baking',
  'Cake Baking & Decoration', 'Graphic Design', 'Web Design', 'QuickBooks', 'AutoCAD',
  'Computer Networking', 'Computer Repair', 'Laptop Repair', 'Programming (C, C++, Java)',
  'Nail Technology', 'Make Up', 'Barbering', 'Customer Care', 'Public Relations',
  'Screen Printing', 'Soft Furnishing', 'Tie and Die', 'Tiling', 'Painting', 'Computer Packages',
];

async function main() {
  // 1. Site settings (single row)
  await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      institutionName: 'Runyenjes Technical & Vocational College',
      shortName: 'Runyenjes TVC',
      tagline: 'Empowering Through Skills and Technology',
      primaryColor: '#0B7A2B',
      secondaryColor: '#5C0F00',
      address: 'P.O. Box 239-60103, Runyenjes',
      phone: '0797210054',
      email: 'runyenjestti@gmail.com',
      website: 'www.runyenjestechnical.ac.ke',
    },
  });
  console.log('✔ Site settings ready');

  // 2. Departments + programs
  for (const [deptName, programs] of Object.entries(CATALOG)) {
    const dept = await prisma.department.upsert({
      where: { name: deptName },
      update: {},
      create: { name: deptName },
    });

    for (const p of programs) {
      const program = await prisma.program.create({
        data: {
          departmentId: dept.id,
          name: p.name,
          level: p.level,
          entryRequirements: p.entryRequirements ?? null,
          examBody: p.examBody ?? 'TVET CDACC',
          isShortCourse: false,
        },
      });
      // every program gets its own CLASS group (chat + library scope)
      await prisma.group.create({
        data: {
          type: GroupType.CLASS,
          programId: program.id,
          name: `${p.name} ${p.level ?? ''}`.trim(),
        },
      });
    }

    // one DEPARTMENT-wide group per department
    await prisma.group.create({
      data: { type: GroupType.DEPARTMENT, departmentId: dept.id, name: `${deptName} — Department` },
    });
  }
  console.log('✔ Departments & programs seeded');

  // 3. Short courses department
  const shortDept = await prisma.department.upsert({
    where: { name: 'Short Courses' },
    update: {},
    create: { name: 'Short Courses' },
  });
  for (const name of SHORT_COURSES) {
    const program = await prisma.program.create({
      data: { departmentId: shortDept.id, name, level: null, isShortCourse: true },
    });
    await prisma.group.create({
      data: { type: GroupType.CLASS, programId: program.id, name },
    });
  }
  console.log('✔ Short courses seeded');

  // 4. School-wide, Teachers, Admins groups
  await prisma.group.createMany({
    data: [
      { type: GroupType.SCHOOL, name: 'Whole School' },
      { type: GroupType.TEACHERS, name: 'Teachers' },
      { type: GroupType.ADMINS, name: 'Admins' },
    ],
  });
  console.log('✔ School-wide groups created');

  // 5. Starter accounts — CHANGE THESE PASSWORDS after first login
  const founderPass = await bcrypt.hash('ChangeMe123!', 10);
  const adminPass = await bcrypt.hash('ChangeMe123!', 10);
  const registrarPass = await bcrypt.hash('ChangeMe123!', 10);

  await prisma.user.upsert({
    where: { email: 'founder@runyenjestechnical.ac.ke' },
    update: {},
    create: {
      name: 'Collins Kariuki (Founder)',
      email: 'founder@runyenjestechnical.ac.ke',
      passwordHash: founderPass,
      role: Role.FOUNDER,
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@runyenjestechnical.ac.ke' },
    update: {},
    create: {
      name: 'Principal (Demo Admin)',
      email: 'admin@runyenjestechnical.ac.ke',
      passwordHash: adminPass,
      role: Role.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: 'registrar@runyenjestechnical.ac.ke' },
    update: {},
    create: {
      name: 'Registrar (Demo)',
      email: 'registrar@runyenjestechnical.ac.ke',
      passwordHash: registrarPass,
      role: Role.REGISTRAR,
    },
  });

  console.log('✔ Starter accounts created (founder, admin, registrar) — password for all: ChangeMe123!');
  console.log('\nSeed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
