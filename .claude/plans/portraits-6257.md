# kosmos#6257: publish the prebuilt team portraits

**Branch:** `portraits-6257` · **Card:** kosmos#6257 (Josh 2026-10-15 15:57: "did we ever get all the default avatars in for the team of agents?")

## What was wrong
All 355 of Josh's portraits have been in `avatars/` since #10 (09-30). #12 (kosmos#4720) turned
`PUBLISH_PORTRAITS` off because no production Kosmos read `/api/catalogue/portrait` yet, so the served
catalogue names none (measured 15:58: 355 of 355 `avatar.image` null).

## The call
1. **Turn `PUBLISH_PORTRAITS` on.** Its own condition is met: production `0.7.50`
   (installkosmos.com/dist/latest.json) contains kosmos `4be38170c6` (the Team screen reading the
   portrait route, #4905), checked with `git merge-base --is-ancestor`. Publishing goes through the
   existing #4720 download path only (installkosmos.com/catalogue/avatars/), never the app bundle
   (Josh 16:01: "we are not going to embed those in the app since they are dead weight").
2. **Correct 9 members whose spec says man while Josh's portrait is a woman.** Found by checking all
   355 portraits against their `presentation` on labelled contact sheets. All 9 share one of two hair
   strings, which fits #10's note that presentation was inferred from hair and attire sets. Each
   becomes `presentation: woman` with a woman's name of the same heritage, unique in the catalogue:
   support-support Taehyun->Seoyeon, public-relations-researcher Kojo->Efua, public-relations-reviews
   Seamus->Siobhan, procurement-and-vendor-management-vendors Jiho->Jiyeon, cybersecurity-lead
   Caio->Luana, health-admin Bongani->Nomvula, event-planning-guest-experience-coordinator
   Ronan->Aoife, healthcare-administration-lead Ryota->Yuki, healthcare-administration-healthadmin-2
   Zhihao->Meilin. No case of the reverse (a woman spec, a man pictured) was found.

Rejected: generating new portraits for the 9 (Splinter's hold, no image-API spend); leaving those 9
with no portrait (fewer faces for a fictional name).

## Weakest premise
The 9 were found by one person reading 355 thumbnails; the first pass at a smaller size missed 5 of
them, the second (large colour-coded labels) found 9. A miss would be a portrait whose name and
presentation disagree, visible and cheap to fix in a follow-up.

## Gap, accepted
An install still on a build before 0.7.50 shows "portrait could not be set" rows for made team
members until it updates (the risk #4720 named). 0.7.50 is production.

## Measured
`node build.js --check` ok (355 members); `node --test test/` 112/112; a built `dist/` names 355 of
355 portraits, every sha256 matches its file, every path matches the board's `PORTRAIT_RE`, largest
36,974 bytes (cap 524,288). Control: the served catalogue names 0. `/catalogue/avatars/*` already
reaches GitHub Pages through the site rewrite (404 with GitHub headers until published).
