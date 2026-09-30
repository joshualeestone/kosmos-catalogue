'use strict';
/**
 * Take a teams packet (teams.json + roles.json, the shape of kosmos-teams-packet-format.md) into
 * the catalogue sources, and say what the builder refuses (joshualeestone/kosmos#4632).
 *
 *   node tools/import-packet.js <packet dir>           what would be refused, nothing written
 *   node tools/import-packet.js <packet dir> --write   write the sources, only when nothing is refused
 *
 * Rerunnable: a regenerated packet goes in by running this again.
 * - A packet team whose key is already published replaces that team (the same subject).
 * - A packet role whose key is already a catalogue role or a Kosmos built-in role is not taken;
 *   its members use the existing role.
 * - Each member's slot is "lead" for the lead, else its role key (-2, -3 when a role repeats).
 * - A team's project name is its label without a trailing " Team"; ranks follow the published
 *   teams of the same kind, in packet order.
 */
const fs = require('node:fs');
const path = require('node:path');
const build = require('../build');
const source = require('../lib/source');

/** The presentations the published teams use, which the portrait prompt is written for. */
const PRESENTATIONS = ['woman', 'man', 'nonbinary person'];

/** The packet's role instructions, split into the description and the three sections. */
function sections(lines) {
  const out = { desc: '', how: [], ask: [], never: [] };
  const heads = { '## How you work': 'how', '## What you ask the person before doing': 'ask', '## What you never do on your own': 'never' };
  let at = null;
  for (const l of lines) {
    if (heads[l]) { at = heads[l]; continue; }
    if (!l.trim()) continue;
    if (at && l.startsWith('- ')) out[at].push(l.slice(2));
    else if (!at && !/^You are the \*\*/.test(l)) out.desc = out.desc ? `${out.desc} ${l}` : l;
  }
  return out;
}

/** The packet role as a catalogue role (the fields the current role format has). */
function roleFrom(p) {
  const s = sections(p.instructions || []);
  const r = { key: p.key, group: p.category, label: p.name, blurb: p.summary, first: p.first || '', desc: s.desc, who: p.character || '', how: s.how };
  if (p.caution) r.caution = p.caution;
  return r;
}

/** The packet team as a catalogue team. */
function teamFrom(p, rank, roleKey) {
  const used = new Map();
  const members = p.members.map((m) => {
    const role = roleKey(m.role);
    let slot = 'lead';
    if (m.reportsTo) {
      const n = (used.get(role) || 0) + 1;
      used.set(role, n);
      slot = n === 1 ? role : `${role}-${n}`;
    }
    const a = m.avatar || {};
    return {
      slot, role, title: m.title, name: m.name, focus: [m.focus].flat().filter(Boolean),
      avatar: { apparentAge: a.apparentAge, presentation: a.presentation, heritage: a.heritage, hair: a.hair, attire: a.attire, expression: a.expression },
    };
  });
  return {
    key: p.key, kind: p.kind, rank, label: p.label, blurb: p.blurb, purpose: p.purpose,
    project: { name: String(p.label).replace(/ Team$/, ''), goal: p.goal },
    members,
  };
}

/**
 * @param {{teams: object[], roles: object[]}} packet
 * @param {string} [root] the catalogue repo
 * @returns {{rolesSource: object, teamsSource: object, problems: string[], taken: object}}
 */
function importPacket(packet, root = source.ROOT) {
  const cur = source.read(root);
  const builtin = JSON.parse(fs.readFileSync(path.join(root, 'kosmos-builtin-roles.json'), 'utf8'));
  const builtinKeys = new Set([...(builtin.roles || []), ...(builtin.hidden || [])].map((r) => (typeof r === 'string' ? r : r.key)));
  const have = new Set(cur.rolesSource.roles.map((r) => r.key));
  const roleKey = (k) => k;   // kept roles and built-ins share the packet's key, so members need no remap
  const newRoles = packet.roles.filter((r) => !have.has(r.key) && !builtinKeys.has(r.key)).map(roleFrom);
  const groups = cur.rolesSource.GROUP_ORDER.slice();
  for (const r of newRoles) if (!groups.includes(r.group)) groups.push(r.group);
  const replaced = new Set(packet.teams.map((t) => t.key));
  const kept = cur.teamsSource.teams.filter((t) => !replaced.has(t.key));
  const nextRank = { business: 0, personal: 0 };
  for (const t of kept) nextRank[t.kind] = Math.max(nextRank[t.kind] || 0, t.rank);
  const teams = kept.concat(packet.teams.map((t) => teamFrom(t, (nextRank[t.kind] = (nextRank[t.kind] || 0) + 1), roleKey)));
  const rolesSource = { GROUP_ORDER: groups, roles: cur.rolesSource.roles.concat(newRoles) };
  const teamsSource = { ...cur.teamsSource, teams };
  const { problems } = build.build({ root, rolesSource, teamsSource });
  /* The portrait prompt reads presentation as how the person presents ("a woman in her 30s"); the
     builder takes any text, so a personality phrase there would make every prompt read wrong. */
  for (const t of teams) for (const m of t.members) {
    if (!PRESENTATIONS.includes(m.avatar.presentation)) problems.push(`${t.key}/${m.slot}: presentation ${JSON.stringify(m.avatar.presentation)} is not one of ${PRESENTATIONS.join(', ')} (the portrait prompt reads it as how the person presents)`);
  }
  return {
    rolesSource, teamsSource, problems,
    taken: { roles: newRoles.length, teamsNew: packet.teams.length - (cur.teamsSource.teams.length - kept.length), teamsReplaced: cur.teamsSource.teams.length - kept.length },
  };
}

/** Problems grouped by what they say, most common first, so 300 lines read as a dozen kinds. */
function summarise(problems) {
  const kinds = new Map();
  for (const p of problems) {
    const kind = p.replace(/^suggested name .*/, 'suggested name used twice').replace(/^[^:]+: /, '').replace(/"[^"]*"|\d+/g, '#');
    if (!kinds.has(kind)) kinds.set(kind, []);
    kinds.get(kind).push(p);
  }
  return [...kinds.entries()].sort((a, b) => b[1].length - a[1].length);
}

function main(argv) {
  const dir = argv.find((a) => !a.startsWith('--'));
  if (!dir) { process.stderr.write('usage: node tools/import-packet.js <packet dir> [--write]\n'); return 2; }
  const packet = { teams: JSON.parse(fs.readFileSync(path.join(dir, 'teams.json'), 'utf8')), roles: JSON.parse(fs.readFileSync(path.join(dir, 'roles.json'), 'utf8')) };
  const r = importPacket(packet);
  process.stdout.write(`packet: ${packet.teams.length} teams (${r.taken.teamsReplaced} replace published ones), ${packet.roles.length} roles (${r.taken.roles} new)\n`);
  if (!r.problems.length) {
    if (argv.includes('--write')) { source.write(r.rolesSource, r.teamsSource); process.stdout.write('written; run npm test and node build.js\n'); }
    else process.stdout.write('nothing refused; run again with --write\n');
    return 0;
  }
  process.stdout.write(`${r.problems.length} problems; nothing written\n`);
  for (const [, list] of summarise(r.problems)) process.stdout.write(`\n${list.length} x ${list[0]}\n`);
  return 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { importPacket, summarise, roleFrom, teamFrom, sections };
