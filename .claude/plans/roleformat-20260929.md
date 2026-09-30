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

## Review iteration 1 (changes)
- A role with both a Who you are paragraph and an archetype is refused (parser and builder); the
  importer keeps the paragraph when a packet role has both. The em-dash and marker checks now scan
  the source role as well as the built entry, so no field can hide one.
- Tests put an em dash, escaped em dash, web address, marker, HTML comment and hidden character
  into the new fields, each refused, with the clean role as control.
- "an" before a silent h (honest, honour, hour, heir). Output for the 69 roles is still identical
  (catalogue and text).

## Review iteration 2 (changes)
- The archetype sentence has its own article rule by sound (an honest, a user-focused, a one-track,
  a unique, an unimportant-seeming); labels keep articleFor, so existing output is unchanged. An
  archetype may not start with a, an or the.
- The renderer skips a list of the wrong shape (ask, never, and how, which crashed on main too); the
  shape is reported where the role is checked. Output for the 69 roles still identical.

## Review iteration 3 (changes)
- Every item of How you work, ask and never must be non-blank text (an in-memory role could render
  "- null"; How you work had the same gap on main).
- A section heading with nothing under it is named ("... has no items") instead of reading as part
  of the list before it; roleText writes no heading for an empty list.
- An archetype with a trailing or doubled space is refused; the length message says 80 at most.
- Output for the 69 roles still identical.

## Review iteration 4: converged (NITs only, recorded, not changed)
- An empty heading in the middle of the body is refused as "must be a list" rather than "has no
  items" (refused either way; only the message).
- Article edge cases (hourly, onerous) are within the accepted ones.
- An archetype may carry Markdown emphasis characters (cosmetic; links, HTML and markers refused).
