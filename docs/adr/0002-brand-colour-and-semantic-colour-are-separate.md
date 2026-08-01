# Brand colour and semantic colour are separate families

Research blocks encode what kind of claim they make through colour — hypothesis,
method, finding, limitation/safety — and "method" was wired to
`var(--shell-accent)`, which the author sets in Ghost's Design & branding. That
makes an information encoding depend on a branding choice: the site currently
runs a red-pink accent against a light-purple "finding" tone, so those two blocks
are already harder to tell apart than intended, and a purple accent would
collapse them completely. The palette is therefore split into three families —
brand (author-settable), semantic (theme-owned, fixed), and structural — and
"method" gets its own designed hue instead of borrowing the accent.

## Consequences

A research block no longer picks up the site's accent, so it loses a little
visual connection to the branding. That is the price of an encoding that survives
a branding change.

The theme is tuned against a curated set of four supported accents rather than an
arbitrary colour space, with the curation enforced by a contrast assertion in the
preview suite rather than by restricting Ghost's colour picker. Off-list accents
still render — they are simply untested and may look poor, which is an accepted
trade-off rather than a defect.
