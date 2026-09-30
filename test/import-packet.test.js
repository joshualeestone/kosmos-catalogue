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

const { importPacket, sections } = require('../tools/import-packet');

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
  assert.deepEqual(r.problems.filter((x) => /presentation/.test(x)).length, 1, r.problems.join('\n'));
});

test('a new role with no first action or character is reported; with them it goes in', () => {
  const bare = importPacket({ teams: [], roles: [packetRole('grant-writer')] });
  assert.ok(bare.problems.some((x) => /grant-writer: first action too short/.test(x)), bare.problems.join('\n'));
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
