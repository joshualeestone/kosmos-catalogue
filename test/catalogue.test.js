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

/** A throwaway copy of the source files, for tests that break one. */
function copyRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-copy-'));
  for (const f of ['groups.json', 'settings.json', 'roles', 'teams']) fs.cpSync(path.join(REPO, f), path.join(dir, f), { recursive: true });
  return dir;
}

test('the sources pass every check the builder makes', () => {
  assert.deepEqual(build.build().problems, []);
});

test('every role file reads back to the same text it was written from', () => {
  for (const key of fs.readdirSync(path.join(REPO, 'roles'))) {
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
      if (m.avatar.image !== null) assert.ok(fs.existsSync(path.join(REPO, m.avatar.image)), `${m.avatar.image} is named but missing`);
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
  teamsSource.teams[1].members[1].focus = ['Keep &#08212; the list.'];
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
