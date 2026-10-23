// RUNYENJES-SETUP-V1
// Safety guard for the developer database commands (npm run prisma:migrate and
// npm run prisma:studio). Those commands can delete data. They run only against a
// database on this computer, unless ALLOW_REMOTE_DB=yes is set on purpose (for
// example by the developer, in their own .env).
require('dotenv/config');

const url = process.env.DATABASE_URL || '';
let host = '';
try {
  host = new URL(url).hostname;
} catch (e) {
  host = '';
}

const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal'].includes(host);

if (isLocal || process.env.ALLOW_REMOTE_DB === 'yes') {
  process.exit(0);
}

console.error('');
console.error(
  'Stopped: this command can delete data, and DATABASE_URL points to a remote database' +
    (host ? ' (' + host + ')' : '') + '.'
);
console.error('To apply database updates to a live database, use:  npm run migrate:deploy');
console.error('If you really mean to run a developer command against this database, set ALLOW_REMOTE_DB=yes first.');
console.error('');
process.exit(1);
