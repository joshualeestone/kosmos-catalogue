# Kosmos catalogue

The ready-made roles and prebuilt teams that [Kosmos](https://installkosmos.com) offers when you
create an agent or a team. One file per role and one per team, so every change to a job
description is a commit you can read.

Kosmos downloads the built catalogue only when someone opens the role picker or the Team screen.
Someone who only makes their own agents never downloads any of it.

## Layout

| Path | What it is |
|---|---|
| `roles/<key>/role.md` | One role: its job description and working rules |
| `teams/<key>.json` | One team: a lead and 4 or 5 people who report to the lead |
| `groups.json` | The groups the role picker shows, in order, and the roles in each |
| `settings.json` | Text every team shares |
| `avatars/<team>-<slot>.webp` | Team members' portraits (fictional, generated people) |

### A role

```markdown
---
name: Chief of Staff
summary: Runs your week, keeps your priorities straight, and leads your assistant team
first: Tell me your top three priorities this month and I will plan your week around them.
caution: It drafts and plans; it never sends or accepts anything outside Kosmos on its own.
---

What the role does, in one or two sentences.

## Who you are

Its character, in three to six sentences.

## How you work

- Exactly three working rules.
- One of them says what it will not do.
- Each on one line.
```

`caution` is optional. Give one only to a role whose main job acts outward for the person (sends,
posts, books, pays) or advises on money, tax, health, law or hiring, and state the same limit in
one of its rules. Every paragraph and rule stays on one line; the builder refuses a wrapped one.

A new role also needs its key added to a group in `groups.json`.

### A team

A team file names each member's role key, the title of their seat, a suggested first name
(unique across the whole catalogue), what they focus on in this team, and a portrait
description. `rank` orders teams within `business` or `personal`.

## Building and checking

Needs Node 26 or later. Nothing to install.

```sh
node build.js --check   # check everything, write nothing
node --test test/       # the catalogue's rules
node build.js           # write dist/catalogue.json and dist/catalogue.json.sha256
```

The builder refuses to write anything while a single problem remains: a duplicate key or first
name, a team without exactly one lead and 4 or 5 reports, a role whose rules are not three, an
em dash in any spelling, and more (see `build.js`).

## House rules for text

- Plain, everyday English. No em dashes.
- Every person is fictional. Personality comes from the job, never from age, gender or heritage.
- Nothing here names a real person, a real customer, or anyone's computer or account: this
  repository is public.

## Publishing

Every push to `main` runs `.github/workflows/publish.yml`: the tests, the build, then
`node sign.js`, which signs `dist/catalogue.json` with the key in the Actions secret
`CATALOGUE_SIGNING_KEY` and writes `catalogue.json.sig`. The result is deployed to GitHub Pages,
and installkosmos.com/catalogue/ passes through to it.

Kosmos downloads `catalogue.json` and its `.sig`, and uses the catalogue only when the signature
verifies against the public key it carries (the same key as `signing-key.pub.pem` here). A file
changed anywhere between this repo and the person's computer is refused, and Kosmos keeps using
its built-in roles.

`sign.js` refuses to publish when the secret does not match `signing-key.pub.pem`. Changing the
key needs a new pair, a new `signing-key.pub.pem`, and a Kosmos release carrying the new public key.
