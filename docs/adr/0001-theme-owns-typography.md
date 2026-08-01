# The theme owns its typography; Ghost's font settings are not honoured

Ghost emits `--gh-font-heading` and `--gh-font-body` when a font is chosen in
Design & branding → Typography, and `screen.css` previously deferred to them.
That was harmless while every face in the theme was monospace, but the identity
work tunes the entire type scale — sizes, `letter-spacing`, `line-height`, and
the code-to-prose size ratio the preview suite asserts — against Space Grotesk's
specific metrics. Honouring the Ghost setting would let an admin toggle silently
invalidate that tuning and leave headings mis-sized and mis-tracked, so the
indirection is removed and the two `--shell-font-*` tokens are authoritative.

## Considered options

Keeping the override was rejected because the flexibility it preserves is for a
hypothetical third-party installer, while the cost lands on this site's actual
design. A middle option — owning the display face but still yielding on the text
face — was rejected as the worst of both: it looks accommodating while still
breaking the prose/code size ratio and vertical rhythm in exactly the case it
exists to serve.

## Consequences

There is no longer a no-code way to change the faces. The README gains a
"Changing the fonts" section covering the two tokens, the `@font-face` blocks,
the preload in `default.hbs`, and a warning that a substituted face requires
retuning the scale rather than just swapping the family name.
