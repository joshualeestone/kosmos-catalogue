'use strict';
/**
 * The serial of the catalogue now published, for publish.yml, which fetches it and passes it to
 * build.js so the new serial exceeds it.
 *
 *     node published-serial.js <file> <http-status> <earlier-deployments>
 *
 * Prints the serial. A 404 is 0 only when no earlier deployment exists (the first publish); after
 * one, a missing file is an outage to stop on, never a reason to drop the floor to zero.
 */
const fs = require('node:fs');

/** @returns {{ok: true, serial: number} | {ok: false, because: string}} */
function publishedSerial(file, status, earlier) {
  if (status === '404') {
    return earlier === 0 ? { ok: true, serial: 0 } : { ok: false, because: `the published catalogue is missing (404) although ${earlier} deployment(s) came before` };
  }
  if (status !== '200') return { ok: false, because: `could not read the published catalogue (HTTP ${status})` };
  let c;
  try { c = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { ok: false, because: 'the published catalogue is not JSON' }; }
  if (!Number.isInteger(c.serial) || c.serial < 0) return { ok: false, because: 'the published catalogue has no serial' };
  return { ok: true, serial: c.serial };
}

function main([file, status, earlier]) {
  const n = Number(earlier);
  if (!Number.isInteger(n) || n < 0) { process.stderr.write(`refused: earlier deployments ${JSON.stringify(earlier)} is not a count\n`); return 1; }
  const r = publishedSerial(file, String(status), n);
  if (!r.ok) { process.stderr.write(`refused: ${r.because}\n`); return 1; }
  process.stdout.write(String(r.serial));
  return 0;
}

module.exports = { publishedSerial };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
