"""Build an importable ``.apkg`` for the Quizify image-occlusion template.

The template itself is plain HTML/CSS that Anki renders on every client, so the
package only needs to carry:

* the ``Image Occlusion (Quizify)`` note type with its two card templates,
* ``style.css`` as the note type styling,
* the sample diagrams and a demo deck that exercises them.

The sample coordinates are produced by ``tools/make_demo_images.py`` from the
same layout constants that draw the artwork, so masks always line up.

Requirements::

    python -m pip install "anki==25.9.5"    # needs Python 3.10+
    python tools/build_apkg.py --out dist/image-occlusion-quizify.apkg
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEDIA_DIR = ROOT / "media"
DEFAULT_OUTPUT = ROOT / "dist" / "image-occlusion-quizify.apkg"

NOTE_TYPE_NAME = "Image Occlusion (Quizify)"
FIELD_ORDER = ("Question", "Image", "Opinions", "Answer", "Note")
DECK_NAME = "图片遮挡 · Quizify"
DECK_DESCRIPTION = (
    "Quizify 图片遮挡示例牌组（开务主题 + 绿色遮罩）：正面点击绿色遮罩逐块揭示，"
    "右下角可缩放、平移；使用说明见模板说明。"
)

# --- Sample notes -------------------------------------------------------------
# The diagram layout (and therefore the mask coordinates) lives in exactly one
# place: tools/make_demo_images.py. It writes media/manifest.json, which this
# builder consumes so a regenerated picture can never leave a stale mask behind.
# name -> (question, answer, note)
SAMPLE_NOTES: dict[str, tuple[str, str, str]] = {
    "demo1": (
        "网络协议栈自上而下有哪些层？",
        "应用层（HTTP / DNS）、传输层（TCP / UDP）、网络层（IP / ICMP）。",
        "记忆口诀：应用传网链，逐层封装。",
    ),
    "demo2": (
        "计算机由哪些主要部件组成？",
        "运算器、控制器、存储器、输入设备、输出设备，由总线连接。",
        "运算器 + 控制器 = CPU；存储器分主存与辅存。",
    ),
}


def sample_manifest() -> dict:
    manifest = MEDIA_DIR / "manifest.json"
    if not manifest.is_file():
        raise FileNotFoundError(
            "media/manifest.json is missing; run tools/make_demo_images.py first"
        )
    return json.loads(manifest.read_text(encoding="utf-8"))


def samples() -> list[tuple[str, str, str, str, str]]:
    """Join the generated coordinates with the hand-written prompt text."""
    manifest = sample_manifest()
    rows = []
    for name, (question, answer, note) in SAMPLE_NOTES.items():
        entry = manifest.get(name)
        if not entry:
            raise KeyError(f"media/manifest.json has no entry for {name!r}")
        rows.append((entry["image"], entry["coordinates"], question, answer, note))
    return rows


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def build_collection(col, with_samples: bool) -> None:
    models = col.models
    model = models.new(NOTE_TYPE_NAME)

    # Every field stays in Anki's visual (rich text) editor. A plain-text field
    # opens in the HTML *source* editor instead, where pasting a picture inserts
    # nothing usable -- the ``Image`` field looks like it refuses images even
    # though the note type is fine. Stock note types leave this flag alone too.
    for field_name in FIELD_ORDER:
        field = models.new_field(field_name)
        field["plainText"] = False
        models.add_field(model, field)

    template = models.new_template("Quizify 遮挡")
    template["qfmt"] = read("front.html")
    template["afmt"] = read("back.html")
    models.add_template(model, template)

    model["css"] = read("style.css")
    models.add(model)

    if not with_samples:
        return

    deck_id = col.decks.id(DECK_NAME)
    deck = col.decks.get(deck_id)
    if deck is not None:
        deck["desc"] = DECK_DESCRIPTION
        col.decks.save(deck)

    note_type = models.by_name(NOTE_TYPE_NAME)
    for image, coordinates, question, answer, note in samples():
        note_obj = col.new_note(note_type)
        note_obj["Question"] = question
        note_obj["Image"] = f'<img src="{image}">'
        note_obj["Opinions"] = coordinates
        note_obj["Answer"] = answer
        note_obj["Note"] = note
        col.add_note(note_obj, deck_id)


def verify_package(apkg: Path, expected_notes: int, assets: list[Path]) -> None:
    """Import the finished package the way Anki does and fail loudly on mismatch.

    Exporters can silently write a package whose inner collection is empty, and
    the user only finds out after a confusing "I imported it but nothing shows
    up" round trip. Importing into a throwaway collection also keeps the check
    independent of the on-disk package layout, which differs between Anki
    versions (``collection.anki21`` vs the newer compressed ``anki21b``).
    """
    import os

    from anki.collection import Collection
    from anki import import_export_pb2

    workdir = Path(tempfile.mkdtemp(prefix="quizify-verify-"))
    try:
        probe = Collection(str(workdir / "collection.anki2"))
        try:
            probe.import_anki_package(
                import_export_pb2.ImportAnkiPackageRequest(package_path=str(apkg))
            )
            notes = probe.db.scalar("select count(*) from notes")
            landed = set(os.listdir(probe.media.dir()))
            notetype = probe.models.by_name(NOTE_TYPE_NAME)
            if notetype is None:
                raise RuntimeError(f"package has no note type {NOTE_TYPE_NAME!r}")
            fields = {field["name"]: field for field in notetype["flds"]}
            missing_fields = [name for name in FIELD_ORDER if name not in fields]
            if missing_fields:
                raise RuntimeError("package is missing fields: " + ", ".join(missing_fields))
            # A plain-text field opens in the HTML source editor and silently
            # swallows pasted/dragged pictures -- the exact bug this guard
            # exists to catch.
            plain = [name for name in FIELD_ORDER if fields[name]["plainText"]]
            if plain:
                raise RuntimeError(
                    "fields are plain text, so image pasting breaks: "
                    + ", ".join(plain)
                )
        finally:
            probe.close()

        if notes != expected_notes:
            raise RuntimeError(
                f"package imports {notes} notes, expected {expected_notes}"
            )
        missing = sorted({path.name for path in assets} - landed)
        if missing:
            raise RuntimeError(
                "package media did not import: " + ", ".join(missing)
            )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def sample_media() -> list[Path]:
    return sorted(
        path
        for path in MEDIA_DIR.glob("*.png")
        if path.is_file() and not path.name.startswith(".")
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--no-samples", action="store_true")
    args = parser.parse_args(argv)

    try:
        from anki.collection import Collection
        from anki import import_export_pb2
        from anki.generic_pb2 import Empty
    except ImportError:
        print(
            "error: the 'anki' package is required.\n"
            '       install it with: python -m pip install "anki==25.9.5"',
            file=sys.stderr,
        )
        return 2

    output = args.out.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    assets = sample_media()
    if not assets:
        print("error: no sample images in media/", file=sys.stderr)
        return 2

    workdir = Path(tempfile.mkdtemp(prefix="quizify-occlusion-"))
    try:
        col = Collection(str(workdir / "collection.anki2"))
        try:
            build_collection(col, with_samples=not args.no_samples)
            for path in assets:
                col.media.add_file(str(path))
            # `legacy=True` keeps the classic `collection.anki21` layout so
            # AnkiDroid/AnkiMobile can read the package, while still going
            # through the deterministic Rust exporter. The old
            # `AnkiPackageExporter` intermittently wrote an empty inner
            # collection here (observed ~60% of runs), which imports as
            # "nothing happened" -- hence the verify_package() guard below.
            col.export_anki_package(
                out_path=str(output),
                options=import_export_pb2.ExportAnkiPackageOptions(
                    with_scheduling=False,
                    with_deck_configs=False,
                    with_media=True,
                    legacy=True,
                ),
                limit=import_export_pb2.ExportLimit(whole_collection=Empty()),
            )
        finally:
            col.close()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    verify_package(
        output,
        expected_notes=0 if args.no_samples else len(samples()),
        assets=assets,
    )

    print("fields: visual editor (pasting images into Image works)")
    print(f"media embedded: {len(assets)}")
    if not args.no_samples:
        print(f"sample notes: {len(samples())}")
    print(f"wrote {output} ({output.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
