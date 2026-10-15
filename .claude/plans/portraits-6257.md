# kosmos#6257: publish the prebuilt team portraits

**Branch:** `portraits-6257` · **Card:** kosmos#6257 (Josh 2026-10-15 15:57: "did we ever get all the default avatars in for the team of agents?")

## What was wrong
All 355 of Josh's portraits have been in `avatars/` since #10 (09-30). #12 (kosmos#4720) turned
`PUBLISH_PORTRAITS` off because no production Kosmos read `/api/catalogue/portrait` yet, so the served
catalogue names none (measured 15:58: 355 of 355 `avatar.image` null).

## The call
1. **Turn `PUBLISH_PORTRAITS` on.** Its own condition is a production Kosmos that reads the portrait
   route. Production is `0.7.50` (installkosmos.com/dist/latest.json). The commit that bumped the version
   to 0.7.50 (`be1e10d736`) has kosmos `4be38170c6` (the Team screen reading `/api/catalogue/portrait`, #4905)
   as an ancestor, measured with `git merge-base --is-ancestor`. The served artifact was then measured
   directly: `kosmos-0.7.50-arm64.tar.gz` downloaded, its sha256 equal to latest.json's, and its
   `app/server.js` has the `/api/catalogue/portrait` route, `app/web/index.html` reads it and
   `app/engine/catalogue.js` has `PORTRAIT_RE` (control: a made-up string counts 0). The reader is older
   than 0.7.50: review 1 measured it as an ancestor of the 0.7.17 version commit too. Publishing uses only the existing #4720 download path
   (installkosmos.com/catalogue/avatars/), never the app bundle (Josh 16:01: "we are not going to embed
   those in the app since they are dead weight").
2. **Correct 14 members whose spec says man while Josh's portrait shows a woman.** Each becomes
   `presentation: woman`, with a woman's name of the same heritage that is unique in the catalogue:
   - support-support Taehyun -> Seoyeon
   - public-relations-researcher Kojo -> Efua
   - public-relations-reviews Seamus -> Siobhan
   - procurement-and-vendor-management-vendors Jiho -> Jiyeon
   - cybersecurity-lead Caio -> Luana
   - health-admin Bongani -> Nomvula
   - event-planning-guest-experience-coordinator Ronan -> Aoife
   - healthcare-administration-lead Ryota -> Yuki
   - healthcare-administration-healthadmin-2 Zhihao -> Meilin
   - operations-ops Anan -> Ploy
   - fundraising-lead Rodel -> Maricel
   - logistics-transport-planner Kayode -> Funmilayo
   - moving-and-relocation-relocation-coordinator Saravanan -> Meenakshi
   - website-copy Errol -> Simone

   **How they were found.** The first 9 came from two passes over all 355 on contact sheets with
   labels. Blind review 1 found the last 5: it opened every man-spec member carrying one of the two hair
   strings the 9 share, at full size. All 14 are women with short hair. After that, every remaining
   man-spec portrait (164) and every woman-spec portrait (177) was checked again at 230 to 280 px. They
   all match their spec, so there is no case the other way round (a woman spec with a man pictured).

Rejected:
- Generating new portraits for the 14 (Splinter's hold, no image-API spend).
- Leaving those 14 with no portrait (fewer faces, for a fictional name).

Teams already made on a board keep their old names. Kosmos sets a portrait only when it makes a member,
so nobody gets a mismatch after the fact.

## Weakest premise
One reader judged 355 faces by eye. At thumbnail size that reader missed short-haired women twice. The
final pass was at full size, and a miss would be a portrait whose name and presentation disagree:
visible, and cheap to fix in a follow-up.

## Gap, accepted
A board too old to read `/api/catalogue/portrait` but new enough to download the catalogue shows a
"portrait could not be set" row for a made team member until it updates (the risk #4720 named).

## Measured
`node build.js --check` ok (355 members); `node --test test/` 112/112; a built `dist/` names 355 of
355 portraits, every sha256 matches its file, every path matches the board's `PORTRAIT_RE`, largest
36,974 bytes (cap 524,288). Control: the served catalogue names 0. `/catalogue/avatars/*` already
reaches GitHub Pages through the site rewrite (404 with GitHub headers until published).
