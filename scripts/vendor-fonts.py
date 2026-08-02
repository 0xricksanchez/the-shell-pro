#!/usr/bin/env python3
"""
Vendor the Monaspace webfonts the theme ships.

Monaspace is a superfamily: five monospaces on shared metrics, meant to be
mixed. The theme uses three of them as its three type roles —

    Krypton  scanned   headings, eyebrows, chrome labels
    Xenon    read      body prose (slab serif, easiest of the five at length)
    Neon     parsed    code, line numbers, data

As published each family is 445-584 KB, because it carries full Unicode
coverage and three variation axes. Subsetting to Latin and pinning the width
and slant axes — the theme uses neither — brings each under 40 KB while
keeping the whole weight axis.

This is NOT a build step. It is run by hand when the fonts need changing; the
resulting .woff2 files are committed and that is what ships.

    python3 scripts/vendor-fonts.py

Requires fonttools with brotli. A plain `uv tool install fonttools` has no
brotli and no importable fontTools for the system interpreter, so woff2 output
fails both ways. Run it in a throwaway environment instead, which needs nothing
installed and leaves nothing behind:

    uv run --with 'fonttools[woff]' --with brotli python3 scripts/vendor-fonts.py
"""
import io
import os
import sys
import zipfile
import urllib.request

RELEASE = "v1.400"
BUNDLE = f"https://github.com/githubnext/monaspace/releases/download/{RELEASE}/monaspace-webfont-variable-{RELEASE}.zip"
LICENCE = "https://raw.githubusercontent.com/githubnext/monaspace/main/LICENSE"
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "fonts")

# The theme's own role names, so the filenames say what they are for.
FAMILIES = {"Krypton": "mona-krypton", "Xenon": "mona-xenon", "Neon": "mona-neon"}

# Google's "latin" slice, matched so behaviour is identical to the previous
# vendored faces. An audit of all 21 posts found no Greek and no Latin Extended
# in prose; five maths operators fall back to a system face by design.
LATIN = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,"
    "U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,"
    "U+2212,U+2215,U+FEFF,U+FFFD"
)

# The arrows the chrome draws. Google's latin slice carries U+2191/U+2193 but
# not these three, so before they were added the theme's <- -> and diagonal
# marks fell through to a system symbol font. That is not merely a different
# shape: Apple Symbols sets an arrow's ink 1.5px above the baseline at 10.24px
# where the Krypton label beside it has a 3.74px cap centre, so every arrow sat
# ~0.22em low and, being proportional, a different width from the mono grid.
# Carrying them in the superfamily makes alignment and advance correct by
# construction on every platform.
ARROWS = "U+2190,U+2192,U+2197"

try:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    from fontTools.subset import main as subset_main
    import brotli  # noqa: F401  - required for woff2 output
except ImportError as exc:
    sys.exit(f"missing dependency: {exc}\ninstall with: pip install 'fonttools[woff]' brotli")


def main():
    os.makedirs(OUT, exist_ok=True)
    print(f"fetching {BUNDLE.rsplit('/', 1)[-1]} ...")
    blob = urllib.request.urlopen(BUNDLE, timeout=120).read()
    archive = zipfile.ZipFile(io.BytesIO(blob))

    total = 0
    for family, stem in FAMILIES.items():
        member = next(
            (n for n in archive.namelist()
             if family in n and n.endswith("Var.woff2")), None)
        if not member:
            sys.exit(f"{family}: not found in the bundle")

        raw = os.path.join(OUT, f".{stem}.src.woff2")
        with open(raw, "wb") as handle:
            handle.write(archive.read(member))
        shipped = os.path.getsize(raw)

        trimmed = os.path.join(OUT, f".{stem}.trim.ttf")
        argv = sys.argv
        sys.argv = ["pyftsubset", raw, f"--unicodes={LATIN},{ARROWS}", f"--output-file={trimmed}"]
        try:
            subset_main()
        finally:
            sys.argv = argv

        font = TTFont(trimmed)
        # The theme never varies width or slant; pinning them drops the axis
        # deltas, which is where most of the remaining weight lives.
        instancer.instantiateVariableFont(font, {"wdth": 100, "slnt": 0}, inplace=True)
        font.flavor = "woff2"
        final = os.path.join(OUT, f"{stem}.woff2")
        font.save(final)

        os.remove(raw)
        os.remove(trimmed)
        size = os.path.getsize(final)
        total += size
        print(f"  {family:<9} {shipped:>8,} B  ->  {size:>7,} B   {stem}.woff2")

    licence = os.path.join(OUT, "OFL-monaspace.txt")
    with open(licence, "wb") as handle:
        handle.write(urllib.request.urlopen(LICENCE, timeout=60).read())
    print(f"  licence   {os.path.getsize(licence):>8,} B      OFL-monaspace.txt")
    print(f"\n  total shipped weight: {total:,} B ({total / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
