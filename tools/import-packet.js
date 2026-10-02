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
 *   teams of the same kind, in packet order. A team's menu group (team-groups.json) is the packet's `group`, or
 *   for a replaced team its published one; a new team with neither is refused by the build, by name (kosmos#5021).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const build = require('../build');
const source = require('../lib/source');

const AVATAR_FIELDS = ['apparentAge', 'presentation', 'heritage', 'hair', 'attire', 'expression'];

/** The presentations the published teams use, which the portrait prompt is written for. */
const PRESENTATIONS = ['woman', 'man', 'nonbinary person'];

const HEADS = { '## How you work': 'how', '## What you ask the person before doing': 'ask', '## What you never do on your own': 'never' };

/** The packet's role instructions, split into the description and the three sections. Anything
 *  else (another heading, text inside a section that is not a list item) is reported, not guessed. */
function sections(lines) {
  const out = { desc: '', how: [], ask: [], never: [], problems: [] };
  let at = null;
  for (const l of lines) {
    if (Object.hasOwn(HEADS, l)) { at = HEADS[l]; continue; }
    if (!l.trim()) continue;
    if (/^#/.test(l)) out.problems.push(`a heading this importer does not know: ${JSON.stringify(l)}`);
    else if (at && l.startsWith('- ')) out[at].push(l.slice(2));
    else if (at) out.problems.push(`text inside ${JSON.stringify(Object.keys(HEADS).find((h) => HEADS[h] === at))} that is not a "- " item: ${JSON.stringify(l)}`);
    else if (!/^You are the \*\*/.test(l)) out.desc = out.desc ? `${out.desc} ${l}` : l;
  }
  return out;
}

/** The packet role as a catalogue role (the fields the current role format has). */
function roleFrom(p) {
  const s = sections(p.instructions);
  const r = { key: p.key, group: p.category, label: p.name, blurb: p.summary, first: p.first || '', desc: s.desc, how: s.how };
  // The brief gives an archetype per role, which stands in for Who you are when there is no paragraph.
  // One or the other (the format refuses both): a written paragraph says more than the phrase.
  if (p.character) r.who = p.character;
  else if (p.archetype) r.archetype = p.archetype;
  if (s.ask.length) r.ask = s.ask;
  if (s.never.length) r.never = s.never;
  if (p.caution) r.caution = p.caution;
  return { role: r, problems: s.problems.map((x) => `${p.key}: ${x}`) };
}

/** The packet team as a catalogue team. Replacing a published team keeps its rank and, for a
 *  member whose role the published team also had, that member's slot. */
function teamFrom(p, rank, published) {
  const used = new Map();
  const taken = new Set(['lead']);
  const old = published ? published.members.filter((m) => m.slot !== 'lead') : [];
  const members = p.members.map((m) => {
    let slot = 'lead';
    if (m.reportsTo) {
      const same = old.find((o) => o.role === m.role && !taken.has(o.slot));
      if (same) slot = same.slot;
      else {
        let n = used.get(m.role) || 0;
        do { n += 1; slot = n === 1 ? m.role : `${m.role}-${n}`; } while (taken.has(slot) || old.some((o) => o.slot === slot));
        used.set(m.role, n);
      }
      taken.add(slot);
    }
    const a = m.avatar || {};
    return {
      slot, role: m.role, title: m.title, name: m.name, focus: [m.focus].flat().filter(Boolean),
      avatar: { apparentAge: a.apparentAge, presentation: a.presentation, heritage: a.heritage, hair: a.hair, attire: a.attire, expression: a.expression },
    };
  });
  return {
    // kosmos#5021: the packet's own `group` when it gives one (as a role's category); otherwise a replaced team keeps
    // its heading (as its rank), and a new team has none, which the build names rather than guessing a heading.
    key: p.key, kind: p.kind, group: p.group !== undefined ? p.group : (published && published.kind === p.kind ? published.group : undefined),
    rank: published && published.kind === p.kind ? published.rank : rank, label: p.label, blurb: p.blurb, purpose: p.purpose,
    // A published team keeps its project name (several are not its label, e.g. exec's "My Office").
    project: { name: published ? published.project.name : String(p.label).replace(/ Team$/, ''), goal: p.goal },
    members,
  };
}

/** What would make the importer read a packet wrong: its shape, before any mapping and before
 *  anything touches a disk. Every key names a file or folder, so each must match KEY_RE here: a
 *  key such as "../x" would otherwise be written outside the throwaway copy. */
function shapeProblems(packet) {
  const out = [];
  if (!Array.isArray(packet.teams)) return ['teams.json: must be a list of teams'];
  if (!Array.isArray(packet.roles)) return ['roles.json: must be a list of roles'];
  const key = (k) => typeof k === 'string' && source.KEY_RE.test(k);
  const text = (v) => v === undefined || typeof v === 'string';
  const bad = (o, fields) => fields.filter((f) => !text(o[f]));
  packet.teams.forEach((t, i) => {
    const name = t && key(t.key) ? t.key : `team ${i + 1}`;
    if (!t || typeof t !== 'object' || !key(t.key)) { out.push(`teams.json: ${name}: key must be lowercase words joined by hyphens`); return; }
    const f = bad(t, ['kind', 'label', 'blurb', 'purpose', 'goal']);
    if (f.length) out.push(`teams.json: ${name}: ${f.join(', ')} must be text`);
    if (!Array.isArray(t.members) || !t.members.every((m) => m && typeof m === 'object')) { out.push(`teams.json: ${name}: members must be a list of people, each with a role`); return; }
    t.members.forEach((m, j) => {
      const who = `teams.json: ${name}: member ${j + 1}`;
      if (!key(m.role)) out.push(`${who}: role must be a role key (lowercase words joined by hyphens)`);
      const mf = bad(m, ['title', 'name']);
      if (!(text(m.focus) || (Array.isArray(m.focus) && m.focus.every((x) => typeof x === 'string')))) mf.push('focus');
      if (m.avatar !== undefined && (!m.avatar || typeof m.avatar !== 'object' || Object.values(m.avatar).some((v) => typeof v !== 'string'))) mf.push('avatar');
      if (mf.length) out.push(`${who}: ${mf.join(', ')} must be text`);
      if (m.reportsTo && m.reportsTo !== 'lead') out.push(`${who}: every member reports to the lead (a deeper hierarchy is not supported)`);
    });
  });
  for (const [file, list] of [['teams.json', packet.teams], ['roles.json', packet.roles]]) {
    const keys = list.map((x) => x && x.key).filter((k) => typeof k === 'string');
    const twice = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
    if (twice.length) out.push(`${file}: ${twice.join(', ')} appear${twice.length === 1 ? 's' : ''} more than once`);
  }
  packet.roles.forEach((r, i) => {
    if (!r || typeof r !== 'object' || !key(r.key)) { out.push(`roles.json: role ${i + 1}: key must be lowercase words joined by hyphens`); return; }
    const f = bad(r, ['name', 'summary', 'category', 'first', 'character', 'archetype']);
    if (!(r.caution === null || text(r.caution))) f.push('caution');
    if (f.length) out.push(`roles.json: ${r.key}: ${f.join(', ')} must be text`);
    if (!Array.isArray(r.instructions) || !r.instructions.every((l) => typeof l === 'string')) out.push(`roles.json: ${r.key}: instructions must be a list of lines`);
  });
  return out;
}

/** A throwaway copy of the sources, so a candidate is checked as the files a later build reads. */
function copyRepo(root) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-import-'));
  try {
    for (const f of ['groups.json', 'team-groups.json', 'settings.json', 'kosmos-builtin-roles.json', 'roles', 'teams', 'avatars']) {
      if (!fs.existsSync(path.join(root, f))) continue;
      /* A link would be copied as a link, and writing the candidate into the copy would then write
         through it, outside the copy. The builder refuses links anyway; refuse them here first. */
      fs.cpSync(path.join(root, f), path.join(dir, f), {
        recursive: true,
        filter: (src) => {
          if (fs.lstatSync(src).isSymbolicLink()) throw Object.assign(new Error(`${path.relative(root, src)}: is a link; the importer does not follow links`), { code: 'IMPORT_LINK' });
          return true;
        },
      });
    }
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  return dir;
}

/**
 * Merge a packet into the sources and check the result as files: the sources are written to a
 * throwaway copy and built from disk, the same way the next `node build.js` will read them.
 * @param {{teams: object[], roles: object[]}} packet
 * @param {string} [root] the catalogue repo
 * @returns {{rolesSource: object, teamsSource: object, problems: string[], taken: object}}
 */
function importPacket(packet, root = source.ROOT) {
  const shape = shapeProblems(packet);
  if (shape.length) return { problems: shape, taken: { roles: 0, teamsNew: 0, teamsReplaced: 0 } };
  const cur = source.read(root);
  const builtin = JSON.parse(fs.readFileSync(path.join(root, 'kosmos-builtin-roles.json'), 'utf8'));
  const builtinKeys = new Set([...(builtin.roles || []), ...(builtin.hidden || [])].map((r) => (typeof r === 'string' ? r : r.key)));
  const have = new Set(cur.rolesSource.roles.map((r) => r.key));
  const mapped = packet.roles.filter((r) => !have.has(r.key) && !builtinKeys.has(r.key)).map(roleFrom);
  const newRoles = mapped.map((m) => m.role);
  const problems = mapped.flatMap((m) => m.problems);
  const groups = cur.rolesSource.GROUP_ORDER.slice();
  for (const r of newRoles) if (!groups.includes(r.group)) groups.push(r.group);
  const byKey = new Map(cur.teamsSource.teams.map((t) => [t.key, t]));
  const kept = cur.teamsSource.teams.filter((t) => !packet.teams.some((p) => p.key === t.key));
  const nextRank = { business: 0, personal: 0 };
  for (const t of cur.teamsSource.teams) nextRank[t.kind] = Math.max(nextRank[t.kind] || 0, t.rank);
  const incoming = packet.teams.map((t) => {
    const published = byKey.get(t.key);
    const keeps = published && published.kind === t.kind;
    return teamFrom(t, keeps ? null : (nextRank[t.kind] = (nextRank[t.kind] || 0) + 1), published);
  });
  // A kept slot keeps its portrait file: say so when the person in it changed (name, role or looks).
  for (const t of incoming) {
    const published = byKey.get(t.key);
    if (!published) continue;
    for (const m of t.members) {
      const was = published.members.find((o) => o.slot === m.slot);
      const changed = was && (was.name !== m.name || was.role !== m.role || AVATAR_FIELDS.some((f) => (was.avatar || {})[f] !== (m.avatar || {})[f]));
      if (changed && fs.existsSync(path.join(root, 'avatars', `${t.key}-${m.slot}.webp`))) {
        problems.push(`${t.key}/${m.slot}: avatars/${t.key}-${m.slot}.webp is ${was.name}'s portrait (${was.role}), and this slot is now ${m.name} (${m.role}) or looks different`);
      }
    }
  }
  const teams = kept.concat(incoming);
  const rolesSource = { GROUP_ORDER: groups, roles: cur.rolesSource.roles.concat(newRoles) };
  const teamsSource = { ...cur.teamsSource, teams };
  // In memory first: every rule the builder makes, even for a role whose file would not parse.
  problems.push(...build.build({ root, rolesSource, teamsSource }).problems);
  let tmp = null;
  try {
    try { tmp = copyRepo(root); } catch (err) {
      if (err.code !== 'IMPORT_LINK') throw err;
      problems.push(err.message);
    }
    if (tmp) {
      source.write(rolesSource, teamsSource, tmp);
      // A new role that does not parse is reported once; every member using it would repeat it.
      const unread = new Set(newRoles.map((r) => r.key));
      const built = build.build({ root: tmp });
      for (const r of built.catalogue ? built.catalogue.roles || [] : []) unread.delete(r.key);
      // The same problem from both builds can list its two teams in either order.
      const norm = (x) => x.split(/\s+/).sort().join(' ');
      const seen = new Set(problems.map(norm));
      problems.push(...built.problems.filter((x) => !seen.has(norm(x))).filter((x) => {
        const m = x.match(/role "([^"]+)" is neither a catalogue role/);
        return !(m && unread.has(m[1]) && built.problems.some((y) => y.startsWith(`roles/${m[1]}/role.md:`)));
      }));
    }
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
  /* The portrait prompt reads presentation as how the person presents ("a woman in her 30s"); the
     builder takes any text, so a personality phrase there would make every prompt read wrong. */
  for (const t of teams) for (const m of t.members) {
    const pres = (m.avatar || {}).presentation;
    if (!PRESENTATIONS.includes(pres)) problems.push(`${t.key}/${m.slot}: presentation ${JSON.stringify(pres)} is not one of ${PRESENTATIONS.join(', ')} (the portrait prompt reads it as how the person presents)`);
  }
  const replaced = cur.teamsSource.teams.length - kept.length;
  return { rolesSource, teamsSource, problems, taken: { roles: newRoles.length, teamsNew: packet.teams.length - replaced, teamsReplaced: replaced } };
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

/** Uncommitted changes to the sources in root, as git lists them. None when root is not a git
 *  checkout at all (a copy made by a test: nothing to undo with). Any other failure (git missing,
 *  a repo git refuses) throws: the guard must not pass because it could not look. */
function uncommitted(root) {
  const r = require('node:child_process').spawnSync('git', ['-C', root, 'status', '--porcelain', '--', 'groups.json', 'team-groups.json', 'settings.json', 'roles', 'teams'], { encoding: 'utf8' });
  if (r.status === 0) return r.stdout.split('\n').filter(Boolean).map((l) => l.slice(3));
  if (r.status === 128 && /not a git repository/i.test(r.stderr || '')) return [];
  throw new Error(`could not check the sources for uncommitted changes: ${(r.error && r.error.message) || (r.stderr || '').trim() || `git exited ${r.status}`}`);
}

function main(argv, root = source.ROOT, out = process.stdout) {
  const dirs = argv.filter((a) => !a.startsWith('--'));
  if (dirs.length > 1) { process.stderr.write(`import-packet: one packet folder only (also got ${dirs.slice(1).join(' ')}); options start with --\n`); return 2; }
  const dir = dirs[0];
  const unknown = argv.filter((a) => a.startsWith('--') && a !== '--write');
  if (unknown.length) { process.stderr.write(`import-packet: unknown option ${unknown.join(' ')}\n`); return 2; }
  if (!dir) { process.stderr.write('usage: node tools/import-packet.js <packet dir> [--write]\n'); return 2; }
  let packet;
  try {
    packet = { teams: JSON.parse(fs.readFileSync(path.join(dir, 'teams.json'), 'utf8')), roles: JSON.parse(fs.readFileSync(path.join(dir, 'roles.json'), 'utf8')) };
  } catch (err) {
    process.stderr.write(`import-packet: could not read the packet in ${dir}: ${err.message}\n`);
    return 2;
  }
  let r;
  try { r = importPacket(packet, root); } catch (err) {
    process.stderr.write(`import-packet: the packet could not be checked (nothing written): ${err.message}\n`);
    return 2;
  }
  const nTeams = Array.isArray(packet.teams) ? packet.teams.length : 0;
  const nRoles = Array.isArray(packet.roles) ? packet.roles.length : 0;
  out.write(`packet: ${nTeams} teams (${r.taken.teamsNew} new, ${r.taken.teamsReplaced} replace published ones), ${nRoles} roles (${r.taken.roles} new)\n`);
  if (!r.problems.length) {
    if (argv.includes('--write')) {
      let dirty;
      try { dirty = uncommitted(root); } catch (err) { process.stderr.write(`import-packet: ${err.message}; nothing written\n`); return 2; }
      if (dirty.length) {
        process.stderr.write(`import-packet: the sources have uncommitted changes (${dirty.slice(0, 5).join(', ')}${dirty.length > 5 ? ', ...' : ''}); commit or stash them first, so a write can be undone without losing them\n`);
        return 2;
      }
      const created = [
        ...r.rolesSource.roles.map((x) => path.join('roles', x.key)),
        ...r.teamsSource.teams.map((x) => path.join('teams', `${x.key}.json`)),
      ].filter((rel) => !fs.existsSync(path.join(root, rel)));
      try { source.write(r.rolesSource, r.teamsSource, root); } catch (err) {
        const undo = [`git -C ${JSON.stringify(root)} checkout -- groups.json team-groups.json settings.json roles teams`];
        if (created.length) undo.push(`rm -r ${created.map((rel) => JSON.stringify(path.join(root, rel))).join(' ')}`);
        process.stderr.write(`import-packet: writing stopped partway (${err.message}); the sources may be half written. To undo:\n  ${undo.join('\n  ')}\n`);
        return 2;
      }
      out.write('written; run npm test and node build.js\n');
    }
    else out.write('nothing refused; run again with --write\n');
    return 0;
  }
  out.write(`${r.problems.length} problems; nothing written\n`);
  for (const [, list] of summarise(r.problems)) out.write(`\n${list.length} x ${list[0]}\n`);
  return 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { importPacket, summarise, roleFrom, teamFrom, sections, shapeProblems, main, uncommitted };
