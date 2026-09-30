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

// Front-matter field in role.md -> field in the built role. Readable names in the file, the
// product's names in catalogue.json.
const FRONT = [['name', 'label'], ['summary', 'blurb'], ['first', 'first'], ['caution', 'caution']];

function parseRole(key, text) {
  const problems = [];
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) return { problems: [`roles/${key}/role.md: must start with a --- front-matter block`] };
  const role = { key };
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    const name = i < 0 ? line : line.slice(0, i);
    const pair = FRONT.find(([f]) => f === name);
    if (!pair) { problems.push(`roles/${key}/role.md: unknown front-matter line ${JSON.stringify(line)}`); continue; }
    if (role[pair[1]] !== undefined) problems.push(`roles/${key}/role.md: ${name} appears twice`);
    role[pair[1]] = line.slice(i + 1).trim();
  }
  for (const [f, to] of FRONT) if (f !== 'caution' && !role[to]) problems.push(`roles/${key}/role.md: ${f} is missing`);
  const body = m[2].replace(/^\n+/, '').replace(/\n+$/, '');
  const parts = body.split(/\n\n## (Who you are|How you work)\n\n/);
  if (parts.length !== 5 || parts[1] !== 'Who you are' || parts[3] !== 'How you work') {
    problems.push(`roles/${key}/role.md: the body must be the description, then "## Who you are", then "## How you work"`);
    return { problems };
  }
  const para = (label, s) => {
    if (s.includes('\n')) problems.push(`roles/${key}/role.md: ${label} must be one paragraph on one line`);
    return s;
  };
  role.desc = para('the description', parts[0]);
  role.who = para('Who you are', parts[2]);
  const items = parts[4].split('\n');
  if (items.some((l) => !l.startsWith('- '))) problems.push(`roles/${key}/role.md: How you work must be a list, one "- " line per item`);
  role.how = items.map((l) => l.replace(/^- /, ''));
  return { role, problems };
}

function roleText(r) {
  const front = FRONT.filter(([, to]) => r[to] !== undefined).map(([f, to]) => `${f}: ${r[to]}`);
  return ['---', ...front, '---', '', r.desc, '', '## Who you are', '', r.who, '', '## How you work', '',
    ...r.how.map((h) => '- ' + h), ''].join('\n');
}

function readJson(p, problems) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { problems.push(`${path.relative(ROOT, p)}: ${e.message}`); return null; }
}

/**
 * @param {string} [root] the repo (a test passes a copy)
 * @returns {{rolesSource: object, teamsSource: object, problems: string[]}} the shapes build()
 *   takes; problems lists every file that could not be read as the format above.
 */
function read(root = ROOT) {
  const problems = [];
  const groups = readJson(path.join(root, 'groups.json'), problems) || [];
  const settings = readJson(path.join(root, 'settings.json'), problems) || {};
  const listed = new Set();
  const roles = [];
  for (const g of groups) {
    for (const key of g.roles) {
      if (listed.has(key)) { problems.push(`groups.json: ${key} is listed twice`); continue; }
      listed.add(key);
      const file = path.join(root, 'roles', key, 'role.md');
      if (!fs.existsSync(file)) { problems.push(`groups.json lists ${key}, but roles/${key}/role.md does not exist`); continue; }
      const { role, problems: p } = parseRole(key, fs.readFileSync(file, 'utf8'));
      problems.push(...p);
      if (role) roles.push({ ...role, group: g.group });
    }
  }
  const roleDir = path.join(root, 'roles');
  for (const key of fs.existsSync(roleDir) ? fs.readdirSync(roleDir) : []) {
    if (!listed.has(key)) problems.push(`roles/${key} is not listed in any group in groups.json, so no menu would show it`);
  }
  const teamDir = path.join(root, 'teams');
  const teams = [];
  for (const f of (fs.existsSync(teamDir) ? fs.readdirSync(teamDir) : []).sort()) {
    if (!f.endsWith('.json')) { problems.push(`teams/${f}: only .json files belong in teams/`); continue; }
    const t = readJson(path.join(teamDir, f), problems);
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

/** Write the source objects out as files (used once, to export the old single-file sources). */
function write(rolesSource, teamsSource, root = ROOT) {
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

module.exports = { ROOT, read, write, parseRole, roleText };
