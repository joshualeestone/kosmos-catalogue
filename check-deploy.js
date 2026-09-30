'use strict';
/**
 * The deploy job's last gate: what came from the sign job is checked, not trusted.
 *
 *     BUILT_SERIAL=<the build job's serial> node check-deploy.js <dist folder>
 *
 * Refuses unless the signature verifies against the committed public key, the serial is the one the
 * build job made, and the folder holds exactly catalogue.json, its .sig and the portraits the
 * catalogue names, each matching its signed hash. No other file reaches Pages, and through it
 * installkosmos.com.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { verify } = require('./sign');

const PUBLIC_KEY = path.join(__dirname, 'signing-key.pub.pem');

/** Every regular file under dir, as a path relative to it with forward slashes. */
function filesUnder(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...filesUnder(dir, r));
    else out.push(r);             // a link or anything else is listed, so it counts as unexpected
  }
  return out;
}

/**
 * @param {{dist: string, builtSerial: string, publicKeyFile?: string}} opts
 * @returns {{ok: boolean, message: string}}
 */
function checkDeploy({ dist, builtSerial, publicKeyFile = PUBLIC_KEY }) {
  if (!/^\d+$/.test(String(builtSerial || ''))) return { ok: false, message: 'refused: the build job gave no serial' };
  let bytes;
  let sig;
  try {
    bytes = fs.readFileSync(path.join(dist, 'catalogue.json'));
    sig = fs.readFileSync(path.join(dist, 'catalogue.json.sig'), 'utf8').trim();
  } catch { return { ok: false, message: 'refused: catalogue.json or its signature is missing' }; }
  if (!verify(bytes, sig, fs.readFileSync(publicKeyFile, 'utf8'))) return { ok: false, message: 'refused: the signature does not verify' };
  let c;
  try { c = JSON.parse(bytes.toString('utf8')); } catch { return { ok: false, message: 'refused: catalogue.json is not JSON' }; }
  if (String(c.serial) !== String(builtSerial)) return { ok: false, message: `refused: serial ${c.serial} is not the built ${builtSerial}` };
  const want = new Set(['catalogue.json', 'catalogue.json.sig']);
  for (const t of c.teams || []) {
    for (const m of t.members || []) {
      if (!m.avatar || !m.avatar.image) continue;
      want.add(m.avatar.image);
      let h;
      try { h = crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, m.avatar.image))).digest('hex'); } catch { h = null; }
      if (h !== m.avatar.imageSha256) return { ok: false, message: `refused: ${m.avatar.image} is missing or does not match its hash` };
    }
  }
  const have = filesUnder(dist);
  const extra = have.filter((f) => !want.has(f));
  const missing = [...want].filter((f) => !have.includes(f));
  if (extra.length || missing.length) return { ok: false, message: `refused: unexpected files ${JSON.stringify(extra)}, missing ${JSON.stringify(missing)}` };
  return { ok: true, message: `deploying serial ${c.serial}, signature verified, ${have.length} files` };
}

function main(argv) {
  const { ok, message } = checkDeploy({ dist: argv[0] || 'dist', builtSerial: process.env.BUILT_SERIAL });
  (ok ? process.stdout : process.stderr).write(message + '\n');
  return ok ? 0 : 1;
}

module.exports = { checkDeploy };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
