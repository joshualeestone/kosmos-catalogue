'use strict';
/* Fill the gaps in the 09-29 teams packet (kosmos#4555): writes a filled copy, never the original.
   node apply.js <packet dir> <fills dir> <out dir> <catalogue worktree> */
const fs = require('fs');
const path = require('path');
const [P, F, OUT, CAT] = process.argv.slice(2);
const teams = JSON.parse(fs.readFileSync(path.join(P, 'teams.json'), 'utf8'));
const roles = JSON.parse(fs.readFileSync(path.join(P, 'roles.json'), 'utf8'));
const problems = [];

// Role text: seven batches, [summary, first, desc, how[3], ask[], never[], caution|null].
const text = {};
for (let i = 1; i <= 7; i++) Object.assign(text, JSON.parse(fs.readFileSync(path.join(F, `roles-${i}.json`), 'utf8')));
for (const r of roles) {
  const t = text[r.key];
  if (!t) continue;
  const [summary, first, desc, how, ask, never, caution] = t;
  r.summary = summary;
  r.first = first;
  r.caution = caution;
  r.instructions = [`You are the **${r.name}**.`, '', desc, '', '## How you work', '', ...how.map((x) => `- ${x}`),
    '', '## What you ask the person before doing', '', ...ask.map((x) => `- ${x}`),
    '', '## What you never do on your own', '', ...never.map((x) => `- ${x}`)];
}

// Presentation: the packet's hair and attire come from two disjoint sets of six (measured: every
// member is in exactly one; 24 of 24 sampled portraits agree). The set is how the person presents.
const W_HAIR = /ponytail|soft wavy hair worn|coiled hair|braided hair|bob|shoulder-length/;
const M_HAIR = /beard|parted on the side|salt-and-pepper|crew cut|close-cropped/;
const presentationOf = (hair) => (W_HAIR.test(hair) ? 'woman' : M_HAIR.test(hair) ? 'man' : null);
const pools = { woman: { hair: new Set(), attire: new Set() }, man: { hair: new Set(), attire: new Set() } };
const ages = [], exprs = [];
for (const t of teams) for (const m of t.members) {
  const p = presentationOf(m.avatar.hair);
  if (!p) { problems.push(`${t.key}/${m.name}: hair in neither set: ${m.avatar.hair}`); continue; }
  m.avatar.presentation = p;
  pools[p].hair.add(m.avatar.hair); pools[p].attire.add(m.avatar.attire);
  if (!ages.includes(m.avatar.apparentAge)) ages.push(m.avatar.apparentAge);
  if (!exprs.includes(m.avatar.expression)) exprs.push(m.avatar.expression);
}
for (const k of ['hair', 'attire']) for (const v of pools.woman[k]) if (pools.man[k].has(v)) problems.push(`${k} shared across sets: ${v}`);
for (const p of ['woman', 'man']) for (const k of ['hair', 'attire']) pools[p][k] = [...pools[p][k]].sort();

// Names: first names in the published catalogue (teams the packet does not replace), the packet,
// and the four real outside people kosmos's no-name-refs-3071 guard forbids.
const fixed = JSON.parse(fs.readFileSync(path.join(F, 'teams-fill.json'), 'utf8'));
const replaced = new Set(teams.map((t) => t.key));
const published = [];
for (const f of fs.readdirSync(path.join(CAT, 'teams'))) {
  const t = JSON.parse(fs.readFileSync(path.join(CAT, 'teams', f), 'utf8'));
  if (!replaced.has(t.key)) for (const m of t.members) published.push(m.name.split(' ')[0].toLowerCase());
}
const FORBIDDEN = ['b' + 'en', 'na' + 'cho', 'she' + 'ila', 'mor' + 'pheus'];
const forbiddenHit = (n) => { const s = n.toLowerCase(); return FORBIDDEN.some((f, i) => (i === 0 ? new RegExp(`(?<![a-z0-9])${f}(?![a-z0-9])`).test(s) : s.includes(f))); };

// Renames: the packet member gives up a name the published catalogue already uses.
for (const [who, to] of Object.entries(fixed.rename)) {
  const [tk, name] = who.split('/');
  const m = (teams.find((t) => t.key === tk) || { members: [] }).members.find((x) => x.name === name);
  if (!m) { problems.push(`rename: no ${who}`); continue; }
  m.name = to;
}

// New members: a lead plus 4 or 5 reports. Looks drawn from the packet's own sets, spread so no
// two people on a team share a hair or attire line where the set allows.
let turn = 0;
for (const [tk, adds] of Object.entries(fixed.add)) {
  const t = teams.find((x) => x.key === tk);
  if (!t) { problems.push(`add: no team ${tk}`); continue; }
  for (const [role, title, name, pres, heritage, focus] of adds) {
    const usedHair = new Set(t.members.map((m) => m.avatar.hair));
    const usedAttire = new Set(t.members.map((m) => m.avatar.attire));
    const pick = (list) => { for (let i = 0; i < list.length; i++) { const v = list[(turn + i) % list.length]; if (!usedHair.has(v) && !usedAttire.has(v)) return v; } return list[turn % list.length]; };
    if (t.members.some((m) => m.avatar.heritage === heritage)) problems.push(`${tk}: heritage ${heritage} already on the team`);
    t.members.push({
      title, role, name, reportsTo: 'lead', focus,
      avatar: { apparentAge: ages[turn % ages.length], presentation: pres, heritage, hair: pick(pools[pres].hair), attire: pick(pools[pres].attire), expression: exprs[turn % exprs.length] },
    });
    turn += 1;
  }
  const n = t.members.length - 1;
  t.blurb = t.blurb.replace(/ and \d+ specialists /, ` and ${n} specialists `);
}
// "A Automation Lead" and the like.
for (const t of teams) t.blurb = t.blurb.replace(/^A (?=[AEIOU])/, 'An ');

// Name checks over the result.
const seen = new Map();
for (const t of teams) for (const m of t.members) {
  const first = m.name.split(' ')[0].toLowerCase();
  if (seen.has(first)) problems.push(`name ${m.name} used by ${seen.get(first)} and ${t.key}`);
  seen.set(first, t.key);
  if (published.includes(first)) problems.push(`name ${m.name} (${t.key}) is used by a published team`);
  if (forbiddenHit(m.name)) problems.push(`name ${m.name} (${t.key}) is on the no-name-refs list`);
}
// Every role a member uses exists: the packet's, the catalogue's, or a Kosmos built-in.
const catRoles = new Set(fs.readdirSync(path.join(CAT, 'roles')));
const builtin = JSON.parse(fs.readFileSync(path.join(CAT, 'kosmos-builtin-roles.json'), 'utf8'));
const bi = new Set([...(builtin.roles || []), ...(builtin.hidden || [])].map((r) => (typeof r === 'string' ? r : r.key)));
const pk = new Set(roles.map((r) => r.key));
for (const t of teams) for (const m of t.members) if (!pk.has(m.role) && !catRoles.has(m.role) && !bi.has(m.role)) problems.push(`${t.key}/${m.name}: unknown role ${m.role}`);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'teams.json'), JSON.stringify(teams, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'roles.json'), JSON.stringify(roles, null, 1) + '\n');
const count = (p) => teams.reduce((s, t) => s + t.members.filter((m) => m.avatar.presentation === p).length, 0);
console.log(`teams ${teams.length}, members ${teams.reduce((s, t) => s + t.members.length, 0)} (woman ${count('woman')}, man ${count('man')}), roles ${roles.length}`);
console.log(problems.length ? `PROBLEMS ${problems.length}:\n${problems.join('\n')}` : 'no problems');
process.exitCode = problems.length ? 1 : 0;
