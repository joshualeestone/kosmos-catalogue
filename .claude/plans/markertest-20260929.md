# markertest: a test that assumed the published marker was absent

The first publish after committing the `published` marker (16ff593) failed in the build job:
`published-serial refuses a deployment count that is empty or not a number` used a 404 as its
control, and a 404 is "nothing published yet" only while the marker is absent. Committing the marker
(the documented bootstrap step) made the control refuse, as the code intends. It failed closed:
nothing was signed or deployed, and the catalogue from b2b4b36 stayed live.

## Fix
The test now uses a 200 answer with a real file, so it checks the deployment-count parsing alone and
gives the same result with or without the marker. The marker behaviour itself is covered by the
tests that pass an explicit marker path to publishedSerial().

Measured: the whole suite passes in a checkout that holds the marker (the CI condition) and in one
without it.

## Review iteration 1
- A test pins published-serial's default marker path (the one main() and the workflow use) to the
  repo root, since every other marker test passes its own path.

## Review iterations 2 and 3
- The refusal test checks the reason ("is not a count") for five malformed counts, and that the
  accepted count prints the published serial.
- A test runs a copy of published-serial.js in its own folder, without and then with a marker beside
  it, so main()'s use of the default marker is covered without depending on this checkout.
- The comment on the path pin says it checks the path on purpose, not the file.

## Review iterations 4 and 5
- The main() marker test checks why it refuses (the missing catalogue) and what it prints without
  the marker (0); the workflow check is anchored to the serial step's own run block.
- Deferred: the `<branch> -- ...` commit subjects are the format the challenge-loop skill prescribes
  (two hyphens, not an em dash); the squash-merge subject is a plain sentence.
