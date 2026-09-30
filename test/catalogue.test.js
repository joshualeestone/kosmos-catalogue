'use strict';
/**
 * The catalogue's own rules, checked against the source files and the built catalogue.json.
 * Moved from the Kosmos repo's engine/catalogue.test.js (joshualeestone/kosmos#4632); the checks
 * that need Kosmos itself (the names create accepts, the role picker, the instruction file a team
 * member gets) stay there and run against the catalogue Kosmos downloads.
 *
 *   node --test test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const build = require('../build');
const source = require('../lib/source');

const REPO = path.join(__dirname, '..');
const built = () => build.build().catalogue;
/** The smallest bytes the builder takes as a WebP file: a RIFF container of form type WEBP. */
const webp = (tail = '') => Buffer.concat([Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'latin1'), Buffer.from(tail)]);

/** A throwaway copy of the source files, for tests that break one. */
function copyRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-copy-'));
  for (const f of ['groups.json', 'settings.json', 'kosmos-builtin-roles.json', 'roles', 'teams']) fs.cpSync(path.join(REPO, f), path.join(dir, f), { recursive: true });
  return dir;
}

test('the sources pass every check the builder makes', () => {
  assert.deepEqual(build.build().problems, []);
});

test('every role file reads back to the same text it was written from', () => {
  for (const key of fs.readdirSync(path.join(REPO, 'roles')).filter((n) => !n.startsWith('.'))) {
    const text = fs.readFileSync(path.join(REPO, 'roles', key, 'role.md'), 'utf8');
    const { role, problems } = source.parseRole(key, text);
    assert.deepEqual(problems, [], key);
    assert.equal(source.roleText(role), text, `${key}: role.md is not in the canonical layout`);
  }
});

test('every role opens with the line the board reads, and keys are lowercase words', () => {
  const c = built();
  assert.ok(c.roles.length > 0);
  for (const r of c.roles) {
    assert.match(r.key, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${r.key}: key`);
    assert.match(r.instructions[0], /^You are \*\*\{\{NAME\}\}\*\*, (a|an) [^\n]+\.$/, `${r.key} does not open "You are **{{NAME}}**, a ..."`);
    assert.ok(c.groups.includes(r.group), `${r.key}: unknown group`);
  }
});

test('teams: unique keys and ranks, a lead plus 4 or 5 reports, every member complete', () => {
  const c = built();
  assert.equal(new Set(c.teams.map((t) => t.key)).size, c.teams.length, 'two teams share a key');
  for (const kind of ['business', 'personal']) {
    const ranks = c.teams.filter((t) => t.kind === kind).map((t) => t.rank);
    assert.equal(new Set(ranks).size, ranks.length, `two ${kind} teams share a rank`);
  }
  const ids = new Set();
  for (const t of c.teams) {
    assert.ok(['business', 'personal'].includes(t.kind));
    const leads = t.members.filter((m) => m.reportsTo === null);
    assert.equal(leads.length, 1, `${t.key} has ${leads.length} leads`);
    assert.equal(leads[0].slot, 'lead');
    const reports = t.members.filter((m) => m.reportsTo !== null);
    assert.ok(reports.length >= 4 && reports.length <= 5, `${t.key} has ${reports.length} reports`);
    assert.ok(reports.every((m) => m.reportsTo === 'lead'));
    assert.equal(new Set(t.members.map((m) => m.slot)).size, t.members.length, `${t.key} repeats a slot`);
    for (const m of t.members) {
      assert.ok(m.title && m.name && m.role && Array.isArray(m.focus), `${t.key}/${m.slot}: incomplete`);
      for (const f of ['id', 'apparentAge', 'presentation', 'heritage', 'hair', 'attire', 'expression', 'prompt']) {
        assert.ok(typeof m.avatar[f] === 'string' && m.avatar[f], `${t.key}/${m.slot}: avatar.${f} missing`);
      }
      assert.ok(!ids.has(m.avatar.id), `avatar id ${m.avatar.id} repeats`);
      ids.add(m.avatar.id);
      if (m.avatar.image !== null) {
        assert.equal(build.sha256(fs.readFileSync(path.join(REPO, m.avatar.image))), m.avatar.imageSha256, `${m.avatar.image}: hash`);
      } else assert.equal(m.avatar.imageSha256, null);
    }
    assert.ok(t.label && t.blurb && t.purpose && t.project && t.project.name && t.project.goal, `${t.key}: missing text`);
    assert.match(t.caution, /lead briefs the rest of the team/);
  }
});

test('suggested names are unique across the whole catalogue, so two seeded teams can share a board', () => {
  const names = built().teams.flatMap((t) => t.members.map((m) => m.name.toLowerCase()));
  assert.equal(new Set(names).size, names.length);
});

test('no em dash in any spelling anywhere in the catalogue, and the builder refuses each one', () => {
  const blob = JSON.stringify(built());
  for (const s of build.EM_DASHES) assert.ok(!blob.includes(s), `found ${JSON.stringify(s)}`);
  // CONTROL: each spelling planted in a team focus line is refused.
  for (const s of build.EM_DASHES) {
    const { teamsSource } = source.read();
    teamsSource.teams[3].members[1].focus = [`Keep the books ${s} weekly.`];
    assert.ok(build.build({ teamsSource }).problems.some((p) => /em dash/.test(p)), `${JSON.stringify(s)} got through`);
  }
  const { teamsSource } = source.read();
  teamsSource.teams[1].members[1].focus = ['Keep &#0' + '8212; the list.'];   // built here, so this file carries no entity
  assert.ok(build.build({ teamsSource }).problems.some((p) => /em dash/.test(p)), 'a zero-padded entity got through');
});

test('the builder refuses a broken team', () => {
  const noLead = source.read().teamsSource; noLead.teams[0].members[0].slot = 'chief';
  assert.ok(build.build({ teamsSource: noLead }).problems.some((p) => /exactly one lead/.test(p)));
  const tooFew = source.read().teamsSource; tooFew.teams[0].members = tooFew.teams[0].members.slice(0, 4);
  assert.ok(build.build({ teamsSource: tooFew }).problems.some((p) => /4 or 5 reports/.test(p)));
  const twin = source.read().teamsSource; twin.teams[1].members[1].name = twin.teams[0].members[0].name.toUpperCase();
  assert.ok(build.build({ teamsSource: twin }).problems.some((p) => /suggested name/.test(p)));
});

test('the builder refuses role text whose wrap would split a code span', () => {
  // 66 characters of words, then a span: "`kosmos" still fits the 76-column line and "msg" does not.
  const prefix = 'word '.repeat(13) + 'w';
  assert.equal(prefix.length, 66, 'premise: the prefix length that forces the split');
  const { rolesSource } = source.read();
  rolesSource.roles[0].desc = `${prefix} \`kosmos msg someone "hi"\` today.`;
  assert.ok(build.build({ rolesSource }).problems.some((p) => /code span is split/.test(p)));
});

test('a role folder no group lists, a listed role with no folder, and a wrapped paragraph are refused', () => {
  const dir = copyRepo();
  try {
    assert.deepEqual(build.build({ root: dir }).problems, [], 'CONTROL: the untouched copy passes');
    fs.mkdirSync(path.join(dir, 'roles', 'stray'));
    fs.writeFileSync(path.join(dir, 'roles', 'stray', 'role.md'), fs.readFileSync(path.join(REPO, 'roles', 'cos', 'role.md')));
    const groups = JSON.parse(fs.readFileSync(path.join(dir, 'groups.json'), 'utf8'));
    groups[0].roles.push('ghost');
    fs.writeFileSync(path.join(dir, 'groups.json'), JSON.stringify(groups));
    const cos = path.join(dir, 'roles', 'cos', 'role.md');
    fs.writeFileSync(cos, fs.readFileSync(cos, 'utf8').replace('You are calm under a full calendar', 'You are calm\nunder a full calendar'));
    const p = build.build({ root: dir }).problems.join('\n');
    assert.match(p, /roles\/stray is not listed/);
    assert.match(p, /lists ghost, but roles\/ghost\/role\.md does not exist/);
    assert.match(p, /roles\/cos\/role\.md: Who you are must be one paragraph/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a team file must be named after its key', () => {
  const dir = copyRepo();
  try {
    const f = fs.readdirSync(path.join(dir, 'teams'))[0];
    fs.renameSync(path.join(dir, 'teams', f), path.join(dir, 'teams', 'renamed.json'));
    assert.ok(build.build({ root: dir }).problems.some((p) => /teams\/renamed\.json: its key is/.test(p)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('nothing in the sources looks like a person\'s machine, address or credential (this repo is public)', () => {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['.git', 'node_modules', 'dist'].includes(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } };
  walk(REPO);
  const bad = /\/Users\/|\/home\/[a-z]|C:\\\\Users|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|github_pat_|ghp_[A-Za-z0-9]{20}|sk-[A-Za-z0-9]{20}|BEGIN [A-Z ]*PRIVATE KEY/;
  const hits = files.filter((f) => !f.endsWith('catalogue.test.js')).filter((f) => bad.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits.map((f) => path.relative(REPO, f)), []);
  // CONTROL: the pattern sees each shape it is for.
  for (const s of ['/Users/someone/x', 'a@b.co', 'ghp_' + 'a'.repeat(20)]) assert.ok(bad.test(s), s);
});

test('a signature verifies only for the exact bytes and the matching key', () => {
  const crypto = require('node:crypto');
  const { sign, verify } = require('../sign');
  const pair = () => crypto.generateKeyPairSync('ed25519');
  const a = pair();
  const b = pair();
  const priv = a.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const pubA = a.publicKey.export({ type: 'spki', format: 'pem' });
  const pubB = b.publicKey.export({ type: 'spki', format: 'pem' });
  const bytes = Buffer.from(build.build().text);
  const sig = sign(bytes, priv);
  assert.equal(verify(bytes, sig, pubA), true, 'CONTROL: the matching key verifies');
  const tampered = Buffer.from(bytes); tampered[10] ^= 1;
  assert.equal(verify(tampered, sig, pubA), false, 'one changed byte still verified');
  assert.equal(verify(bytes, sig, pubB), false, 'another key verified');
  assert.equal(verify(bytes, 'not base64 at all', pubA), false);
});

test('the committed public key is an Ed25519 key', () => {
  const crypto = require('node:crypto');
  const key = crypto.createPublicKey(fs.readFileSync(path.join(REPO, 'signing-key.pub.pem'), 'utf8'));
  assert.equal(key.asymmetricKeyType, 'ed25519');
});

test('sign.js refuses a key that is not the committed one, and signs with the one that is', () => {
  const crypto = require('node:crypto');
  const { run, verify } = require('../sign');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-sign-'));
  try {
    fs.writeFileSync(path.join(dir, 'catalogue.json'), build.build().text);
    const pair = crypto.generateKeyPairSync('ed25519');
    const pem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
    const pubFile = path.join(dir, 'pub.pem');
    fs.writeFileSync(pubFile, pair.publicKey.export({ type: 'spki', format: 'pem' }));
    // Against the committed public key, a fresh key is the wrong secret.
    const wrong = run({ pem, dist: dir });
    assert.equal(wrong.ok, false);
    assert.match(wrong.message, /does not verify against signing-key\.pub\.pem/);
    assert.equal(fs.existsSync(path.join(dir, 'catalogue.json.sig')), false, 'a .sig was written for the wrong key');
    assert.match(run({ dist: dir, publicKeyFile: pubFile }).message, /CATALOGUE_SIGNING_KEY is not set/);
    assert.match(run({ pem, dist: path.join(dir, 'none'), publicKeyFile: pubFile }).message, /does not exist/);
    fs.writeFileSync(path.join(dir, 'bad.pem'), 'not a key');
    assert.match(run({ pem, dist: dir, publicKeyFile: path.join(dir, 'bad.pem') }).message, /cannot be read as a public key/);
    // CONTROL: the matching public key signs, and the signature verifies over the exact file.
    const good = run({ pem, dist: dir, publicKeyFile: pubFile });
    assert.equal(good.ok, true, good.message);
    const sig = fs.readFileSync(path.join(dir, 'catalogue.json.sig'), 'utf8').trim();
    assert.equal(verify(fs.readFileSync(path.join(dir, 'catalogue.json')), sig, fs.readFileSync(pubFile, 'utf8')), true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a member role must exist in the catalogue or in Kosmos, and a catalogue role may not reuse a built-in key', () => {
  const t = source.read().teamsSource;
  t.teams[0].members[1].role = 'no-such-role';
  assert.ok(build.build({ teamsSource: t }).problems.some((p) => /role "no-such-role" is neither/.test(p)));
  const r = source.read().rolesSource;
  r.roles[0].key = 'pm';
  assert.ok(build.build({ rolesSource: r }).problems.some((p) => /pm: Kosmos already has a built-in role/.test(p)));
  // CONTROL: a member on a built-in role (the accounting team's books) passes as it is.
  const members = source.read().teamsSource.teams.flatMap((x) => x.members);
  assert.ok(members.some((m) => m.role === 'books'), 'premise: some member uses a built-in role');
  assert.deepEqual(build.build().problems, []);
});

test('a portrait is published with its sha256 inside the signed catalogue, and a linked one is refused', () => {
  const dir = copyRepo();
  try {
    const id = build.build().catalogue.teams[0].members[0].avatar.id;
    fs.mkdirSync(path.join(dir, 'avatars'));
    fs.writeFileSync(path.join(dir, 'avatars', id + '.webp'), webp('image bytes'));
    const a = build.build({ root: dir }).catalogue.teams.flatMap((t) => t.members).find((m) => m.avatar.id === id).avatar;
    assert.equal(a.image, `avatars/${id}.webp`);
    assert.equal(a.imageSha256, build.sha256(webp('image bytes')));
    fs.writeFileSync(path.join(dir, 'avatars', id + '.webp'), 'not an image');
    assert.ok(build.build({ root: dir }).problems.some((p) => /is not a WebP image/.test(p)));
    fs.writeFileSync(path.join(dir, 'avatars', id + '.webp'), webp('x'.repeat(512 * 1024)));
    assert.ok(build.build({ root: dir }).problems.some((p) => /larger than/.test(p)));
    fs.rmSync(path.join(dir, 'avatars', id + '.webp'));
    fs.symlinkSync(path.join(REPO, 'README.md'), path.join(dir, 'avatars', id + '.webp'));
    assert.ok(build.build({ root: dir }).problems.some((p) => /must be a regular file/.test(p)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the serial is written into the catalogue as given', () => {
  assert.equal(build.build({ serial: 1759190400 }).catalogue.serial, 1759190400);
  assert.equal(build.build().catalogue.serial, 0);
});

test('a key or slot that is not lowercase words and hyphens is refused before it names a file', () => {
  const t = source.read().teamsSource;
  t.teams[0].members[1].slot = '../../x';
  assert.ok(build.build({ teamsSource: t }).problems.some((p) => /slot "\.\.\/\.\.\/x" must be lowercase/.test(p)));
  const k = source.read().teamsSource;
  k.teams[0].key = 'Bad Key';
  assert.ok(build.build({ teamsSource: k }).problems.some((p) => /team key "Bad Key"/.test(p)));
  const r = source.read().rolesSource;
  r.roles[0].key = 'a/b';
  assert.ok(build.build({ rolesSource: r }).problems.some((p) => /role key "a\/b"/.test(p)));
  // Two teams whose key and slot join to the same portrait id.
  const j = source.read().teamsSource;
  j.teams[0].key = 'x-y'; j.teams[0].members[1].slot = 'z';
  j.teams[1].key = 'x'; j.teams[1].members[1].slot = 'y-z';
  assert.ok(build.build({ teamsSource: j }).problems.some((p) => /portrait id x-y-z is used by/.test(p)));
  const dir = copyRepo();
  try {
    fs.writeFileSync(path.join(dir, 'groups.json'), JSON.stringify([{ group: 'G', roles: ['../escape'] }]));
    assert.ok(build.build({ root: dir }).problems.some((p) => /role key "\.\.\/escape"/.test(p)));
    fs.writeFileSync(path.join(dir, 'groups.json'), '{"not": "a list"}');
    assert.ok(build.build({ root: dir }).problems.some((p) => /groups\.json: must be a (JSON )?list/.test(p)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a serial is refused when there is none or when the commit clock was ahead of now', () => {
  const now = 1759190400;
  assert.equal(build.serialProblem(now - 60, now), null, 'CONTROL: a past commit time is fine');
  assert.equal(build.serialProblem(now + 600, now), null, 'a small skew is allowed');
  assert.match(build.serialProblem(now + 7200, now), /later than now/);
  assert.match(build.serialProblem(0, now), /no serial/);
});

test('main: refuses outside a git checkout, and in one writes the catalogue with its serial and portraits', () => {
  const { execFileSync } = require('node:child_process');
  const dir = copyRepo();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-out-'));
  const quiet = (fn) => { const w = process.stdout.write; const e = process.stderr.write; process.stdout.write = () => true; process.stderr.write = () => true; try { return fn(); } finally { process.stdout.write = w; process.stderr.write = e; } };
  try {
    assert.equal(quiet(() => build.main(['--check'], { root: dir, out })), 1, 'no git, no serial: refused');
    const id = build.build().catalogue.teams[0].members[0].avatar.id;
    fs.mkdirSync(path.join(dir, 'avatars'));
    fs.writeFileSync(path.join(dir, 'avatars', id + '.webp'), webp('portrait'));
    const git = (...a) => execFileSync('git', ['-C', dir, '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...a], { stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'x');
    assert.equal(quiet(() => build.main(['--check'], { root: dir, out })), 0);
    assert.equal(fs.readdirSync(out).length, 0, '--check wrote something');
    assert.equal(quiet(() => build.main([], { root: dir, out })), 0);
    const c = JSON.parse(fs.readFileSync(path.join(out, 'catalogue.json'), 'utf8'));
    assert.ok(c.serial > 1700000000, `serial ${c.serial} is not a commit time`);
    assert.deepEqual(fs.readFileSync(path.join(out, 'avatars', id + '.webp')), webp('portrait'));
    // A clock that says the commit is from the past means the same checkout is from the future.
    assert.equal(quiet(() => build.main(['--check'], { root: dir, out, nowS: c.serial - 7200 })), 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true }); }
});

test('the hidden built-in roles count too: no catalogue key may be own or setup, and no member may use one', () => {
  const r = source.read().rolesSource;
  r.roles[0].key = 'setup';
  assert.ok(build.build({ rolesSource: r }).problems.some((p) => /setup: Kosmos already has a built-in role/.test(p)));
  const t = source.read().teamsSource;
  t.teams[0].members[1].role = 'own';
  assert.ok(build.build({ teamsSource: t }).problems.some((p) => /role "own" is neither/.test(p)));
});

test('a member missing a title, an avatar field or a text focus line is reported, not thrown', () => {
  for (const spoil of [(m) => { delete m.title; }, (m) => { delete m.avatar.hair; }, (m) => { m.focus = [{}]; }, (m) => { delete m.avatar; }]) {
    const t = source.read().teamsSource;
    spoil(t.teams[0].members[1]);
    assert.ok(build.build({ teamsSource: t }).problems.some((p) => /needs a name, title, role, focus/.test(p)), spoil.toString());
  }
});

test('a new serial always exceeds the published one, even from a commit with a slow clock', () => {
  const { execFileSync } = require('node:child_process');
  const dir = copyRepo();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-out-'));
  const w = process.stdout.write;
  try {
    execFileSync('git', ['-C', dir, 'init', '-q'], { stdio: 'ignore' });
    execFileSync('git', ['-C', dir, 'add', '-A'], { stdio: 'ignore' });
    execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'x'], { stdio: 'ignore' });
    process.stdout.write = () => true;
    const serialAfter = (previousSerial) => { assert.equal(build.main([], { root: dir, out, previousSerial }), 0); return JSON.parse(fs.readFileSync(path.join(out, 'catalogue.json'), 'utf8')).serial; };
    const commit = serialAfter(0);
    assert.equal(serialAfter(commit + 100), commit + 101, 'a published serial ahead of the commit clock was not exceeded');
    assert.equal(serialAfter(commit - 100), commit, 'CONTROL: an older published serial leaves the commit time');
  } finally { process.stdout.write = w; fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true }); }
});

test('an avatars folder that is a link is refused, so nothing outside the repo is published', () => {
  const dir = copyRepo();
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-elsewhere-'));
  try {
    const id = build.build().catalogue.teams[0].members[0].avatar.id;
    fs.writeFileSync(path.join(elsewhere, id + '.webp'), webp());
    fs.symlinkSync(elsewhere, path.join(dir, 'avatars'));
    assert.ok(build.build({ root: dir }).problems.some((p) => /avatars\/: must be a folder/.test(p)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(elsewhere, { recursive: true, force: true }); }
});

test('the builder itself refuses a team without its text, and a role with an empty caution or description', () => {
  for (const spoil of [(t) => { delete t.blurb; }, (t) => { delete t.project; }, (t) => { t.project.goal = ''; }]) {
    const ts = source.read().teamsSource;
    spoil(ts.teams[2]);
    assert.ok(build.build({ teamsSource: ts }).problems.some((p) => /needs a label, blurb, purpose/.test(p)), spoil.toString());
  }
  const base = fs.readFileSync(path.join(REPO, 'roles', 'cos', 'role.md'), 'utf8');
  assert.ok(source.parseRole('cos', base.replace(/^caution: .*$/m, 'caution:')).problems.some((p) => /caution is empty/.test(p)));
  assert.ok(source.parseRole('cos', base.replace(/---\n\n[^\n]+\n\n## Who/, '---\n\n \n\n## Who')).problems.some((p) => /description is empty/.test(p)));
  assert.deepEqual(source.parseRole('cos', base).problems, [], 'CONTROL');
});

test('the catalogue names the Kosmos roles it was checked against', () => {
  const list = JSON.parse(fs.readFileSync(path.join(REPO, 'kosmos-builtin-roles.json'), 'utf8'));
  assert.deepEqual(built().kosmosRoles, list.roles.concat(list.hidden).sort());
});

test('published-serial: a 404 is zero only before the first publish; every other failure stops the publish', () => {
  const { publishedSerial } = require('../published-serial');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-pub-'));
  try {
    const f = path.join(dir, 'p.json');
    const marker = path.join(dir, 'published');
    const none = path.join(dir, 'absent');
    fs.writeFileSync(marker, '');
    fs.writeFileSync(f, JSON.stringify({ serial: 1759190400 }));
    assert.deepEqual(publishedSerial(f, '200', 3, marker), { ok: true, serial: 1759190400 });
    assert.deepEqual(publishedSerial(f, '404', 0, none), { ok: true, serial: 0 }, 'the first publish');
    assert.match(publishedSerial(f, '404', 1, marker).because, /missing \(404\) although 1/);
    assert.match(publishedSerial(f, '200', 1, none).because, /marker is not committed/, 'after the first publish, no marker stops it');
    assert.match(publishedSerial(f, '503', 1, marker).because, /HTTP 503/);
    assert.match(publishedSerial(f, '000', 1, marker).because, /HTTP 000/);
    fs.writeFileSync(f, '{"no": "serial"}');
    assert.match(publishedSerial(f, '200', 1, marker).because, /no serial/);
    fs.writeFileSync(f, '<html>');
    assert.match(publishedSerial(f, '200', 1, marker).because, /not JSON/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('main refuses a published serial that is not a whole number', () => {
  const w = process.stderr.write;
  process.stderr.write = () => true;
  try { assert.equal(build.main(['--check'], { previousSerial: 'abc' }), 1); } finally { process.stderr.write = w; }
});

test('text Kosmos would read as a marker is refused: a template other than {{NAME}}, or an HTML comment', () => {
  for (const bad of ['{{TEAM}}', '<!-- kosmos:colleagues:start -->', '{{ NAME }}']) {
    const r = source.read().rolesSource;
    r.roles[1].how[0] = `Say ${bad} at the start.`;
    assert.ok(build.build({ rolesSource: r }).problems.some((p) => /template marker/.test(p)), bad);
    const t = source.read().teamsSource;
    t.teams[1].members[2].focus = [`Keep ${bad} here.`];
    assert.ok(build.build({ teamsSource: t }).problems.some((p) => /template marker/.test(p)), bad);
  }
  // CONTROL: {{NAME}} itself, which every role opens with, passes.
  assert.ok(built().roles.every((r) => r.instructions[0].includes('{{NAME}}')));
  assert.deepEqual(build.build().problems, []);
});

test('suggested names follow Kosmos\'s name rules and are unique by machine name', () => {
  assert.equal(build.nameProblem('Maya'), null, 'CONTROL');
  assert.equal(build.nameProblem('Dr. Maya Okafor'), null, 'CONTROL: a title and spaces are fine');
  for (const bad of ['M', ' Maya', 'Ma\tya', 'Maya!', 'x'.repeat(33), 'Kosmos Connect', 'Angel Discord', '.Net']) {
    assert.ok(build.nameProblem(bad), JSON.stringify(bad));
  }
  const t = source.read().teamsSource;
  t.teams[0].members[1].name = 'Mary Jo';
  t.teams[1].members[1].name = 'mary.jo';
  assert.ok(build.build({ teamsSource: t }).problems.some((p) => /suggested name mary\.jo is used by/.test(p)));
  const u = source.read().teamsSource;
  u.teams[0].members[1].name = 'Z!';
  assert.ok(build.build({ teamsSource: u }).problems.some((p) => /Kosmos would refuse the name "Z!"/.test(p)));
});

test('the groups Kosmos\'s built-in roles sit in must stay in groups.json', () => {
  const r = source.read().rolesSource;
  r.GROUP_ORDER = r.GROUP_ORDER.filter((g) => g !== 'Building software');
  assert.ok(build.build({ rolesSource: r }).problems.some((p) => /group "Building software", so it must stay/.test(p)));
});

test('a role folder, role.md or team file that is a link is refused', () => {
  const dir = copyRepo();
  try {
    const cos = path.join(dir, 'roles', 'cos', 'role.md');
    fs.rmSync(cos);
    fs.symlinkSync(path.join(REPO, 'roles', 'cos', 'role.md'), cos);
    const team = fs.readdirSync(path.join(dir, 'teams'))[0];
    fs.rmSync(path.join(dir, 'teams', team));
    fs.symlinkSync(path.join(REPO, 'teams', team), path.join(dir, 'teams', team));
    const p = build.build({ root: dir }).problems.join('\n');
    assert.match(p, /roles\/cos: must be a folder holding a regular role\.md, not a link/);
    assert.match(p, new RegExp(`teams/${team.replace('.', '\\.')}: must be a regular file, not a link`));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('front matter without a value and an empty rule are refused', () => {
  const base = fs.readFileSync(path.join(REPO, 'roles', 'cos', 'role.md'), 'utf8');
  assert.ok(source.parseRole('cos', base.replace(/^caution: .*$/m, 'caution')).problems.some((p) => /has no "name: value"/.test(p)));
  assert.ok(source.parseRole('cos', base.replace(/^- Start each week.*$/m, '- ')).problems.some((p) => /empty rule/.test(p)));
});

test('a portrait no member names is reported', () => {
  const dir = copyRepo();
  try {
    fs.mkdirSync(path.join(dir, 'avatars'));
    fs.writeFileSync(path.join(dir, 'avatars', 'marketing-Lead.webp'), webp());
    assert.ok(build.build({ root: dir }).problems.some((p) => /avatars\/marketing-Lead\.webp: no team member has the id/.test(p)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('published-serial refuses a deployment count that is empty or not a number', () => {
  const { main } = require('../published-serial');
  const w = process.stderr.write;
  const o = process.stdout.write;
  process.stderr.write = () => true;
  process.stdout.write = () => true;
  try {
    assert.equal(main(['/nonexistent', '404', '']), 1);
    assert.equal(main(['/nonexistent', '404', 'null']), 1);
    assert.equal(main(['/nonexistent', '404', '0']), 0, 'CONTROL: a real zero is the first publish');
  } finally { process.stderr.write = w; process.stdout.write = o; }
});

test('invisible and direction-changing characters are refused anywhere in a role, team or group', () => {
  for (const ch of ['\uFE0F', '\u{E0100}', '\u061C', '\u3164', '\u2800', '\uFFF9', '\u00A0', '\u202E', '\u200B', '\u2066', '\uFEFF', '\u0007', '\u{E0041}']) {
    const r = source.read().rolesSource;
    r.roles[2].who = r.roles[2].who.replace('You ', `You${ch} `);
    assert.ok(build.build({ rolesSource: r }).problems.some((p) => /invisible or direction-changing/.test(p)), JSON.stringify(ch));
    const t = source.read().teamsSource;
    t.teams[0].members[0].avatar.hair = `long${ch} hair`;
    assert.ok(build.build({ teamsSource: t }).problems.some((p) => /invisible or direction-changing/.test(p)), JSON.stringify(ch));
  }
  const g = source.read().rolesSource;
  g.GROUP_ORDER.push(g.GROUP_ORDER[0]);
  assert.ok(build.build({ rolesSource: g }).problems.some((p) => /every group needs a name, once/.test(p)));
  // CONTROL: ordinary punctuation and accented letters pass.
  const ok = source.read().rolesSource;
  ok.roles[2].who = ok.roles[2].who.replace('You ', 'You (café, naïve) ');
  assert.deepEqual(build.build({ rolesSource: ok }).problems, []);
});

test('an unknown avatar field, or a file in avatars/ that is not a named portrait, is reported', () => {
  const t = source.read().teamsSource;
  t.teams[0].members[0].avatar.hairr = 'x';
  assert.ok(build.build({ teamsSource: t }).problems.some((p) => /avatar with exactly/.test(p)));
  const dir = copyRepo();
  try {
    fs.mkdirSync(path.join(dir, 'avatars'));
    fs.writeFileSync(path.join(dir, 'avatars', 'README.md'), 'x');
    assert.deepEqual(build.build({ root: dir }).problems, [], 'CONTROL: the README is allowed');
    fs.writeFileSync(path.join(dir, 'avatars', 'marketing-lead.png'), 'x');
    assert.ok(build.build({ root: dir }).problems.some((p) => /marketing-lead\.png: only/.test(p)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('published-serial: the committed marker makes a 404 an outage even with no run history', () => {
  const { publishedSerial } = require('../published-serial');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-marker-'));
  try {
    const marker = path.join(dir, 'published');
    assert.deepEqual(publishedSerial('/nonexistent', '404', 0, marker), { ok: true, serial: 0 }, 'CONTROL: no marker, no runs');
    fs.writeFileSync(marker, '');
    assert.equal(publishedSerial('/nonexistent', '404', 0, marker).ok, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a role missing its name is reported and left out, and a team file that is not an object is reported', () => {
  const dir = copyRepo();
  try {
    const cos = path.join(dir, 'roles', 'cos', 'role.md');
    fs.writeFileSync(cos, fs.readFileSync(cos, 'utf8').replace(/^name: .*\n/m, 'name:  \n'));
    const team = fs.readdirSync(path.join(dir, 'teams'))[0];
    fs.writeFileSync(path.join(dir, 'teams', team), 'null');
    fs.writeFileSync(path.join(dir, 'settings.json'), '[]');
    const p = build.build({ root: dir }).problems.join('\n');
    assert.match(p, /roles\/cos\/role\.md: name is missing/);
    assert.match(p, new RegExp(`teams/${team.replace('.', '\\.')}: must be a JSON object`));
    assert.match(p, /settings\.json: must be a JSON object/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const t = source.read().teamsSource;
  t.teams[0].members[1].title = '   ';
  assert.ok(build.build({ teamsSource: t }).problems.some((p) => /needs a name, title/.test(p)), 'a blank title');
  const u = source.read().teamsSource;
  u.teams[0].project.extra = { nested: true };
  assert.ok(build.build({ teamsSource: u }).problems.some((p) => /exactly a name and goal/.test(p)));
});

test('a CRLF role file gets its own message, and a top-level file or folder that is a link is refused', () => {
  const base = fs.readFileSync(path.join(REPO, 'roles', 'cos', 'role.md'), 'utf8');
  assert.match(source.parseRole('cos', base.replace(/\n/g, '\r\n')).problems[0], /Windows line endings/);
  for (const name of ['groups.json', 'teams']) {
    const dir = copyRepo();
    try {
      fs.rmSync(path.join(dir, name), { recursive: true });
      fs.symlinkSync(path.join(REPO, name), path.join(dir, name));
      assert.ok(build.build({ root: dir }).problems.some((p) => p.startsWith(`${name}: must be a`)), name);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('the combining grapheme joiner is refused like the other blank characters', () => {
  const r = source.read().rolesSource;
  r.roles[2].who = r.roles[2].who.replace('You ', 'You\u034F ');
  assert.ok(build.build({ rolesSource: r }).problems.some((p) => /invisible or direction-changing/.test(p)));
});

test('letters from another script are refused: a right-to-left letter or a lookalike spells something else', () => {
  for (const ch of ['\u05D0', '\u0627', '\u0430', '\u03BF']) {
    const r = source.read().rolesSource;
    r.roles[2].who = r.roles[2].who.replace('You ', `Y${ch}u `);
    assert.ok(build.build({ rolesSource: r }).problems.some((p) => /invisible or direction-changing/.test(p)), JSON.stringify(ch));
  }
});

test('{{NAME}} is allowed only in role instructions, where Kosmos fills it in', () => {
  const t = source.read().teamsSource;
  t.teams[0].members[1].focus = ['Say hi to {{NAME}} daily.'];
  assert.ok(build.build({ teamsSource: t }).problems.some((p) => /even \{\{NAME\}\}/.test(p)));
  const r = source.read().rolesSource;
  r.roles[0].blurb = 'Helps {{NAME}} plan';
  assert.ok(build.build({ rolesSource: r }).problems.some((p) => /template marker other than \{\{NAME\}\} in its instructions/.test(p)));
});

test('a role key in groups.json that is not text is reported, and a linked avatars folder is reported once', () => {
  const dir = copyRepo();
  try {
    const groups = JSON.parse(fs.readFileSync(path.join(dir, 'groups.json'), 'utf8'));
    groups[0].roles.push(1);
    fs.writeFileSync(path.join(dir, 'groups.json'), JSON.stringify(groups));
    assert.ok(build.build({ root: dir }).problems.some((p) => /role key 1 must be/.test(p)));
    fs.writeFileSync(path.join(dir, 'groups.json'), fs.readFileSync(path.join(REPO, 'groups.json')));
    fs.symlinkSync(os.tmpdir(), path.join(dir, 'avatars'));
    assert.equal(build.build({ root: dir }).problems.filter((p) => /avatars\/: must be a folder/.test(p)).length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
