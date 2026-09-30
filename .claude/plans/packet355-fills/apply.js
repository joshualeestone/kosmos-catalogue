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
const presentationOf = (hair) => {
  const w = W_HAIR.test(hair), m = M_HAIR.test(hair);
  if (w && m) problems.push(`hair in both sets: ${hair}`);
  return w && !m ? 'woman' : m && !w ? 'man' : null;
};
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
// and the names kosmos's no-name-refs-3071 guard forbids (spelled in parts, as that guard does).
const fixed = JSON.parse(fs.readFileSync(path.join(F, 'teams-fill.json'), 'utf8'));
// The catalogue's roles and Kosmos's built-ins, as main has them.
const catRoles = new Set(fs.readdirSync(path.join(CAT, 'roles')));
const builtin = JSON.parse(fs.readFileSync(path.join(CAT, 'kosmos-builtin-roles.json'), 'utf8'));
const bi = new Set([...(builtin.roles || []), ...(builtin.hidden || [])].map((r) => (typeof r === 'string' ? r : r.key)));

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
    const age = ages[turn % ages.length];
    // Grey temples only from the late thirties on (review 7: they read wrong on someone in their twenties).
    const fits = (v) => !/salt-and-pepper/.test(v) || /40s|Late 30s/.test(age);
    const pick = (list) => { for (let i = 0; i < list.length; i++) { const v = list[(turn + i) % list.length]; if (!usedHair.has(v) && !usedAttire.has(v) && fits(v)) return v; } return list.find(fits); };
    if (t.members.some((m) => m.avatar.heritage === heritage)) problems.push(`${tk}: heritage ${heritage} already on the team`);
    t.members.push({
      title, role, name, reportsTo: 'lead', focus,
      avatar: { apparentAge: age, presentation: pres, heritage, hair: pick(pools[pres].hair), attire: pick(pools[pres].attire), expression: exprs[turn % exprs.length] },
    });
    turn += 1;
  }
  const n = t.members.length - 1;
  t.blurb = t.blurb.replace(/ and \d+ specialists /, ` and ${n} specialists `);
}
// Roles Kosmos or the catalogue already has (reviews 1 and 2). A packet role that does the same job
// as a built-in or published role is not taken; its seats use the existing role.
for (const t of teams) for (const m of t.members) if (fixed.sameAs[m.role]) m.role = fixed.sameAs[m.role];
for (let i = roles.length - 1; i >= 0; i--) if (fixed.sameAs[roles[i].key]) roles.splice(i, 1);
// A packet team that replaces a published one keeps the published team's roles, seat for seat (the
// packet lists the same seats in the same order: compared side by side on 09-30; only the sizes are
// checked here). The importer then
// keeps the published slots, so portrait ids do not move.
for (const tk of fixed.positional) {
  const t = teams.find((x) => x.key === tk);
  const pub = JSON.parse(fs.readFileSync(path.join(CAT, 'teams', `${tk}.json`), 'utf8'));
  if (!t || t.members.length !== pub.members.length) { problems.push(`positional: ${tk} sizes differ`); continue; }
  t.members.forEach((m, i) => { m.role = pub.members[i].role; });
}
// Single seats whose role does not fit the team.
for (const [who, role] of Object.entries(fixed.seat)) {
  const [tk, title] = who.split('/');
  const hits = (teams.find((t) => t.key === tk) || { members: [] }).members.filter((x) => x.title === title);
  if (hits.length !== 1) problems.push(`seat: ${hits.length} members for ${who}`); else hits[0].role = role;
}
// Seat titles and focus lines (review 6), keyed by the packet's own team key and title; map.js reads the
// same retitle map, since a portrait is named after the packet's title.
for (const [kind, map] of [['focus', fixed.focus || {}], ['retitle', fixed.retitle || {}]]) {
  for (const [who, value] of Object.entries(map)) {
    const [tk, title] = who.split('/');
    const hits = (teams.find((t) => t.key === tk) || { members: [] }).members.filter((x) => x.title === title);
    if (hits.length !== 1) { problems.push(`${kind}: ${hits.length} members for ${who}`); continue; }
    if (kind === 'focus') hits[0].focus = value; else hits[0].title = value;
  }
}
// Focus lines say "the person", as every role does (review 9).
for (const t of teams) for (const m of t.members) {
  m.focus = [m.focus].flat().map((l) => l.replace(/\bthe user['’]s\b/g, "the person's").replace(/\bthe user\b/g, 'the person'));
  if (m.focus.length === 1) m.focus = m.focus[0];
}
// A role no seat uses after all this is not taken either (the picker would list it for nothing).
const usedRoles = new Set(teams.flatMap((t) => t.members.map((m) => m.role)));
for (let i = roles.length - 1; i >= 0; i--) if (!usedRoles.has(roles[i].key)) { console.log(`not taken, no seat uses it: ${roles[i].key}`); roles.splice(i, 1); }

// Picker groups: every role taken goes in a group the picker already has (review 3: the packet's
// categories made a "General" of 86 and seven one-to-three-role groups). Strategy is the one new group.
for (const r of roles) {
  const g = fixed.group[r.key];
  if (g) r.category = g;
  else if (!catRoles.has(r.key) && !bi.has(r.key)) problems.push(`group: no group for new role ${r.key}`);
}
// A packet team that does the same job as a published one under another key replaces it (review 3: the
// packet covers every published team): it takes the published key, so the importer keeps the published
// team's rank, project name, and a member's slot where the role matches.
for (const [pk, pubKey] of Object.entries(fixed.rekey)) {
  const t = teams.find((x) => x.key === pk);
  if (!t) { problems.push(`rekey: no team ${pk}`); continue; }
  if (teams.some((x) => x.key === pubKey)) { problems.push(`rekey: ${pubKey} is already a packet team`); continue; }
  const pub = JSON.parse(fs.readFileSync(path.join(CAT, 'teams', `${pubKey}.json`), 'utf8'));
  if (pub.kind !== t.kind) problems.push(`rekey: ${pk} is ${t.kind}, ${pubKey} is ${pub.kind}`);
  t.key = pubKey;
}

// A new role renamed so it does not read like its neighbour in the picker (review 4).
for (const r of roles) {
  const to = (fixed.roleName || {})[r.key];
  if (!to) continue;
  const was = r.name;
  r.name = to;
  r.instructions = r.instructions.map((l) => l.replace(`You are the **${was}**.`, `You are the **${to}**.`));
}
// Team text (review 4). The packet's purpose and goal are one template for all 77 ("Designed for ...
// executing on <name>", "Deliver a comprehensive initial <name> plan"), with names lower-cased (hr, seo).
// A team that replaces a published one keeps the published purpose and goal, which were written for it,
// and its blurb where the members are the same. Every other team keeps the packet's one specific sentence.
const plainCase = (label) => label.replace(/ Team$/, '').split(' ').map((w, i) => (/^[A-Z0-9&]{2,}$/.test(w) ? w : (i === 0 ? w : w.toLowerCase()))).join(' ');
for (const t of teams) {
  let pub = null;
  try { pub = JSON.parse(fs.readFileSync(path.join(CAT, 'teams', `${t.key}.json`), 'utf8')); } catch { /* a new team */ }
  if (pub) {
    t.purpose = pub.purpose;
    t.goal = pub.project.goal;
    if (!(fixed.publishedBlurbExcept || []).includes(t.key)) t.blurb = pub.blurb;
    continue;
  }
  const m = /^(?:Designed for business owners, leaders, and teams executing on|Created for individuals, families, and organizers looking for dedicated support with) [^.]+\. (.+?\.) The team (?:coordinates|takes care of) [^.]+\.$/.exec(t.purpose);
  if (!m) { problems.push(`${t.key}: purpose is not the packet template, left as it is: ${t.purpose}`); continue; }
  const doing = (m[1].charAt(0).toLowerCase() + m[1].slice(1)).replace(/the user[’']s/g, 'their');
  t.purpose = t.kind === 'business' ? `For a business that wants to ${doing}` : `For anyone who wants to ${doing}`;
  const name = plainCase(t.label);
  const lead = /^[A-Z0-9&]{2,}$/.test(name.split(' ')[0]) ? name : name.charAt(0).toLowerCase() + name.slice(1);
  t.goal = `A clear first plan for ${lead}, with milestones, an owner for each, and what done looks like.`;
}
for (const t of teams) t.blurb = t.blurb.replace(/the user[’']s/g, 'your');
// A carried text that no longer matches the team's seats (review 5: life).
for (const [k, text] of Object.entries(fixed.teamText || {})) {
  const t = teams.find((x) => x.key === k);
  if (!t) { problems.push(`teamText: no team ${k}`); continue; }
  Object.assign(t, text);
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
const pk = new Set(roles.map((r) => r.key));
for (const t of teams) for (const m of t.members) if (!pk.has(m.role) && !catRoles.has(m.role) && !bi.has(m.role)) problems.push(`${t.key}/${m.name}: unknown role ${m.role}`);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'teams.json'), JSON.stringify(teams, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'roles.json'), JSON.stringify(roles, null, 1) + '\n');
const count = (p) => teams.reduce((s, t) => s + t.members.filter((m) => m.avatar.presentation === p).length, 0);
console.log(`teams ${teams.length}, members ${teams.reduce((s, t) => s + t.members.length, 0)} (woman ${count('woman')}, man ${count('man')}), roles ${roles.length}`);
console.log(problems.length ? `PROBLEMS ${problems.length}:\n${problems.join('\n')}` : 'no problems');
process.exitCode = problems.length ? 1 : 0;
