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
