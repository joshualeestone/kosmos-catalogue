# roleformat: the role format takes the teams packet brief's sections

Card: joshualeestone/kosmos#4632 (fit report and call, 2026-09-29 22:27 CDT: the catalogue's role
format predates the brief, so the catalogue changes, not the packet).

## What changes
- role.md front matter: optional `archetype:` (short lowercase phrase, no full stop, under 80).
- Body: description, then `## Who you are` (optional when there is an archetype), `## How you
  work` (three), then optional `## What you ask the person before doing` and `## What you never do
  on your own` (one to four each), in that order.
- Built instructions: Who you are is the paragraph, or "You are a <archetype>." when there is none;
  the two lists follow How you work. Kosmos reads only instructions and firstAction, so no Kosmos
  change is needed for roles.
- tools/import-packet.js carries archetype, ask and never, and leaves Who you are out when the
  packet has no character paragraph.

## Measured
- The 69 published roles and 21 teams build byte-identical to main (compared with a control that
  detects a one-line change).
- The real packet's 165 missing-character problems disappear; what remains is packet-side: first
  actions, presentation, team size, names.

## Calls
- Additive, not a replacement: the 69 roles keep their Who you are paragraphs.
- The archetype sentence is "You are a <archetype>." (weakest premise: reads slightly flat next to a
  real paragraph; a later copy pass can change the template without touching data).
- Member personality (the packet's per-member block) is not in this change: it needs Kosmos to
  write it into the member's instruction file, after #4632's Kosmos branch merges.
