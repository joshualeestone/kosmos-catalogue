# Portraits

One portrait per team member, named `<team key>-<slot>.webp` (the member's `avatar.id`), for
example `marketing-lead.webp`. The build sets `avatar.image` to the file's path and
`avatar.imageSha256` to its hash when it is here, and both to `null` when it is not. A portrait must
be a regular file; the build refuses a link.

Every portrait is of a fictional, generated person, made from the member's `avatar.prompt`.
