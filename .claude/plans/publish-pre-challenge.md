---
pre_challenge: true
method: challenge-loop
branch: publish
diff_hash: 7918ded167dfdf890b5db61479603db2d990a2d2efce3ee52213b0a76db3ca56
validation: passed
subdir_audit: passed
timestamp: 2026-09-30T01:45:43Z
iterations: 21
converged: true
---

## [CHALLENGE-LOOP] Summary

**Iterations:** 21
**Converged:** Yes (iteration 21: no BLOCKER, WARNING or CONVENTION; NITs only)
**Scope:** the whole repository (the initial commit 5ca2c54 had no base to review against), with the branch diff (signing and publishing) in focus.
**Total actionable findings:** 0 BLOCKERs, 58 WARNINGs, 3 CONVENTIONs, plus NITs each round
**Fixed:** 56 | **Deferred:** 5 (listed below) | **Asked:** 0
**Reviewer models:** alternated every iteration (odd: default/opus, even: sonnet).
**Self-generated:** findings on lines the loop itself wrote were counted by judgement of the cited
line, not by a blame lookup, and are marked [SELF] below where the cited text was the loop's own.

### Per-iteration breakdown

#### Iteration 1 (opus)
- [WARNING] publish.yml: actions on moving tags in the job holding the key --> FIXED (pinned to SHAs) dee8e0c
- [WARNING] signing key a repo secret, readable by any branch workflow --> FIXED (environment secret, main only; new key pair) dee8e0c
- [WARNING] no freshness in signed bytes (replay) --> FIXED (serial) dee8e0c
- [WARNING] portraits unsigned; symlinked portrait followed --> FIXED (imageSha256, lstat) dee8e0c
- [WARNING] member role existence unchecked --> FIXED (kosmos-builtin-roles.json) dee8e0c
- [WARNING] sign.js main untested --> FIXED (run() + tests) dee8e0c
- [CONVENTION] README described unshipped Kosmos behaviour as fact --> FIXED dee8e0c

#### Iteration 2 (sonnet)
- [WARNING] future commit clock as serial --> FIXED (serialProblem) a8857b0
- [WARNING] keys/slots unvalidated before naming files (path traversal) --> FIXED a8857b0
- [WARNING] no branch protection / CODEOWNERS --> DEFERRED: merge access is the trust root, as for Kosmos; beta rule is merge without waiting
- [WARNING] fresh install replay --> FIXED (Kosmos MIN_SERIAL floor, documented) a8857b0
- [WARNING] vacuous portrait test --> FIXED a8857b0
- [WARNING] main() untested --> FIXED a8857b0

#### Iteration 3 (opus)
- [WARNING] hidden built-in keys (own, setup) missing --> FIXED 4f47e30
- [WARNING] serial could go backwards (slow clock, rollback) --> FIXED (max with published+1; ruleset) 4f47e30
- [WARNING] README present tense for unshipped checks [SELF] --> FIXED 4f47e30
- [WARNING] branch protection --> duplicate of iteration 2 (DEFERRED); no-force-push ruleset added

#### Iteration 4 (sonnet)
- [WARNING] stale CDN serial read, no timeout/retry --> FIXED 0880ab6
- [WARNING] 404 fails open --> FIXED (published-serial.js) 0880ab6
- [WARNING] file/sig cache skew --> FIXED (documented; Kosmos retries once) 0880ab6
- [WARNING] builtin list drift --> FIXED (kosmosRoles in output) 0880ab6
- [WARNING] team text checked only in tests --> FIXED 0880ab6
- [WARNING] avatars dir link, no size/format check --> FIXED 0880ab6
- [WARNING] no Dependabot --> FIXED 0880ab6

#### Iteration 5 (opus)
- [WARNING] re-run of old publish rolls back --> FIXED (tip-of-main check) d156812
- [WARNING] Kosmos-only checks lost (markers, names, groups) --> FIXED d156812
- [WARNING] symlinked role/team files --> FIXED d156812
- [WARNING] empty deployment count --> FIXED d156812

#### Iteration 6 (sonnet)
- [WARNING] invisible/bidi Unicode --> FIXED 7ad546c
- [WARNING] Dependabot bumps reach the key --> FIXED (README; later pinned by test) 7ad546c
- [WARNING] first-publish check rests on run history --> FIXED (committed marker) 7ad546c

#### Iteration 7 (opus)
- [WARNING] missing role name crashes build --> FIXED 6c3695e
- [WARNING] falsy team JSON dropped silently --> FIXED 6c3695e
- [WARNING] hidden-char list incomplete --> FIXED (allowlist) 6c3695e
- [CONVENTION] raw hidden characters in the test [SELF] --> FIXED (escapes) 6c3695e
- [CONVENTION] em dash comment claim [SELF] --> FIXED 6c3695e

#### Iteration 8 (sonnet)
- [WARNING] review requirement on key path --> duplicate of iteration 2 (DEFERRED)
- [WARNING] marker is a manual step --> FIXED (enforced loudly) f0e60ed
- [WARNING] stale serial between quick publishes --> FIXED (wait for Pages) f0e60ed
- [WARNING] CRLF misleading message --> FIXED (.gitattributes) f0e60ed
- [WARNING] top-level links unchecked --> FIXED f0e60ed

#### Iteration 9 (opus)
- [WARNING] other scripts' letters pass --> FIXED 95b7951, c46a7a5

#### Iteration 10 (sonnet)
- [WARNING] confirm loop aborts on one network error [SELF] --> FIXED 4b2d4e2
- [WARNING] compatibility lookalikes --> FIXED (NFKC) 4b2d4e2

#### Iteration 11 (opus)
- [WARNING] tests' git calls inherit GIT_DIR/GIT_INDEX_FILE (could commit to the real branch) --> FIXED 138eeed
- [WARNING] pins never run in CI --> FIXED (SHAs verified against upstream tags; CI on PR) 138eeed
- [WARNING] commits only on this disk --> FIXED (pushed)
- [WARNING] first-publish counts green runs, not deployments --> FIXED 138eeed

#### Iteration 12 (sonnet)
- [WARNING] failed deployments API call swallowed [SELF] --> FIXED 8c699d6

#### Iteration 13 (opus)
- [WARNING] composite upload-pages-artifact calls a tag-pinned action in the key's job --> FIXED (build/sign/deploy split; catalogue-signing environment; new key) d155ca8
- [WARNING] deployment status comment wrong [SELF] --> FIXED d155ca8

#### Iteration 14 (sonnet)
- [WARNING] no content check (URLs, HTML, commands) --> FIXED 5cbf190
- [WARNING] sign.js signs any bytes --> FIXED 5cbf190
- [WARNING] deploy trusts the artifact --> FIXED 5cbf190

#### Iteration 15 (opus)
- [WARNING] re-running deploy job alone --> FIXED (tip check in every job) 3dd89f4
- [WARNING] build job chooses what is signed --> FIXED (sign job rebuilds and compares) 3dd89f4
- [WARNING] outward denylist gaps (PowerShell, bare domains) --> FIXED 3dd89f4
- [WARNING] Dependabot bumps unread --> FIXED (sign-job SHAs pinned in a test) 3dd89f4

#### Iteration 16 (sonnet)
- [WARNING] deploy gate untested inline YAML [SELF] --> FIXED (check-deploy.js + tests) f89e12d
- [WARNING] sign job node version unchecked --> FIXED f89e12d

#### Iteration 17 (opus)
- [WARNING] confirm poll could mark a real deploy failed [SELF] --> FIXED (confirm job) 39d5078

#### Iteration 18 (sonnet)
- [WARNING] pipefail not in effect --> FIXED (shell: bash) cb72cf4
- [WARNING] serial read not retried on 5xx --> FIXED cb72cf4
- [WARNING] deployments list not paginated --> FIXED cb72cf4
- [WARNING] ideographic stop / slash lookalikes --> FIXED cb72cf4

#### Iteration 19 (opus)
- [WARNING] rebuild test missed the previous+1 path [SELF] --> FIXED 85b8e27
- [WARNING] "chooses nothing" overclaim [SELF] --> FIXED 85b8e27

#### Iteration 20 (sonnet)
- [WARNING] Common-script RTL punctuation passes --> FIXED (explicit code-point allowlist) 14d2955
- [WARNING] sign job run steps untested --> FIXED 14d2955
- [WARNING] sign job node Unicode data --> FIXED (allowlist has no property data; version logged) 14d2955
- [WARNING] name-rule drift --> FIXED (source named; Kosmos memberProblem still checks) 14d2955

#### Iteration 21 (opus)
**New findings:** 0 BLOCKERs, 0 WARNINGs, 0 CONVENTIONs, 6 NITs
**Converged.**

### Deferred (with reasoning)
- Required review / CODEOWNERS on main (iterations 2, 3, 8): merge access to main is the trust root, as it is for Kosmos itself, whose code reaches every install the same way; the beta rule is that ready PRs merge without waiting on a reviewer. A no-force-push, no-deletion ruleset is on main.
- Plan file in the public repo (iterations 7, 16): the org gate needs plan and proof files in .claude/plans/; nothing in them is secret.

### Outstanding questions (ASKED)
None.

### NITs (non-blocking; from the converging iteration, left for a follow-up)
- [NIT] test title says "four known steps" for three run steps (iteration 21)
- [NIT] NFKC comment understates it: it refuses U+0132/0133, U+013F/0140, U+0149, U+017F inside the allowed range (iteration 21)
- [NIT] U+0130/U+0131 (dotted/dotless I) can spell "ıex" past the tripwire; drop them from the range (iteration 21)
- [NIT] the top-level "not a link" message also fires for a wrong entry kind (iteration 21)
- [NIT] engines ">=26" while the sign job rebuilds on node 20+ (iteration 21)
- [NIT] two long lines in build.js and publish.yml (iteration 21)

### Strengths
- The signing key is readable in one step of one job, in a main-only environment, beside three plain node actions pinned by commit; that job signs only its own byte-identical rebuild.
- Every stage re-checks the previous one: sign.js verifies against the committed key before writing; check-deploy.js re-verifies and publishes exactly the expected files; every job re-checks the tip of main.
- Text becomes agent instructions, so the builder refuses anything outside an explicit character allowlist, NFKC changes, template markers, HTML comments, web addresses and commands.
- The port is lossless against Kosmos main (deep-equal, with a control), and the checks Kosmos's own tests used to run moved here with it. 63 tests, each refusal with a passing control.
