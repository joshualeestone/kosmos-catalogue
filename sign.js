'use strict';
/**
 * Sign dist/catalogue.json so Kosmos can tell the file it downloads is the one this repo built.
 *
 *     CATALOGUE_SIGNING_KEY="<PKCS#8 PEM>" node sign.js
 *
 * Writes dist/catalogue.json.sig: the Ed25519 signature of the file's exact bytes, base64, one
 * line. Kosmos holds the public half (signing-key.pub.pem here) and refuses a catalogue whose
 * signature does not verify. Before writing, this checks the signature against that committed
 * public key, so a wrong or rotated secret fails the publish instead of shipping a file every
 * copy of Kosmos would refuse.
 *
 * The private key lives only in the catalogue-signing environment secret CATALOGUE_SIGNING_KEY. Rotating it
 * means a new key pair, a new signing-key.pub.pem, and a Kosmos release carrying the new public key.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, 'dist');
const PUBLIC_KEY = path.join(__dirname, 'signing-key.pub.pem');

function sign(bytes, privatePem) {
  return crypto.sign(null, bytes, crypto.createPrivateKey(privatePem)).toString('base64');
}

function verify(bytes, signature, publicPem) {
  try { return crypto.verify(null, bytes, crypto.createPublicKey(publicPem), Buffer.from(signature, 'base64')); } catch { return false; }
}

/**
 * Sign <dist>/catalogue.json, refusing unless the signature verifies against the public key.
 * @param {{pem?: string, dist?: string, publicKeyFile?: string}} opts
 * @returns {{ok: boolean, message: string}}
 */
function run({ pem, dist = DIST, publicKeyFile = PUBLIC_KEY } = {}) {
  if (!pem) return { ok: false, message: 'refused: CATALOGUE_SIGNING_KEY is not set' };
  const file = path.join(dist, 'catalogue.json');
  if (!fs.existsSync(file)) return { ok: false, message: 'refused: dist/catalogue.json does not exist; run node build.js first' };
  let publicPem;
  try {
    publicPem = fs.readFileSync(publicKeyFile, 'utf8');
    crypto.createPublicKey(publicPem);
  } catch (e) { return { ok: false, message: `refused: signing-key.pub.pem cannot be read as a public key (${e.code || 'bad key'})` }; }
  const bytes = fs.readFileSync(file);
  let sig;
  try { sig = sign(bytes, pem); } catch (e) { return { ok: false, message: `refused: the signing key could not be used (${e.code || 'bad key'})` }; }
  if (!verify(bytes, sig, publicPem)) {
    return { ok: false, message: 'refused: the signature does not verify against signing-key.pub.pem; the secret is not the key Kosmos trusts' };
  }
  fs.writeFileSync(file + '.sig', sig + '\n');
  return { ok: true, message: 'signed dist/catalogue.json' };
}

function main() {
  const { ok, message } = run({ pem: process.env.CATALOGUE_SIGNING_KEY });
  (ok ? process.stdout : process.stderr).write(message + '\n');
  return ok ? 0 : 1;
}

module.exports = { sign, verify, run };
if (require.main === module) process.exitCode = main();
