#!/usr/bin/env python3
"""Amazon Music playlist uploader — Playwright browser automation.

Creates the Crystal Springs Golf Trip playlists in Amazon Music and adds
every song from output/playlists.json, using YOUR logged-in browser session.

Why browser automation: Amazon Music's official Web API is a restricted,
approval-only developer program (no self-serve keys for personal playlist
automation), so driving the real web player with your own login is the most
reliable ToS-respecting option. See automation/README.md for the full
method comparison.

How authentication works (nothing is ever stored by this script):
  1. The script opens a real Chromium window on music.amazon.com.
  2. YOU log in manually (password / passkey / 2FA — whatever you use).
  3. Press ENTER in the terminal, and the script takes it from there.
  4. The browser profile is kept in ~/.amazon-music-uploader so future
     runs are already logged in.

Usage:
  pip install -r requirements.txt
  playwright install chromium          # once
  python amazon_music_uploader.py                       # everything
  python amazon_music_uploader.py --playlists "Minerals,Trip Anthem"
  python amazon_music_uploader.py --dry-run             # no clicks, just plan
  python amazon_music_uploader.py --delay 3             # slower pacing

The run is RESUMABLE: progress is checkpointed to amazon_progress.json
after every song, so you can Ctrl-C and re-run any time. Results land in
amazon_music_report.csv (added / not found / error per track), and songs
that can't be found get replacement suggestions printed at the end.

NOTE: Amazon updates their web player periodically. If a step stops
matching, adjust the strings in SELECTORS below — every DOM lookup the
script does goes through that one dict.
"""

import argparse
import csv
import json
import random
import re
import sys
import time
import unicodedata
from pathlib import Path

try:
    from playwright.sync_api import TimeoutError as PWTimeout
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("Playwright not installed. Run: pip install -r requirements.txt "
             "&& playwright install chromium")

HERE = Path(__file__).resolve().parent
PLAYLISTS_JSON = HERE.parent / "output" / "playlists.json"
PROGRESS_FILE = HERE / "amazon_progress.json"
REPORT_FILE = HERE / "amazon_music_report.csv"
PROFILE_DIR = Path.home() / ".amazon-music-uploader"

AMAZON_MUSIC_URL = "https://music.amazon.com"

# Every DOM lookup goes through here — tweak these if Amazon changes the UI.
SELECTORS = {
    "signed_in_probe": "music-button[icon-name='library'], [aria-label*='Library'], a[href*='/my/library']",
    "search_input": "music-search-bar input, input[type='search'], input[placeholder*='Search']",
    "track_row": "music-horizontal-item",
    "row_title": "[slot='title'], .primary-text, a[title]",
    "row_context_button": "music-button[icon-name='more'], [aria-label*='More'], [aria-label*='Options']",
    "menu_option": "music-context-menu-option, [role='menuitem']",
    "add_to_playlist_text": re.compile("add to playlist", re.I),
    "new_playlist_text": re.compile("(create )?new playlist", re.I),
    "playlist_name_input": "music-text-input input, input[placeholder*='playlist' i], input[placeholder*='name' i]",
    "confirm_button_text": re.compile("^(save|create|done|ok)$", re.I),
    "filter_songs_tab": re.compile("^(songs|tracks)$", re.I),
}

# Tracks most likely to be missing/ambiguous on Amazon Music, with a
# ready-to-use replacement of equivalent vibe.
SUGGESTED_REPLACEMENTS = {
    ("o.a.r.", "that was a crazy game of poker"):
        "O.A.R. — 'That Was a Crazy Game of Poker' (Live) from 'Any Time Now', or 'Hey Girl (Live)'",
    ("sublime", "doin' time"):
        "Sublime — 'Doin' Time (Uptown Dub)' or 'Garden Grove'",
    ("2pac", "hit 'em up"):
        "2Pac — 'Ambitionz Az a Ridah' (if not already used) or 'Picture Me Rollin''",
    ("ma$e", "feel so good"):
        "Search 'Mase Feel So Good' (no $); fallback: Puff Daddy — 'Can't Nobody Hold Me Down'",
    ("d12", "my band"):
        "D12 — 'Purple Pills' (explicit) or Eminem — 'Just Lose It'",
    ("petey pablo", "raise up"):
        "Petey Pablo — 'Freek-a-Leek' or Lil Jon — 'Snap Yo Fingers'",
    ("afroman", "because i got high"):
        "Afroman — 'Crazy Rap (Colt 45 & 2 Zig Zags)'",
    ("david allan coe", "you never even called me by my name"):
        "Toby Keith — 'Get Drunk and Be Somebody'",
    ("bob marley & the wailers", "three little birds"):
        "Bob Marley — any 'Legend' compilation version",
    ("koe wetzel", "creeps"):
        "Koe Wetzel — 'Sundy or Mundy' or 'Cold & Alone'",
}


# ------------------------------------------------------------------ utils
def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.casefold()
    s = re.sub(r"\(.*?\)|\[.*?\]", " ", s)
    s = re.sub(r"feat\..*| featuring .*", " ", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def pause(base: float):
    """Human-ish pacing so we don't hammer Amazon's UI."""
    time.sleep(base + random.uniform(0.4, 1.2))


def load_progress() -> dict:
    if PROGRESS_FILE.exists():
        return json.loads(PROGRESS_FILE.read_text())
    return {"created_playlists": [], "done": {}}  # done: {"playlist||artist||title": status}


def save_progress(progress: dict):
    PROGRESS_FILE.write_text(json.dumps(progress, indent=2))


def song_key(playlist: str, artist: str, title: str) -> str:
    return f"{playlist}||{artist}||{title}"


# ------------------------------------------------------------ browser ops
def wait_for_login(page):
    print("\n" + "=" * 62)
    print("  LOG INTO AMAZON MUSIC")
    print("  A browser window is open at music.amazon.com.")
    print("  Sign in with your Amazon account (2FA is fine).")
    print("  When you can see your library, come back here.")
    print("=" * 62)
    input("\nPress ENTER once you are logged in... ")
    try:
        page.wait_for_selector(SELECTORS["signed_in_probe"], timeout=15000)
        print("Login detected — session will be reused on future runs.\n")
    except PWTimeout:
        print("Couldn't positively confirm login, continuing anyway "
              "(if things fail immediately, re-run and log in first).\n")


def click_menu_option(page, pattern) -> bool:
    """Click a context-menu / dialog option whose text matches pattern."""
    for opt in page.locator(SELECTORS["menu_option"]).all():
        try:
            text = opt.inner_text(timeout=1000).strip()
        except Exception:
            continue
        if pattern.search(text):
            opt.click()
            return True
    # Fallback: any element with matching text.
    loc = page.get_by_text(pattern).first
    try:
        loc.click(timeout=3000)
        return True
    except Exception:
        return False


def create_playlist(page, name: str, delay: float) -> bool:
    """Create an empty playlist via Library → Playlists → Create."""
    page.goto(f"{AMAZON_MUSIC_URL}/my/playlists", wait_until="domcontentloaded")
    pause(delay)
    # Already exists?
    try:
        if page.get_by_text(name, exact=True).count() > 0:
            print(f"  playlist '{name}' already exists — reusing it")
            return True
    except Exception:
        pass
    if not click_menu_option(page, SELECTORS["new_playlist_text"]):
        print(f"  !! could not find 'Create New Playlist' control for '{name}'")
        return False
    pause(delay / 2)
    try:
        box = page.locator(SELECTORS["playlist_name_input"]).first
        box.fill(name)
        pause(delay / 2)
        if not click_menu_option(page, SELECTORS["confirm_button_text"]):
            box.press("Enter")
        pause(delay)
        print(f"  created playlist '{name}'")
        return True
    except Exception as e:
        print(f"  !! failed creating '{name}': {e}")
        return False


def best_track_row(page, artist: str, title: str):
    """Pick the search-result row that best matches artist + title."""
    rows = page.locator(SELECTORS["track_row"]).all()[:12]
    want_title, want_artist = norm(title), norm(artist)
    best, best_score = None, 0.0
    for row in rows:
        try:
            text = norm(row.inner_text(timeout=1500))
        except Exception:
            continue
        score = 0.0
        if want_title and want_title in text:
            score += 2.0
        else:
            hits = sum(1 for w in want_title.split() if w in text)
            score += 1.5 * hits / max(len(want_title.split()), 1)
        first_artist_word = want_artist.split()[0] if want_artist else ""
        if want_artist and want_artist in text:
            score += 1.0
        elif first_artist_word and first_artist_word in text:
            score += 0.5
        if score > best_score:
            best, best_score = row, score
    return best if best_score >= 1.8 else None


def add_song(page, playlist: str, artist: str, title: str, delay: float) -> str:
    """Search a song and add it to the playlist. Returns a status string."""
    query = f"{title} {re.split(r' feat[.]| featuring ', artist, flags=re.I)[0]}"
    try:
        search = page.locator(SELECTORS["search_input"]).first
        search.click()
        search.fill(query)
        search.press("Enter")
    except Exception:
        page.goto(f"{AMAZON_MUSIC_URL}/search/{query}", wait_until="domcontentloaded")
    pause(delay)
    # Prefer the Songs/Tracks tab when present so albums don't win.
    try:
        tab = page.get_by_text(SELECTORS["filter_songs_tab"]).first
        tab.click(timeout=2500)
        pause(delay / 2)
    except Exception:
        pass

    row = best_track_row(page, artist, title)
    if row is None:
        return "not_found"

    try:
        row.hover()
        row.locator(SELECTORS["row_context_button"]).first.click(timeout=4000)
        pause(delay / 3)
        if not click_menu_option(page, SELECTORS["add_to_playlist_text"]):
            page.keyboard.press("Escape")
            return "error:no-add-to-playlist-option"
        pause(delay / 3)
        target = page.get_by_text(playlist, exact=True).first
        target.click(timeout=4000)
        pause(delay / 3)
        return "added"
    except Exception as e:
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
        return f"error:{type(e).__name__}"


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--playlists", help="comma-separated subset of playlist names")
    ap.add_argument("--delay", type=float, default=2.0,
                    help="base seconds between actions (default 2.0)")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the plan without opening a browser")
    ap.add_argument("--headless", action="store_true",
                    help="headless mode (only works once already logged in)")
    args = ap.parse_args()

    if not PLAYLISTS_JSON.exists():
        sys.exit(f"Missing {PLAYLISTS_JSON} — run generate_playlists.py first.")
    data = json.loads(PLAYLISTS_JSON.read_text())
    playlists = data["playlists"]
    if args.playlists:
        wanted = {p.strip().casefold() for p in args.playlists.split(",")}
        playlists = [p for p in playlists if p["name"].casefold() in wanted]
        if not playlists:
            sys.exit(f"No playlists match {args.playlists!r}")

    total = sum(p["song_count"] for p in playlists)
    print(f"Plan: {len(playlists)} playlist(s), {total} songs "
          f"(~{total * (args.delay + 2.5) / 60:.0f} min at current pacing)")
    for p in playlists:
        print(f"  - {p['name']}: {p['song_count']} songs ({p['actual_runtime']})")
    if args.dry_run:
        return

    progress = load_progress()
    results = []

    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=args.headless,
            viewport={"width": 1440, "height": 900},
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(AMAZON_MUSIC_URL, wait_until="domcontentloaded")

        already = page.locator(SELECTORS["signed_in_probe"]).count() > 0
        if not already:
            wait_for_login(page)

        for pl in playlists:
            name = pl["name"]
            print(f"\n=== {name} ({pl['song_count']} songs) ===")
            if name not in progress["created_playlists"]:
                if create_playlist(page, name, args.delay):
                    progress["created_playlists"].append(name)
                    save_progress(progress)
                else:
                    print(f"  skipping '{name}' — could not create playlist")
                    continue

            for song in pl["songs"]:
                key = song_key(name, song["artist"], song["title"])
                if progress["done"].get(key) == "added":
                    continue
                status = add_song(page, name, song["artist"], song["title"], args.delay)
                progress["done"][key] = status
                save_progress(progress)
                mark = {"added": "+", "not_found": "?"}.get(status, "!")
                print(f"  [{mark}] {song['artist']} — {song['title']}  ({status})")
                results.append((name, song["artist"], song["title"], status))
                pause(args.delay)

        ctx.close()

    # ---- report ----
    all_rows = []
    for pl in playlists:
        for song in pl["songs"]:
            status = progress["done"].get(
                song_key(pl["name"], song["artist"], song["title"]), "pending")
            all_rows.append([pl["name"], song["artist"], song["title"], status])
    with open(REPORT_FILE, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Playlist", "Artist", "Song", "Status"])
        w.writerows(all_rows)

    added = sum(1 for r in all_rows if r[3] == "added")
    missing = [r for r in all_rows if r[3] == "not_found"]
    errors = [r for r in all_rows if r[3].startswith("error")]
    print(f"\nDone: {added}/{len(all_rows)} added. Report: {REPORT_FILE.name}")
    if missing:
        print(f"\n{len(missing)} song(s) not found — suggested replacements:")
        for plname, artist, title, _ in missing:
            hint = SUGGESTED_REPLACEMENTS.get(
                (norm(artist), norm(title)),
                f"try searching '{title}' alone, an alternate/live version, "
                f"or another top track by {artist}")
            print(f"  - [{plname}] {artist} — {title}\n      → {hint}")
    if errors:
        print(f"\n{len(errors)} error(s) — just re-run the script; it resumes "
              "where it left off and retries anything not marked 'added'.")


if __name__ == "__main__":
    main()
