# packetimport: take the OpenAI teams packet into the catalogue

Card: joshualeestone/kosmos#4632 (the packet "lands directly in the new repo"). Fit report and calls
posted on the card 2026-09-29 22:27 and 22:28 CDT.

## Calls
- This version of the packet is not imported: 33 of 77 teams are below Josh's lead-plus-4-or-5 spec
  (#4554), and all 171 picker summaries are one template line. Both would ship visibly.
- The catalogue changes to take the brief's role sections; the packet does not change to fit ours.
- The team-size rule stays (Josh's spec; Kosmos refuses other sizes too).

## Role format, new (catalogue side)
- Front matter: name, summary, first, archetype, caution (optional).
- Body: the description paragraph, then `## How you work` (exactly three rules, one line each), then
  `## What you ask the person before doing` and `## What you never do on your own` (one or more
  rules each, one line each). `## Who you are` is dropped: the archetype and, in a team, the
  member's personality carry the character.
- Existing 69 roles: convert their Who-you-are paragraph into an archetype line plus keep it as
  the description's second sentence? Decide when converting; weakest point of this plan.

## Team member fields, new
- `personality`: { archetype, traits, personality, voice, quirk, worksBestWith } as text. Kosmos
  writes it into the member's instruction file (Kosmos-side change, after #4632 merges; the format
  stays 2 because the fields are additive and Kosmos's shape check ignores unknown member fields:
  verify that before relying on it).

## Importer: tools/import-packet.js <packet dir> [--write]
- Maps packet teams and roles onto the sources (slot = role key, deduped; project.name = label
  without " Team"; rank after the existing teams of the same kind, packet order).
- Dry run builds into a temp copy (the copyRepo pattern in test/catalogue.test.js) and prints the
  builder's problems grouped by kind, so a regenerated packet shows at once what is left.
- Collisions: a packet team with a published key replaces that team (same theme); a packet role
  whose key is a published or built-in role is dropped and members use the existing one.

## Needs from the packet (asked on the card)
Team sizes, real summaries, a first action per role, `presentation` as how the person presents,
non-colliding names, and the portraits.

## Review iteration 1 (changes)
- The candidate is written to a throwaway copy and built from disk as well as in memory, so --write
  can no longer write a role file the next build refuses (a missing summary passed in memory).
- A heading the importer does not know, or loose text inside a section, is reported, not merged.
- Replacing a published team keeps its rank and, for a member with the same role, its slot; a kept
  slot whose person changed while a portrait exists is reported.
- A packet of the wrong shape (no members, a deeper hierarchy, no packet at all) is reported, not a
  crash. Tests cover --write round trip, the disk-only refusal, unknown headings and shape; the two
  MAJOR tests each fail with their fix removed.
