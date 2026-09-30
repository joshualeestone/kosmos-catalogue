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
    key, name: 'Grant Writer', category: 'Writing', caution: null, summary: 'Drafts grant applications you can send',
    instructions: ['You are the **Grant Writer**.', '', 'You draft grant applications from what the person tells you.', '',
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
  assert.equal(r.teamsSource.teams.length, fs.readdirSync(path.join(REPO, 'teams')).length, 'a replaced team was added twice');
});

test('a team below a lead and 4 reports is reported, not taken', () => {
  const p = execAsPacket();
  p.members = p.members.slice(0, 4);
  const r = importPacket({ teams: [p], roles: [] });
  assert.ok(r.problems.some((x) => /exec: needs 4 or 5 reports, has 3/.test(x)), r.problems.join('\n'));
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
  assert.ok(bare.problems.some((x) => /grant-writer: character is 0 sentences/.test(x)), bare.problems.join('\n'));
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
  for (const f of ['groups.json', 'settings.json', 'kosmos-builtin-roles.json', 'roles', 'teams', 'avatars']) fs.cpSync(path.join(REPO, f), path.join(dir, f), { recursive: true });
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
