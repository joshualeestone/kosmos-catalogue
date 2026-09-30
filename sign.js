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
 * The private key lives only in this repo's Actions secret CATALOGUE_SIGNING_KEY. Rotating it
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

function main() {
  const pem = process.env.CATALOGUE_SIGNING_KEY;
  if (!pem) { process.stderr.write('refused: CATALOGUE_SIGNING_KEY is not set\n'); return 1; }
  const file = path.join(DIST, 'catalogue.json');
  if (!fs.existsSync(file)) { process.stderr.write('refused: dist/catalogue.json does not exist; run node build.js first\n'); return 1; }
  const bytes = fs.readFileSync(file);
  let sig;
  try { sig = sign(bytes, pem); } catch (e) { process.stderr.write(`refused: the signing key could not be used (${e.code || 'bad key'})\n`); return 1; }
  if (!verify(bytes, sig, fs.readFileSync(PUBLIC_KEY, 'utf8'))) {
    process.stderr.write('refused: the signature does not verify against signing-key.pub.pem; the secret is not the key Kosmos trusts\n');
    return 1;
  }
  fs.writeFileSync(file + '.sig', sig + '\n');
  process.stdout.write('signed dist/catalogue.json\n');
  return 0;
}

module.exports = { sign, verify };
if (require.main === module) process.exitCode = main();
