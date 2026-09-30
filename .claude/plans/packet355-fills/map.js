'use strict';
/* Josh's portraits are named <team key>-<slug(title)>.png; the catalogue names <team>-<slot>.webp.
   node map.js <packet dir> <catalogue worktree> <webp dir> <out map> <teams-fill.json>  (writes the map; checks 1:1)
   A folded team (teams-fill rekey) is named by its packet key in the file, by its published key here. */
const fs = require('fs'), path = require('path');
const [P, W, B, OUT, FILL] = process.argv.slice(2);
const rekey = JSON.parse(fs.readFileSync(FILL, 'utf8')).rekey || {};
const orig = JSON.parse(fs.readFileSync(path.join(P, 'teams.json'), 'utf8'));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const files = new Set(fs.readdirSync(B).filter((f) => f.endsWith('.webp')));
const lines = [], problems = [], used = new Set(), ids = new Set();
for (const ot of orig) {
  const key = rekey[ot.key] || ot.key;
  const t = JSON.parse(fs.readFileSync(path.join(W, 'teams', key + '.json'), 'utf8'));
  for (const om of ot.members) {
    const png = `${ot.key}-${slug(om.title)}`;
    const hits = t.members.filter((x) => x.title === om.title);
    if (hits.length !== 1) { problems.push(`${png}: ${hits.length} members with this title`); continue; }
    if (!files.has(png + '.webp')) { problems.push(`no image ${png}`); continue; }
    const id = `${key}-${hits[0].slot}`;
    if (used.has(png) || ids.has(id)) problems.push(`twice: ${png} / ${id}`);
    used.add(png); ids.add(id);
    lines.push(`${png}.png -> ${id}`);
  }
}
for (const f of files) if (!used.has(f.replace(/\.webp$/, ''))) problems.push(`unmapped image ${f}`);
fs.writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`mapped ${lines.length}; problems ${problems.length}`); problems.forEach((p) => console.log(p));
process.exitCode = problems.length ? 1 : 0;
