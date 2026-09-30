'use strict';
/**
 * The serial of the catalogue now published, for publish.yml, which fetches it and passes it to
 * build.js so the new serial exceeds it.
 *
 *     node published-serial.js <file> <http-status> <earlier-deployments>
 *
 * Prints the serial. A 404 is 0 only before the first publish: when no earlier Pages deployment
 * succeeded AND the committed marker `published` does not exist. After that, a missing file is an outage
 * to stop on, never a reason to drop the floor to zero. The marker is committed once, after the first
 * publish, so the answer does not rest on run history alone (runs can be deleted, a workflow renamed).
 */
const fs = require('node:fs');
const path = require('node:path');

const MARKER = path.join(__dirname, 'published');

/** @returns {{ok: true, serial: number} | {ok: false, because: string}} */
function publishedSerial(file, status, earlier, marker = MARKER) {
  const marked = fs.existsSync(marker);
  // After the first publish the marker must be committed; until it is, every publish stops here and
  // says so, rather than leaning on run history that can be deleted.
  if (earlier > 0 && !marked) return { ok: false, because: 'a publish has already succeeded, but the empty `published` marker is not committed; commit it, then publish again' };
  if (marked) earlier = Math.max(earlier, 1);
  if (status === '404') {
    return earlier === 0 ? { ok: true, serial: 0 } : { ok: false, because: `the published catalogue is missing (404) although ${earlier} deployment(s) came before` };
  }
  if (status !== '200') return { ok: false, because: `could not read the published catalogue (HTTP ${status})` };
  let c;
  try { c = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { ok: false, because: 'the published catalogue is not JSON' }; }
  if (!Number.isSafeInteger(c.serial) || c.serial < 0) return { ok: false, because: 'the published catalogue has no serial' };
  return { ok: true, serial: c.serial };
}

function main([file, status, earlier]) {
  const n = /^\d+$/.test(String(earlier)) ? Number(earlier) : NaN;
  if (!Number.isInteger(n)) { process.stderr.write(`refused: earlier deployments ${JSON.stringify(earlier)} is not a count\n`); return 1; }
  const r = publishedSerial(file, String(status), n);
  if (!r.ok) { process.stderr.write(`refused: ${r.because}\n`); return 1; }
  process.stdout.write(String(r.serial));
  return 0;
}

module.exports = { publishedSerial, main, MARKER };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
