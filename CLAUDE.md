# Vibe Shop Class site (vibeshopclass.com)

## Always check Google Drive first and cross-reference

Before changing dates, videos, Shorts, titles or anything about the release plan, check the
Vibe Shop Class folder in Google Drive and cross-reference it with YouTube and this repo.
Never guess a date that might be in the Drive.

- **"Vibe Shop Class — Season 1 drop schedule"** (Google Sheet): the source of truth for every
  lesson and Short: date, time (11:00 AM Central), episode, title, YouTube status and link.
- "Vibe Shop Class — Project status (live)", "Decisions log" and "Channel bible": current status
  and decisions.
- YouTube channel feed (public videos only; scheduled uploads stay private until they publish):
  https://www.youtube.com/feeds/videos.xml?channel_id=UCPhONqw-0fi3KcFJdtz8ltw

## Where the schedule lives in the code

In the script at the top of `index.html`:
- `VIDEOS`: YouTube ID per lesson. Scheduled (still private) IDs can go in early; each video
  turns on by itself at its `RELEASES` time.
- `RELEASES`: premiere time per lesson (UTC). After changing one, run `node tools/make-calendars.mjs`
  to rebuild the Add to calendar files in `cal/`.
- `SHORTS` (between `SHORTS-START` / `SHORTS-END`): every Short with lesson, ID, drop time and title.

`tools/sync-youtube.mjs` (run by `.github/workflows/sync-youtube.yml`) fills in IDs for videos
uploaded later and handles re-uploads. It never removes anything.

## Publishing

The live site is GitHub Pages from `main`. Keep `CNAME`, `.nojekyll` and the Supabase keep-alive workflow.
