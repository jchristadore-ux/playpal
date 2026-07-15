# Crystal Springs Golf Trip — Playlist Generator

The complete soundtrack for a 4-day golf trip: **9 playlists, 553 unique
songs, 36 hours of music, zero repeats.**

Four guys, early 40s, golf, drinks, gambling, Airbnb nights. Roughly
rap-forward with country, rock, and classic rock; explicit versions
preferred; no Taylor Swift, no EDM. Heavy rotation for the foundation five:
O.A.R., Stick Figure, Eminem, Jay-Z, Zach Bryan.

## The nine playlists

| # | Playlist | Theme | Runtime |
|---|----------|-------|---------|
| 1 | Minerals | The Arrival — mellow coffee start, ends with everyone singing | 4h 42m |
| 2 | Ballyowen | We're Here — confidence, more rock, more country | 4h 55m |
| 3 | Wild Turkey | Let's Get Loud — rap-heavy, highest energy | 4h 34m |
| 4 | Crystal Springs | Prime Time — the absolute best songs, no skips | 4h 48m |
| 5 | Cascades | Golden Hour — afternoon drinks, country + classic rock | 2h 34m |
| 6 | Black Bear | Last Dance — final round, nostalgic, big finish | 4h 33m |
| 7 | Airbnb Morning | Coffee & breakfast, acoustic, relaxed | 2h 56m |
| 8 | Airbnb Evening | Fire pit, cards, drinks, everyone singing | 4h 58m |
| 9 | Trip Anthem | The highlight-reel soundtrack of the entire trip | 1h 57m |

## What's in here

```
playlist_data.py            all 553 curated tracks (the single source of truth)
generate_playlists.py       validates rules + writes every deliverable
output/
  master_playlist.xlsx      spreadsheet: summary tab, master tab, tab per playlist
  master_playlist.csv       Playlist / Track # / Artist / Song / Length / Genre
  csv/NN_<playlist>.csv     one CSV per playlist
  import/NN_<playlist>.csv  title,artist CSVs ready for Soundiiz/TuneMyMusic
  playlists.json            full JSON backup
  PLAYLISTS.md              the whole soundtrack as readable markdown
  VALIDATION.md             proof: zero duplicates, artist caps, runtimes, genre mix
automation/
  amazon_music_uploader.py  Playwright script that builds it all in Amazon Music
  README.md                 method comparison + how to run it
```

## Regenerating

```bash
cd crystal-springs-trip
pip install openpyxl        # only needed for the .xlsx
python3 generate_playlists.py
```

The generator **fails the build** if any song appears twice across any of
the nine playlists, or any artist appears more than 3× inside one playlist —
so the "zero duplicates" guarantee is enforced, not just claimed. It also
prints per-playlist runtime drift against the brief's targets (everything
lands within ±5 minutes) and the genre mix.

Song lengths are approximate album-version times; streaming versions can
differ by a few seconds per track.

## Getting it into Amazon Music

See [`automation/README.md`](automation/README.md). Short version: the
official Amazon Music API is approval-only, so the recommended path is the
included Playwright script — you log into music.amazon.com in the browser
window it opens, press ENTER, and it creates all nine playlists and adds
all 553 songs itself, with a per-track report and replacement suggestions
for anything unavailable.
