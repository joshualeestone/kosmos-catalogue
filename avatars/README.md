# Portraits

One portrait per team member, named `<team key>-<slot>.webp` (the member's `avatar.id`), for
example `marketing-lead.webp`. The build sets `avatar.image` to the file's path when it is here and
to `null` when it is not, and the tests fail when a named portrait is missing.

Every portrait is of a fictional, generated person, made from the member's `avatar.prompt`.
