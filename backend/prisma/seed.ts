// SAFE_PUBLIC_SEED_V1
// The public seed intentionally contains no school data and creates no
// accounts. A new institution is configured through the setup wizard at /setup.
//
// Developers of a specific institution can keep a private seed at
// prisma/private/seed.local.ts (that folder is git-ignored). If it exists, it
// runs; otherwise nothing happens.

import fs from 'fs';
import path from 'path';

const privateSeed = path.join(__dirname, 'private', 'seed.local.ts');

if (fs.existsSync(privateSeed)) {
  console.log('Running private seed: prisma/private/seed.local.ts');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(privateSeed);
} else {
  console.log('Nothing to seed. Use the setup wizard (/setup) to configure a new institution.');
}
