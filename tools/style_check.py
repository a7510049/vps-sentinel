"""Check the deployed Cape HTML and its shared theme stylesheet."""
from pathlib import Path

CAPE = Path(__file__).resolve().parents[1] / "cape"


def main():
    for html, prefix, script in (("index.html", "./", "app.js"),
                                 ("album-guest.html", "/cape/", "album-guest.js")):
        source = (CAPE / html).read_text(encoding="utf-8")
        assert f'href="{prefix}styles.css"' in source, html
        assert f'type="module" src="{prefix}{script}"' in source, html
        assert (CAPE / script).is_file(), script
    styles = (CAPE / "styles.css").read_text(encoding="utf-8")
    for marker in ("--surface:", "--accent:", "[data-theme=dark]", "@media", "prefers-reduced-motion"):
        assert marker in styles, marker
    print("Cape stylesheet and entry points OK")


if __name__ == "__main__":
    main()
