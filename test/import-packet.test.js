'use strict';
/**
 * tools/import-packet.js: a teams packet goes into the sources, and what the builder refuses is
 * reported instead of written (joshualeestone/kosmos#4632). Nothing here writes to the repo.
 *
 *   node --test test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const os = require('node:os');
const build = require('../build');
const { importPacket, sections, main } = require('../tools/import-packet');

const REPO = path.join(__dirname, '..');
const EXEC = JSON.parse(fs.readFileSync(path.join(REPO, 'teams', 'exec.json'), 'utf8'));

/** The published exec team, written back in the packet's shape. */
function execAsPacket() {
  return {
    key: EXEC.key, kind: EXEC.kind, label: EXEC.label, blurb: EXEC.blurb, purpose: EXEC.purpose, goal: EXEC.project.goal,
    members: EXEC.members.map((m) => ({
      title: m.title, role: m.role, name: m.name, focus: m.focus[0], avatar: m.avatar,
      ...(m.slot === 'lead' ? {} : { reportsTo: 'lead' }),
    })),
  };
}

/** A new role in the packet's shape; `extra` adds the fields the packet does not carry yet. */
function packetRole(key, extra = {}) {
  return {
    key, name: 'Grant Application Writer', category: 'Writing', caution: null, summary: 'Drafts grant applications you can send',
    instructions: ['You are the **Grant Application Writer**.', '', 'You draft grant applications from what the person tells you.', '',
      '## How you work', '', '- Read the funder\'s rules first.', '- Draft in the funder\'s own order.', '- You never submit anything yourself; the person sends it.',
      '', '## What you ask the person before doing', '', '- Which grant, and by when.', '', '## What you never do on your own', '', '- Never submit an application.'],
    ...extra,
  };
}

test('a packet holding a published team, unchanged, replaces it with nothing refused', () => {
  const r = importPacket({ teams: [execAsPacket()], roles: [] });
  assert.deepEqual(r.problems, []);
  assert.equal(r.taken.teamsReplaced, 1);
  const t = r.teamsSource.teams.find((x) => x.key === 'exec');
  assert.deepEqual(t.members.map((m) => m.role), EXEC.members.map((m) => m.role));
  // Unchanged means unchanged: the same place in the menu and the same slots (portraits are named by slot).
  assert.equal(t.rank, EXEC.rank);
  assert.deepEqual(t.members.map((m) => m.slot), EXEC.members.map((m) => m.slot));
  // Field for field: nothing (the project name, say) is rebuilt differently from what is published.
  assert.deepEqual(t, EXEC);
  assert.equal(r.teamsSource.teams.length, fs.readdirSync(path.join(REPO, 'teams')).length, 'a replaced team was added twice');
});

test('a team outside a lead and 1 to 5 reports is reported, not taken; a small one is taken', () => {
  const p = execAsPacket();
  p.members = p.members.slice(0, 1);
  const r = importPacket({ teams: [p], roles: [] });
  assert.ok(r.problems.some((x) => /exec: needs 1 to 5 reports, has 0/.test(x)), r.problems.join('\n'));
  const q = execAsPacket();
  q.members = q.members.slice(0, 2);
  const r2 = importPacket({ teams: [q], roles: [] });
  assert.ok(!r2.problems.some((x) => /reports, has/.test(x)), 'a lead and one report was refused: ' + r2.problems.join('\n'));
});

test('a presentation the portrait prompt cannot read is reported', () => {
  const p = execAsPacket();
  p.members[0].avatar = { ...p.members[0].avatar, presentation: 'composed and strategic' };
  const r = importPacket({ teams: [p], roles: [] });
  assert.equal(r.problems.filter((x) => /presentation/.test(x)).length, 1, r.problems.join('\n'));
});

test('a new role with no first action or character is reported; with them it goes in', () => {
  const bare = importPacket({ teams: [], roles: [packetRole('grant-writer')] });
  assert.ok(bare.problems.some((x) => /grant-writer.*first/.test(x)), bare.problems.join('\n'));
  assert.ok(bare.problems.some((x) => /grant-writer: needs a Who you are paragraph or an archetype/.test(x)), bare.problems.join('\n'));
  // CONTROL: the same role with the two fields the packet does not carry yet.
  const full = importPacket({ teams: [], roles: [packetRole('grant-writer', {
    first: 'Tell me which grant you are applying for and I will draft it.',
    character: 'You are patient with funders\' rules. You like a clear deadline. You write plainly.',
  })] });
  assert.deepEqual(full.problems, []);
  const role = full.rolesSource.roles.find((x) => x.key === 'grant-writer');
  assert.equal(role.desc, 'You draft grant applications from what the person tells you.');
  assert.equal(role.how.length, 3);
  assert.ok(full.rolesSource.GROUP_ORDER.includes('Writing'), 'a new category did not become a group');
});

test('a packet role whose key is already a catalogue or built-in role is not taken', () => {
  const r = importPacket({ teams: [], roles: [packetRole('cos'), packetRole('researcher')] });
  assert.equal(r.taken.roles, 0);
  assert.deepEqual(r.problems, []);
});

test('the packet sections split into the description and the three lists', () => {
  const s = sections(packetRole('x').instructions);
  assert.equal(s.desc, 'You draft grant applications from what the person tells you.');
  assert.deepEqual([s.how.length, s.ask.length, s.never.length], [3, 1, 1]);
});

const FULL = { first: 'Tell me which grant you are applying for and I will draft it.', character: 'You are patient with funders\' rules. You like a clear deadline. You write plainly.' };

/** A throwaway copy of the repo's sources, for tests that write. */
function copyRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-packet-test-'));
  for (const f of ['groups.json', 'team-groups.json', 'settings.json', 'kosmos-builtin-roles.json', 'roles', 'teams', 'avatars']) fs.cpSync(path.join(REPO, f), path.join(dir, f), { recursive: true });
  return dir;
}

test('--write writes sources that the next build reads back with nothing refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-packet-in-'));
  const repo = copyRepo();
  try {
    fs.writeFileSync(path.join(dir, 'teams.json'), JSON.stringify([execAsPacket()]));
    fs.writeFileSync(path.join(dir, 'roles.json'), JSON.stringify([packetRole('grant-writer', FULL)]));
    const out = { text: '', write(s) { this.text += s; } };
    assert.equal(main([dir, '--write'], repo, out), 0, out.text);
    assert.match(out.text, /written/);
    assert.ok(fs.existsSync(path.join(repo, 'roles', 'grant-writer', 'role.md')), 'the new role was not written');
    assert.deepEqual(build.build({ root: repo }).problems, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('a role the builder takes in memory but that would not read back from its file is refused', () => {
  const role = packetRole('grant-writer', FULL);
  delete role.summary;
  const r = importPacket({ teams: [], roles: [role] });
  assert.ok(r.problems.some((x) => /summary/.test(x)), r.problems.join('\n'));
  // CONTROL: with its summary it goes in.
  assert.deepEqual(importPacket({ teams: [], roles: [packetRole('grant-writer', FULL)] }).problems, []);
});

test('a heading the importer does not know, or loose text inside a section, is reported', () => {
  const role = packetRole('grant-writer', FULL);
  role.instructions = ['## Who you are', 'Something.', ...role.instructions];
  const r = importPacket({ teams: [], roles: [role] });
  assert.ok(r.problems.some((x) => /grant-writer: a heading this importer does not know: "## Who you are"/.test(x)), r.problems.join('\n'));
  const loose = packetRole('grant-writer', FULL);
  loose.instructions = loose.instructions.concat('A stray sentence.');
  assert.ok(importPacket({ teams: [], roles: [loose] }).problems.some((x) => /that is not a "- " item/.test(x)));
});

test('a packet of the wrong shape is reported, not a crash', () => {
  const p = execAsPacket();
  delete p.members;
  assert.deepEqual(importPacket({ teams: [p], roles: [] }).problems, ['teams.json: exec: members must be a list of people, each with a role']);
  const deep = execAsPacket();
  deep.members[2].reportsTo = 'ea';
  assert.match(importPacket({ teams: [deep], roles: [] }).problems.join('\n'), /deeper hierarchy/);
  const out = { text: '', write(s) { this.text += s; } };
  assert.equal(main([path.join(os.tmpdir(), 'no-such-packet-' + process.pid)], REPO, out), 2);
});

test('a key that could reach outside the repo is refused before anything is written', () => {
  const escape = `import-packet-escape-${process.pid}`;
  const target = path.join(os.tmpdir(), escape);
  const r = importPacket({ teams: [], roles: [packetRole(`../../${escape}`, FULL)] });
  assert.match(r.problems.join('\n'), /role 1: key must be lowercase words/);
  assert.equal(fs.existsSync(target), false, 'a dry run wrote outside its throwaway copy');
  const t = execAsPacket();
  t.key = `../${escape}`;
  assert.match(importPacket({ teams: [t], roles: [] }).problems.join('\n'), /team 1: key must be lowercase words/);
  const m = execAsPacket();
  m.members[1].role = '../x';
  assert.match(importPacket({ teams: [m], roles: [] }).problems.join('\n'), /member 2: role must be a role key/);
  assert.equal(fs.existsSync(target), false);
  // And the writer itself refuses such a key, whoever calls it.
  assert.throws(() => require('../lib/source').write({ GROUP_ORDER: [], roles: [{ key: '../x' }] }, { teams: [] }, target), /must be lowercase words/);
  assert.equal(fs.existsSync(target), false);
});

test('a field that is not text is reported, not a crash in the builder', () => {
  const r = importPacket({ teams: [], roles: [packetRole('grant-writer', { ...FULL, name: 5 })] });
  assert.deepEqual(r.problems, ['roles.json: grant-writer: name must be text']);
  const t = execAsPacket();
  t.members[0].name = ['Eleanor'];
  assert.match(importPacket({ teams: [t], roles: [] }).problems.join('\n'), /member 1: name must be text/);
});

test('--write on a refused packet writes nothing, and an unknown option is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-packet-in-'));
  const repo = copyRepo();
  try {
    const p = execAsPacket();
    p.members = p.members.slice(0, 4);
    fs.writeFileSync(path.join(dir, 'teams.json'), JSON.stringify([p]));
    fs.writeFileSync(path.join(dir, 'roles.json'), JSON.stringify([packetRole('grant-writer', FULL)]));
    const before = fs.readFileSync(path.join(repo, 'teams', 'exec.json'), 'utf8');
    const out = { text: '', write(s) { this.text += s; } };
    assert.equal(main([dir, '--write'], repo, out), 1, out.text);
    assert.equal(fs.readFileSync(path.join(repo, 'teams', 'exec.json'), 'utf8'), before, 'a refused packet changed a team');
    assert.equal(fs.existsSync(path.join(repo, 'roles', 'grant-writer')), false, 'a refused packet wrote a role');
    assert.equal(main([dir, '--wrtie'], repo, out), 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('replacing a team: a swapped member gets a new slot, a repeated role gets a free slot, a reused portrait is reported', () => {
  const repo = copyRepo();
  try {
    const p = execAsPacket();
    const lead = EXEC.members.find((m) => m.slot === 'lead');
    const reports = EXEC.members.filter((m) => m.slot !== 'lead');
    // The first report's role changes; the last report becomes a second member of the first report's role.
    p.members[1] = { ...p.members[1], role: 'cos-new-role-that-does-not-exist' };
    p.members[p.members.length - 1] = { ...p.members[p.members.length - 1], role: reports[1].role, name: 'Zebedee' };
    // A portrait for the lead, whose person changes.
    fs.writeFileSync(path.join(repo, 'avatars', `exec-lead.webp`), 'x');
    p.members[0] = { ...p.members[0], name: 'Octavia' };
    const r = importPacket({ teams: [p], roles: [] }, repo);
    const t = r.teamsSource.teams.find((x) => x.key === 'exec');
    const slots = t.members.map((m) => m.slot);
    assert.equal(new Set(slots).size, slots.length, `slots repeat: ${slots}`);
    assert.equal(slots[1], 'cos-new-role-that-does-not-exist');
    // The published member with that role keeps its slot; the second gets the role key, free here.
    assert.equal(slots[2], reports[1].slot);
    assert.equal(slots[slots.length - 1], reports[1].role);
    assert.notEqual(reports[1].slot, reports[1].role, 'premise: the published slot is not named after its role');
    assert.ok(r.problems.some((x) => x === `exec/lead: avatars/exec-lead.webp is ${lead.name}'s portrait (${lead.role}), and this slot is now Octavia (${lead.role}) or looks different`), r.problems.join('\n'));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('in a new team, a role that repeats is numbered', () => {
  const { teamFrom } = require('../tools/import-packet');
  const m = (role, lead) => ({ title: 't', role, name: 'n', focus: 'f', avatar: {}, ...(lead ? {} : { reportsTo: 'lead' }) });
  const t = teamFrom({ key: 'k', label: 'K Team', members: [m('cos', true), m('copywriter'), m('copywriter'), m('copywriter')] }, 1, null);
  assert.deepEqual(t.members.map((x) => x.slot), ['lead', 'copywriter', 'copywriter-2', 'copywriter-3']);
  assert.equal(t.project.name, 'K');
});

test('a replaced team that changes kind takes the next rank of its new kind, not a clashing one', () => {
  const p = execAsPacket();
  p.kind = 'personal';
  const r = importPacket({ teams: [p], roles: [] });
  const t = r.teamsSource.teams.find((x) => x.key === 'exec');
  const personal = r.teamsSource.teams.filter((x) => x.kind === 'personal' && x.key !== 'exec').map((x) => x.rank);
  assert.equal(t.rank, Math.max(...personal) + 1);
  assert.ok(!r.problems.some((x) => /share personal rank/.test(x)), r.problems.join('\n'));
});

test('--write refuses sources with uncommitted changes, and a stray argument', () => {
  const { spawnSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-packet-in-'));
  const repo = copyRepo();
  try {
    fs.writeFileSync(path.join(dir, 'teams.json'), JSON.stringify([execAsPacket()]));
    fs.writeFileSync(path.join(dir, 'roles.json'), '[]');
    const git = (...a) => assert.equal(spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).status, 0, a.join(' '));
    git('init', '-q'); git('add', '-A'); git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base');
    // An uncommitted edit someone is in the middle of (still a valid role file).
    const cos = path.join(repo, 'roles', 'cos', 'role.md');
    const clean = fs.readFileSync(cos, 'utf8');
    fs.writeFileSync(cos, clean.replace('You keep the person', 'You keep the busy person'));
    assert.notEqual(fs.readFileSync(cos, 'utf8'), clean, 'premise: the edit changed the file');
    const out = { text: '', write(s) { this.text += s; } };
    const err = [];
    const was = process.stderr.write;
    process.stderr.write = (s) => { err.push(String(s)); return true; };
    let code;
    try { code = main([dir, '--write'], repo, out); } finally { process.stderr.write = was; }
    assert.equal(code, 2, 'wrote over an uncommitted edit');
    assert.match(err.join(''), /uncommitted changes \(roles\/cos\/role\.md\)/);
    assert.match(fs.readFileSync(cos, 'utf8'), /You keep the busy person/);
    fs.writeFileSync(cos, clean);
    // CONTROL: clean, the same call writes.
    assert.equal(main([dir, '--write'], repo, out), 0, out.text);
    assert.equal(main([dir, 'write'], repo, out), 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('a kept slot whose role changed while its portrait exists is reported', () => {
  const repo = copyRepo();
  try {
    fs.writeFileSync(path.join(repo, 'avatars', 'exec-travel.webp'), 'x');
    const p = execAsPacket();
    const i = EXEC.members.findIndex((m) => m.slot === 'travel');
    const r0 = importPacket({ teams: [p], roles: [] }, repo);
    assert.ok(!r0.problems.some((x) => /exec-travel\.webp is/.test(x)), 'CONTROL: an unchanged slot is not reported');
    p.members[i] = { ...p.members[i], avatar: { ...p.members[i].avatar, hair: 'a shaved head' } };
    const r = importPacket({ teams: [p], roles: [] }, repo);
    assert.ok(r.problems.some((x) => /exec\/travel: avatars\/exec-travel\.webp is .* portrait/.test(x)), r.problems.join('\n'));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('the uncommitted-changes check passes only for a folder that is not a git checkout, never because it could not look', () => {
  const { uncommitted } = require('../tools/import-packet');
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'import-packet-plain-'));
  try {
    assert.deepEqual(uncommitted(plain), []);
    // A path git cannot even enter is a failure to look, not a clean tree.
    assert.throws(() => uncommitted(path.join(plain, 'missing')), /could not check the sources/);
  } finally {
    fs.rmSync(plain, { recursive: true, force: true });
  }
});

test('a line that names an Object property is text, not a heading', () => {
  const s = sections(['## How you work', 'constructor', '- a rule.', 'toString']);
  assert.deepEqual(s.how, ['a rule.']);
  assert.equal(s.problems.length, 2, s.problems.join('\n'));
});

test('a link in the repo is reported, and neither a dry run nor --write writes through it', () => {
  const repo = copyRepo();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'import-packet-outside-'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-packet-in-'));
  try {
    const target = path.join(outside, 'groups.json');
    fs.copyFileSync(path.join(repo, 'groups.json'), target);
    const before = fs.readFileSync(target, 'utf8');
    fs.rmSync(path.join(repo, 'groups.json'));
    fs.symlinkSync(target, path.join(repo, 'groups.json'));
    const teamTarget = path.join(outside, 'zzz.json');
    fs.writeFileSync(teamTarget, 'untouched');
    fs.symlinkSync(teamTarget, path.join(repo, 'teams', 'zzz.json'));
    const p = execAsPacket();
    p.key = 'zzz';
    const r = importPacket({ teams: [p], roles: [packetRole('grant-writer', FULL)] }, repo);
    assert.ok(r.problems.some((x) => /is a link/.test(x)), r.problems.join('\n'));
    assert.equal(fs.readFileSync(target, 'utf8'), before, 'a dry run wrote through the groups.json link');
    assert.equal(fs.readFileSync(teamTarget, 'utf8'), 'untouched', 'a dry run wrote through a team link');
    fs.writeFileSync(path.join(dir, 'teams.json'), JSON.stringify([p]));
    fs.writeFileSync(path.join(dir, 'roles.json'), '[]');
    const out = { text: '', write(s) { this.text += s; } };
    assert.equal(main([dir, '--write'], repo, out), 1, out.text);
    assert.equal(fs.readFileSync(target, 'utf8'), before, '--write wrote through the link');
    assert.equal(fs.readFileSync(teamTarget, 'utf8'), 'untouched');
  } finally {
    for (const d of [repo, outside, dir]) fs.rmSync(d, { recursive: true, force: true });
  }
});

test('a key repeated inside one packet is reported by name', () => {
  const r = importPacket({ teams: [execAsPacket(), execAsPacket()], roles: [packetRole('grant-writer', FULL), packetRole('grant-writer', FULL)] });
  assert.ok(r.problems.includes('teams.json: exec appears more than once'), r.problems.join('\n'));
  assert.ok(r.problems.includes('roles.json: grant-writer appears more than once'), r.problems.join('\n'));
});

test('a packet role with an archetype and the ask-first and never-alone sections goes in with them', () => {
  const role = packetRole('grant-writer', { first: FULL.first, archetype: 'patient, deadline-minded writer' });
  const r = importPacket({ teams: [], roles: [role] });
  assert.deepEqual(r.problems, []);
  const got = r.rolesSource.roles.find((x) => x.key === 'grant-writer');
  assert.equal(got.who, undefined);
  assert.equal(got.archetype, 'patient, deadline-minded writer');
  assert.deepEqual([got.ask, got.never], [['Which grant, and by when.'], ['Never submit an application.']]);
});
