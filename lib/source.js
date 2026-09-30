'use strict';
/**
 * Read the catalogue's source files into the two objects build.js composes from, and write them
 * back (the export from the old single-file sources, and tests that edit a copy).
 *
 *   groups.json                 the menu groups in order, each with its role keys in order
 *   roles/<key>/role.md         one role: a front-matter block, then its description,
 *                               "## Who you are" and "## How you work" (a list of three)
 *   teams/<key>.json            one team: a lead plus 4 or 5 reports
 *   settings.json               teamCaution and avatarStyle, shared by every team
 *
 * Every paragraph and list item is one line: the parser does not unwrap text, so a line break
 * inside a paragraph is refused rather than silently joined.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
/** A role key, team key or slot: it names a folder or file, so lowercase words and hyphens only. */
const KEY_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Front-matter field in role.md -> field in the built role. Readable names in the file, the
// product's names in catalogue.json.
const FRONT = [['name', 'label'], ['summary', 'blurb'], ['first', 'first'], ['archetype', 'archetype'], ['caution', 'caution']];
/** Front-matter fields a role may leave out. */
const OPTIONAL = ['archetype', 'caution'];
/** The body's sections in the order they appear. Who you are may be left out when the role has an
 *  archetype; the last two are optional (kosmos-teams-packet-format.md: what the agent asks the
 *  person before doing, and what it never does on its own). */
const SECTIONS = [['Who you are', 'who'], ['How you work', 'how'], ['What you ask the person before doing', 'ask'], ['What you never do on your own', 'never']];

function parseRole(key, text) {
  const problems = [];
  if (text.includes('\r')) return { problems: [`roles/${key}/role.md: has Windows line endings (CRLF); save it with LF (.gitattributes asks git to)`] };
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) return { problems: [`roles/${key}/role.md: must start with a --- front-matter block`] };
  const role = { key };
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) { problems.push(`roles/${key}/role.md: front-matter line ${JSON.stringify(line)} has no "name: value"`); continue; }
    const name = line.slice(0, i);
    const pair = FRONT.find(([f]) => f === name);
    if (!pair) { problems.push(`roles/${key}/role.md: unknown front-matter line ${JSON.stringify(line)}`); continue; }
    if (role[pair[1]] !== undefined) problems.push(`roles/${key}/role.md: ${name} appears twice`);
    role[pair[1]] = line.slice(i + 1).trim();
  }
  for (const [f, to] of FRONT) if (!OPTIONAL.includes(f) && !(role[to] || '').trim()) problems.push(`roles/${key}/role.md: ${f} is missing`);
  for (const f of OPTIONAL) if (role[f] === '') problems.push(`roles/${key}/role.md: ${f} is empty; remove the line when the role has none`);
  const body = m[2].replace(/^\n+/, '').replace(/\n+$/, '');
  const heads = new RegExp(`\\n\\n## (${SECTIONS.map(([h]) => h).join('|')})\\n\\n`);
  const parts = body.split(heads);
  const names = parts.filter((_, i) => i % 2 === 1);
  const order = SECTIONS.map(([h]) => h);
  const inOrder = names.every((n, i) => i === 0 || order.indexOf(n) > order.indexOf(names[i - 1]));
  if (names.includes('Who you are') && role.archetype) {
    problems.push(`roles/${key}/role.md: has both "## Who you are" and an archetype; keep one (the archetype stands in for the paragraph)`);
    return { problems };
  }
  if (!inOrder || !names.includes('How you work') || (!names.includes('Who you are') && !role.archetype)) {
    problems.push(`roles/${key}/role.md: the body must be the description, then "## Who you are" (which a role with an archetype may leave out), then "## How you work", then optionally "## What you ask the person before doing" and "## What you never do on your own", in that order`);
    return { problems };
  }
  const para = (label, s) => {
    if (s.includes('\n')) problems.push(`roles/${key}/role.md: ${label} must be one paragraph on one line`);
    return s;
  };
  role.desc = para('the description', parts[0]);
  if (!role.desc.trim()) problems.push(`roles/${key}/role.md: the description is empty`);
  for (let i = 1; i < parts.length; i += 2) {
    const [head, field] = SECTIONS.find(([h]) => h === parts[i]);
    if (field === 'who') { role.who = para('Who you are', parts[i + 1]); continue; }
    const items = parts[i + 1].split('\n');
    if (items.some((l) => !l.startsWith('- '))) problems.push(`roles/${key}/role.md: ${head} must be a list, one "- " line per item`);
    role[field] = items.map((l) => l.replace(/^- /, ''));
    if (role[field].some((h) => !h.trim())) problems.push(`roles/${key}/role.md: ${head} has an empty rule`);
  }
  // An incomplete role is reported and left out, so the builder never composes text from a hole.
  return problems.length ? { problems } : { role, problems };
}

function roleText(r) {
  const front = FRONT.filter(([, to]) => r[to] !== undefined).map(([f, to]) => `${f}: ${r[to]}`);
  const out = ['---', ...front, '---', '', r.desc];
  if (r.who !== undefined) out.push('', '## Who you are', '', r.who);
  out.push('', '## How you work', '', ...r.how.map((h) => '- ' + h));
  if (r.ask) out.push('', '## What you ask the person before doing', '', ...r.ask.map((h) => '- ' + h));
  if (r.never) out.push('', '## What you never do on your own', '', ...r.never.map((h) => '- ' + h));
  return out.concat('').join('\n');
}

/** True when p is a real folder or regular file (not a link), without following links. */
function plain(p, kind) {
  try { const st = fs.lstatSync(p); return kind === 'dir' ? st.isDirectory() : st.isFile(); } catch { return false; }
}

/** The JSON object in p, or null (reported) when it cannot be read or is not an object. */
function readJson(root, p, problems, kind = 'object') {
  let v;
  try { v = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { problems.push(`${path.relative(root, p)}: ${e.message}`); return null; }
  const ok = kind === 'list' ? Array.isArray(v) : (v !== null && typeof v === 'object' && !Array.isArray(v));
  if (!ok) { problems.push(`${path.relative(root, p)}: must be a JSON ${kind === 'list' ? 'list' : 'object'}`); return null; }
  return v;
}

/**
 * @param {string} [root] the repo (a test passes a copy)
 * @returns {{rolesSource: object, teamsSource: object, problems: string[]}} the shapes build()
 *   takes; problems lists every file that could not be read as the format above.
 */
function read(root = ROOT) {
  const problems = [];
  // Nothing the build reads may be a link: it would read text from outside the repo.
  for (const [name, kind] of [['groups.json', 'file'], ['settings.json', 'file'], ['kosmos-builtin-roles.json', 'file'], ['roles', 'dir'], ['teams', 'dir']]) {
    let there = false;
    try { fs.lstatSync(path.join(root, name)); there = true; } catch { there = false; }   // lstat: a dangling link is there too
    if (there && !plain(path.join(root, name), kind)) {
      problems.push(`${name}: must be a ${kind === 'dir' ? 'folder' : 'regular file'} in this repo, not a link`);
      return { rolesSource: { GROUP_ORDER: [], roles: [] }, teamsSource: { teams: [] }, problems };
    }
  }
  let groups = readJson(root, path.join(root, 'groups.json'), problems, 'list') || [];
  if (!Array.isArray(groups) || !groups.every((g) => g && typeof g.group === 'string' && Array.isArray(g.roles))) {
    problems.push('groups.json: must be a list of { "group": name, "roles": [keys] }');
    groups = [];
  }
  const settings = readJson(root, path.join(root, 'settings.json'), problems) || {};
  const listed = new Set();
  const roles = [];
  for (const g of groups) {
    for (const key of g.roles) {
      if (listed.has(key)) { problems.push(`groups.json: ${key} is listed twice`); continue; }
      listed.add(key);
      // The key names a folder, so nothing but lowercase words and hyphens reaches a path.
      if (typeof key !== 'string' || !KEY_RE.test(key)) { problems.push(`groups.json: role key ${JSON.stringify(key)} must be lowercase words joined by hyphens`); continue; }
      const file = path.join(root, 'roles', key, 'role.md');
      let there = false;
      try { fs.lstatSync(file); there = true; } catch { there = false; }   // lstat: a dangling link is there
      if (!there) { problems.push(`groups.json lists ${key}, but roles/${key}/role.md does not exist`); continue; }
      // Only a real folder and a regular file: a link would read text from outside the repo.
      if (!plain(path.join(root, 'roles', key), 'dir') || !plain(file, 'file')) { problems.push(`roles/${key}: must be a folder holding a regular role.md, not a link`); continue; }
      const { role, problems: p } = parseRole(key, fs.readFileSync(file, 'utf8'));
      problems.push(...p);
      if (role) roles.push({ ...role, group: g.group });
    }
  }
  const roleDir = path.join(root, 'roles');
  for (const key of fs.existsSync(roleDir) ? fs.readdirSync(roleDir).filter((n) => !n.startsWith('.')) : []) {
    if (!listed.has(key)) problems.push(`roles/${key} is not listed in any group in groups.json, so no menu would show it`);
  }
  const teamDir = path.join(root, 'teams');
  const teams = [];
  for (const f of (fs.existsSync(teamDir) ? fs.readdirSync(teamDir) : []).filter((n) => !n.startsWith('.')).sort()) {
    if (!f.endsWith('.json')) { problems.push(`teams/${f}: only .json files belong in teams/`); continue; }
    if (!plain(path.join(teamDir, f), 'file')) { problems.push(`teams/${f}: must be a regular file, not a link`); continue; }
    const t = readJson(root, path.join(teamDir, f), problems);
    if (!t) continue;
    if (t.key !== f.slice(0, -5)) problems.push(`teams/${f}: its key is ${JSON.stringify(t.key)}; the file must be named after it`);
    teams.push(t);
  }
  // A stable order that does not depend on the filesystem (Kosmos sorts again when it reads them).
  teams.sort((a, b) => String(a.kind).localeCompare(String(b.kind)) || (a.rank - b.rank));
  return {
    rolesSource: { GROUP_ORDER: groups.map((g) => g.group), roles },
    teamsSource: { TEAM_CAUTION: settings.teamCaution, AVATAR_STYLE: settings.avatarStyle, teams },
    problems,
  };
}

/** Write the source objects out as files: how the old single-file Kosmos sources were exported
 *  (kosmos#4632), and the inverse of read() for anyone importing a batch of roles or teams. */
function write(rolesSource, teamsSource, root = ROOT) {
  // Keys name files and folders: refuse one that could reach outside root before writing anything.
  const keys = [...rolesSource.roles.map((r) => r.key), ...teamsSource.teams.map((t) => t.key)];
  const badKey = keys.find((k) => typeof k !== 'string' || !KEY_RE.test(k));
  if (badKey !== undefined) throw new Error(`key ${JSON.stringify(badKey)} must be lowercase words joined by hyphens`);
  const groups = rolesSource.GROUP_ORDER.map((g) => ({ group: g, roles: rolesSource.roles.filter((r) => r.group === g).map((r) => r.key) }));
  fs.writeFileSync(path.join(root, 'groups.json'), JSON.stringify(groups, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify({ teamCaution: teamsSource.TEAM_CAUTION, avatarStyle: teamsSource.AVATAR_STYLE }, null, 2) + '\n');
  for (const r of rolesSource.roles) {
    fs.mkdirSync(path.join(root, 'roles', r.key), { recursive: true });
    fs.writeFileSync(path.join(root, 'roles', r.key, 'role.md'), roleText(r));
  }
  fs.mkdirSync(path.join(root, 'teams'), { recursive: true });
  for (const t of teamsSource.teams) fs.writeFileSync(path.join(root, 'teams', t.key + '.json'), JSON.stringify(t, null, 2) + '\n');
}

module.exports = { ROOT, KEY_RE, read, write, parseRole, roleText };
