"""Fetch senator headshot photos from bioguide.congress.gov.

For every unique `bioguide_id` that appears as a Senate member in
HSall_members.csv for congresses 115..119, download the canonical
JPEG photo into ``assets/photos/<bioguide_id>.jpg``.

URL pattern (verified 2026-04-25):
    https://bioguide.congress.gov/photo/<FIRST_LETTER>/<BIOGUIDE_ID>.jpg

Politeness:
    - ~5 req/s (sleep 0.2s between requests)
    - Stops if 5+ consecutive errors occur
    - Custom User-Agent: "congress-story-viz/0.1 (educational)"

Resize (optional):
    If Pillow is available, downloaded JPEGs are resized in-place so the
    longest side is at most 200 px. If Pillow import fails, originals
    are kept.

Idempotent:
    Files that already exist on disk are skipped.

Manifest:
    Successfully-available bioguide IDs (newly downloaded OR pre-existing
    on disk) are written to ``assets/photos/manifest.json`` as a sorted
    JSON array.

Re-run safe.
"""

from __future__ import annotations

import csv
import json
import sys
import time
import urllib.error
import urllib.request
from io import BytesIO
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "raw" / "HSall_members.csv"
PHOTOS_DIR = ROOT / "assets" / "photos"
MANIFEST_PATH = PHOTOS_DIR / "manifest.json"

CONGRESS_RANGE = {115, 116, 117, 118, 119}
CHAMBER = "Senate"

URL_TEMPLATE = "https://bioguide.congress.gov/photo/{letter}/{bid}.jpg"
USER_AGENT = "congress-story-viz/0.1 (educational)"
SLEEP_SECONDS = 0.2
MAX_CONSECUTIVE_ERRORS = 5
MAX_LONG_SIDE_PX = 200
REQUEST_TIMEOUT = 20  # seconds


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_senate_bioguide_ids() -> list[str]:
    """Return sorted unique bioguide IDs of Senate members in CONGRESS_RANGE."""
    ids: set[str] = set()
    with CSV_PATH.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            try:
                congress = int(row["congress"])
            except (TypeError, ValueError):
                continue
            if congress not in CONGRESS_RANGE:
                continue
            if row.get("chamber", "").strip() != CHAMBER:
                continue
            bid = (row.get("bioguide_id") or "").strip()
            if not bid:
                continue
            ids.add(bid)
    return sorted(ids)


def maybe_load_pillow():
    try:
        from PIL import Image  # noqa: WPS433
        return Image
    except Exception as exc:  # pragma: no cover - environment-specific
        print(f"  [warn] Pillow not available ({exc!r}); skipping resize.")
        return None


def resize_in_place(path: Path, image_module) -> None:
    """Resize the JPEG at *path* so the longest side is <= MAX_LONG_SIDE_PX."""
    try:
        with image_module.open(path) as im:
            im.load()
            w, h = im.size
            longest = max(w, h)
            if longest <= MAX_LONG_SIDE_PX:
                return
            scale = MAX_LONG_SIDE_PX / longest
            new_size = (max(1, int(round(w * scale))), max(1, int(round(h * scale))))
            resized = im.convert("RGB").resize(new_size, image_module.LANCZOS)
            resized.save(path, "JPEG", quality=82, optimize=True)
    except Exception as exc:
        print(f"  [warn] resize failed for {path.name}: {exc!r}")


def fetch(bid: str) -> tuple[bool, int | None, bytes | None]:
    """Download the JPEG for *bid*. Returns (ok, status_code, bytes)."""
    url = URL_TEMPLATE.format(letter=bid[0].upper(), bid=bid)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            data = resp.read()
            return True, resp.status, data
    except urllib.error.HTTPError as exc:
        return False, exc.code, None
    except Exception:
        return False, None, None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)

    bioguide_ids = load_senate_bioguide_ids()
    print(f"Senate bioguide IDs (congresses {sorted(CONGRESS_RANGE)}): {len(bioguide_ids)}")

    image_module = maybe_load_pillow()
    do_resize = image_module is not None

    available: set[str] = set()
    attempted = 0
    succeeded = 0
    skipped_existing = 0
    failures: list[tuple[str, int | None]] = []
    consecutive_errors = 0
    aborted = False

    for i, bid in enumerate(bioguide_ids, start=1):
        out_path = PHOTOS_DIR / f"{bid}.jpg"
        if out_path.exists() and out_path.stat().st_size > 0:
            available.add(bid)
            skipped_existing += 1
            continue

        attempted += 1
        ok, status, data = fetch(bid)
        if ok and data:
            out_path.write_bytes(data)
            if do_resize:
                resize_in_place(out_path, image_module)
            available.add(bid)
            succeeded += 1
            consecutive_errors = 0
            if succeeded % 25 == 0:
                print(f"  [{i}/{len(bioguide_ids)}] downloaded {succeeded}, failed {len(failures)}")
        else:
            failures.append((bid, status))
            consecutive_errors += 1
            if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                print(
                    f"  [abort] {consecutive_errors} consecutive errors; stopping early "
                    f"after {i} of {len(bioguide_ids)} IDs."
                )
                aborted = True
                break

        time.sleep(SLEEP_SECONDS)

    manifest = sorted(available)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print()
    print("==================== Summary ====================")
    print(f"Unique Senate bioguide IDs (115..119): {len(bioguide_ids)}")
    print(f"Skipped (already on disk):             {skipped_existing}")
    print(f"Attempted downloads:                   {attempted}")
    print(f"Successful downloads:                  {succeeded}")
    print(f"Failed downloads:                      {len(failures)}")
    print(f"Total available on disk:               {len(manifest)}")
    print(f"Resize applied:                        {do_resize}")
    print(f"Aborted early:                         {aborted}")
    if failures:
        sample = failures[:8]
        print("Sample failures (bioguide_id, http_status):")
        for bid, st in sample:
            print(f"  {bid}  status={st}")
    print(f"Manifest written: {MANIFEST_PATH}")
    print("=================================================")
    return 0


if __name__ == "__main__":
    sys.exit(main())
