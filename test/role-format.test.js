'use strict';
/**
 * The role format's optional parts (kosmos-teams-packet-format.md): an archetype that may stand in
 * for "## Who you are", and the "What you ask the person before doing" and "What you never do on
 * your own" sections. A role without them builds exactly as before.
 *
 *   node --test test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const build = require('../build');
const source = require('../lib/source');

const REPO = path.join(__dirname, '..');
const COS = fs.readFileSync(path.join(REPO, 'roles', 'cos', 'role.md'), 'utf8');

/** cos as the brief shapes a role: an archetype instead of Who you are, and the two new sections. */
const BRIEF = COS
  .replace(/^first: .*$/m, (l) => `${l}\narchetype: calm, far-sighted planner`)
  .replace(/\n\n## Who you are\n\n[^\n]+/, '')
  .replace(/\n$/, '\n\n## What you ask the person before doing\n\n- Which three things matter most this month.\n\n## What you never do on your own\n\n- Never accept a meeting for the person.\n- Never send anything outside Kosmos.\n');

/** The built catalogue with cos replaced by the given role text. */
function buildWith(text) {
  const read = source.read();
  const { role, problems } = source.parseRole('cos', text);
  if (!role) return { problems };
  const roles = read.rolesSource.roles.map((r) => (r.key === 'cos' ? { ...role, group: r.group } : r));
  return build.build({ rolesSource: { ...read.rolesSource, roles } });
}

test('a role in the brief\'s shape parses, round-trips, and builds with its sections', () => {
  const { role, problems } = source.parseRole('cos', BRIEF);
  assert.deepEqual(problems, []);
  assert.equal(role.who, undefined);
  assert.equal(role.archetype, 'calm, far-sighted planner');
  assert.deepEqual(role.never, ['Never accept a meeting for the person.', 'Never send anything outside Kosmos.']);
  assert.equal(source.roleText(role), BRIEF, 'roleText does not write back what it read');
  const b = buildWith(BRIEF);
  assert.deepEqual(b.problems, []);
  const text = b.catalogue.roles.find((r) => r.key === 'cos').instructions.join('\n');
  assert.match(text, /## Who you are\n\nYou are a calm, far-sighted planner\./);
  assert.match(text, /## How you work\n[\s\S]*## What you ask the person before doing\n\n- Which three things[\s\S]*## What you never do on your own\n\n- Never accept a meeting/);
});

test('a role in the old shape builds exactly as before', () => {
  const b = buildWith(COS);
  assert.deepEqual(b.problems, []);
  const text = b.catalogue.roles.find((r) => r.key === 'cos').instructions.join('\n');
  assert.doesNotMatch(text, /What you (ask|never)/);
  assert.equal(source.roleText(source.parseRole('cos', COS).role), COS);
});

test('a role with neither a Who you are paragraph nor an archetype is refused', () => {
  const text = BRIEF.replace(/^archetype: .*\n/m, '');
  assert.match(source.parseRole('cos', text).problems.join('\n'), /which a role with an archetype may leave out/);
});

test('sections out of order, an archetype that is not a short phrase, and too many items are refused', () => {
  const swapped = BRIEF.replace(/(## What you ask[\s\S]*?)(\n\n## What you never[\s\S]*)$/, (_, ask, never) => `${never.replace(/\n$/, '')}\n\n${ask.trimEnd()}\n`);
  assert.notEqual(swapped, BRIEF, 'premise: the swap changed the text');
  assert.match(source.parseRole('cos', swapped).problems.join('\n'), /in that order/);
  assert.match(buildWith(BRIEF.replace('calm, far-sighted planner', 'Calm planner.')).problems.join('\n'), /archetype must be a short lowercase phrase/);
  const five = BRIEF.replace('- Never send anything outside Kosmos.\n', '- A.\n- B.\n- C.\n- D.\n- E.\n');
  assert.match(buildWith(five).problems.join('\n'), /What you never do on your own needs one to four items/);
  assert.match(source.parseRole('cos', BRIEF.replace(/^archetype: .*$/m, 'archetype:')).problems.join('\n'), /archetype is empty/);
  // CONTROL: the unchanged brief-shaped role builds clean.
  assert.deepEqual(buildWith(BRIEF).problems, []);
});

test('the new fields get every text check the old ones do', () => {
  const cases = [
    ['an em dash in a never item', BRIEF.replace('Never accept a meeting', 'Never \u2014 accept a meeting'), /em dash/],
    ['an escaped em dash in the archetype', BRIEF.replace('calm, far-sighted planner', 'calm &mdash; planner'), /em dash/],
    ['a web address in an ask item', BRIEF.replace('Which three things', 'Check example.com for which three things'), /web address/],
    ['a template marker in a never item', BRIEF.replace('Never send anything', 'Never send {{X}} anything'), /template marker/],
    ['an HTML comment in an ask item', BRIEF.replace('Which three things', 'Which <!-- x --> three things'), /template marker|angle bracket/],
    ['a hidden character in the archetype', BRIEF.replace('calm, far-sighted', 'calm,\u200b far-sighted'), /invisible/],
  ];
  for (const [what, text, re] of cases) {
    assert.notEqual(text, BRIEF, `premise: ${what} changed the text`);
    assert.match(buildWith(text).problems.join('\n'), re, what);
  }
  assert.deepEqual(buildWith(BRIEF).problems, [], 'CONTROL');
});

test('a role with both a Who you are paragraph and an archetype is refused', () => {
  const both = COS.replace(/^first: .*$/m, (l) => `${l}\narchetype: calm planner`);
  assert.match(source.parseRole('cos', both).problems.join('\n'), /has both/);
  const read = source.read();
  const roles = read.rolesSource.roles.map((r) => (r.key === 'cos' ? { ...r, archetype: 'calm planner' } : r));
  assert.match(build.build({ rolesSource: { ...read.rolesSource, roles } }).problems.join('\n'), /cos: has both/);
});

test('the archetype takes the article its sound needs, and may not bring its own', () => {
  for (const [phrase, article] of [['honest, careful planner', 'an'], ['user-focused planner', 'a'], ['one-track planner', 'a'],
    ['unique thinker', 'a'], ['unimportant-seeming planner', 'an'], ['universal helper', 'a'], ['upbeat organiser', 'an'], ['energetic planner', 'an'], ['calm planner', 'a']]) {
    const b = buildWith(BRIEF.replace('calm, far-sighted planner', phrase));
    assert.deepEqual(b.problems, [], phrase);
    const text = b.catalogue.roles.find((r) => r.key === 'cos').instructions.join('\n');
    assert.ok(text.includes(`You are ${article} ${phrase}.`), `${phrase}: ${text.match(/You are [^\n]*/)}`);
  }
  for (const lead of ['a calm planner', 'an honest planner', 'the planner']) {
    assert.match(buildWith(BRIEF.replace('calm, far-sighted planner', lead)).problems.join('\n'), /no leading a, an or the/, lead);
  }
});

test('a role given in memory with lists of the wrong shape is reported, not a crash', () => {
  const read = source.read();
  const { role } = source.parseRole('cos', BRIEF);
  for (const bad of [{ ask: 5 }, { never: 'x' }, { how: 7 }]) {
    const roles = read.rolesSource.roles.map((r) => (r.key === 'cos' ? { ...role, group: r.group, ...bad } : r));
    const out = build.build({ rolesSource: { ...read.rolesSource, roles } });
    assert.ok(out.problems.some((x) => /^cos: /.test(x)), JSON.stringify(bad));
  }
});

test('an item that is empty or not text is refused in every list, including How you work', () => {
  const read = source.read();
  const { role } = source.parseRole('cos', BRIEF);
  for (const bad of [{ ask: [5] }, { never: [null] }, { ask: [''] }, { how: ['a', ' ', 'c'] }]) {
    const roles = read.rolesSource.roles.map((r) => (r.key === 'cos' ? { ...role, group: r.group, ...bad } : r));
    assert.match(build.build({ rolesSource: { ...read.rolesSource, roles } }).problems.join('\n'), /has an empty item or one that is not text/, JSON.stringify(bad));
  }
});

test('a section heading with nothing under it is named, and roleText writes no heading for an empty list', () => {
  const empty = BRIEF.replace(/\n\n## What you never do on your own\n\n[\s\S]*$/, '\n\n## What you never do on your own\n');
  assert.notEqual(empty, BRIEF, 'premise');
  assert.deepEqual(source.parseRole('cos', empty).problems, ['roles/cos/role.md: What you never do on your own has no items']);
  const { role } = source.parseRole('cos', BRIEF);
  const text = source.roleText({ ...role, never: [] });
  assert.doesNotMatch(text, /What you never do/);
  assert.deepEqual(source.parseRole('cos', text).problems, [], 'what roleText wrote does not parse');
});

test('an archetype with a trailing or doubled space is refused', () => {
  const read = source.read();
  const { role } = source.parseRole('cos', BRIEF);
  for (const a of ['calm cook ', 'calm  cook']) {
    const roles = read.rolesSource.roles.map((r) => (r.key === 'cos' ? { ...role, group: r.group, archetype: a } : r));
    assert.match(build.build({ rolesSource: { ...read.rolesSource, roles } }).problems.join('\n'), /no extra spaces/, JSON.stringify(a));
  }
});
