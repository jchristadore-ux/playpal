# Amazon Music Automation

How to get all nine playlists into Amazon Music with as little manual
work as possible, while respecting Amazon's authentication and terms of use.

## Method comparison (in the preferred order)

### 1. Official Amazon Music API — not usable for this
Amazon does have a Web API for Amazon Music (`developer.amazon.com/docs/music`),
and it does include playlist endpoints — but access is a **restricted,
approval-only developer program** (aimed at hardware/service partners). There
are no self-serve API keys an individual can generate to automate their own
playlists. If Amazon ever opens self-serve access this would become the best
option; worth a periodic glance at developer.amazon.com. (Their developer
site also blocks datacenter traffic, which is consistent with how locked-down
this program is.)

### 2. Playwright browser automation — **recommended, built here**
`amazon_music_uploader.py` drives the real Amazon Music web player in a real
Chromium window using **your own login session**:

- You log in manually (password/passkey/2FA) — the script never sees or
  stores credentials.
- It then creates each playlist, searches every song, adds it, verifies the
  result, and writes a per-track report.
- Human-paced delays between actions, and it's fully **resumable**
  (`amazon_progress.json` checkpoints after every song — Ctrl-C any time and
  re-run).
- Songs it can't find are listed at the end **with suggested replacements**.

### 3. Selenium — works, but strictly worse here
Same browser-automation approach, but Playwright has auto-waiting, better
selector ergonomics, and persistent browser profiles built in, which is
exactly what a 553-song batch job needs. If you ever need Selenium (e.g.
corporate policy), the flow in `amazon_music_uploader.py` ports 1:1.

### 4. CSV import services — zero-code fallback
[Soundiiz](https://soundiiz.com) and [TuneMyMusic](https://www.tunemymusic.com)
both import CSV → Amazon Music playlists. The files in `../output/import/`
are already formatted for them (`title,artist`). Free tiers limit playlist
size/count (Soundiiz free caps imports at 200 tracks/playlist and pushes you
to one-at-a-time), so doing all ~553 songs likely needs one month of their
premium tier — but it's the most "it just works" option if the script's
selectors ever drift.

## Running the uploader (on your own computer)

> Run this **locally**, not in a cloud session — it opens a browser window
> you need to log into.

```bash
cd crystal-springs-trip/automation
pip install -r requirements.txt
playwright install chromium        # first time only

python amazon_music_uploader.py                  # everything (~45-75 min)
python amazon_music_uploader.py --playlists "Trip Anthem"   # start small
python amazon_music_uploader.py --dry-run        # print the plan only
```

The flow:

1. A Chromium window opens at music.amazon.com. **Log in** (2FA fine).
2. Press ENTER in the terminal. That's the last manual step.
3. The script creates each playlist, searches and adds all songs, pacing
   itself like a human.
4. When it finishes (or any time you re-run it) check
   `amazon_music_report.csv` — every track marked `added`, `not_found`, or
   `error:*`.
5. `not_found` tracks get replacement suggestions printed at the end;
   `error` tracks are retried automatically on the next run.

Your login is cached in `~/.amazon-music-uploader` (a normal Chromium
profile owned by you), so subsequent runs skip the login step.

## If Amazon changes their web player

All DOM lookups go through the `SELECTORS` dict at the top of
`amazon_music_uploader.py`. If a step stops working, open the web player,
inspect the element that changed, and update the matching entry — nothing
else in the script needs touching.

## Explicit versions

The search prefers the exact title match; Amazon generally ranks the
original (explicit) album version first for these tracks. After the run,
spot-check a few rap tracks — if any came in clean, the fix is the track's
"⋮ → Add to Playlist" on the explicit version and deleting the clean one.
