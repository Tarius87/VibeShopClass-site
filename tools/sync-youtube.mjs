// Fills in YouTube IDs on the site from the channel's public feed, so new lessons and Shorts
// appear without editing index.html by hand. Run from the repo root:  node tools/sync-youtube.mjs
// (A GitHub Action runs this on a schedule; see .github/workflows/sync-youtube.yml.)
//
// The planned schedule (RELEASES, VIDEOS and SHORTS in index.html) comes from the
// "Vibe Shop Class — Season 1 drop schedule" sheet in Google Drive; this only fills gaps:
// - A new full-length video goes into its lesson's slot (matched by topic or release time). If that
//   slot already holds a video that is no longer public, the new one replaces it (re-upload).
// - A new Short fills its lesson's empty card closest to its drop time, or replaces a card whose
//   old video is no longer public (re-upload). Planned titles and drop times are kept.
// - A lesson with no Short cards gets six, one every two days after it.
// Nothing is ever removed.
import { readFileSync, writeFileSync } from "node:fs";

const CHANNEL_ID = "UCPhONqw-0fi3KcFJdtz8ltw";
const FILE = "index.html";

const xml = process.env.FEED_FILE
  ? readFileSync(process.env.FEED_FILE, "utf8")
  : await (await fetch("https://www.youtube.com/feeds/videos.xml?channel_id=" + CHANNEL_ID)).text();
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const feed = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
  id: e.match(/<yt:videoId>([^<]+)/)[1],
  title: decode(e.match(/<title>([^<]*)/)[1]),
  out: new Date(e.match(/<published>([^<]+)/)[1]),
})).sort((a, b) => a.out - b.out);
if (!feed.length) throw new Error("Feed had no videos");
const isShort = (v) => /#shorts?\b/i.test(v.title);

let html = readFileSync(FILE, "utf8");
const videosRe = /const VIDEOS = (\{[^}]*\});/;
const VIDEOS = Function("return " + html.match(videosRe)[1])();
const shortsRe = /(\/\* SHORTS-START \*\/\s*const SHORTS = )(\[[\s\S]*?\]);(\s*\/\* SHORTS-END \*\/)/;
const SHORTS = JSON.parse(html.match(shortsRe)[2]);
const before = JSON.stringify([VIDEOS, SHORTS]);

const RELEASES = Function("return " + html.match(/const RELEASES = (\{[^}]*\});/)[1])();
const DAY = 86400000, words = (t) => new Set(t.toLowerCase().replace(/#\w+/g, "").match(/[a-z0-9$]+/g) || []);
const overlap = (a, b) => { const A = words(a), B = words(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(1, Math.min(A.size, B.size)); };
const inFeed = (id) => feed.some((f) => f.id === id);
// Topic words for each lesson, used when a lesson video is re-uploaded under a new ID.
const TOPIC = { ep1: /\bwebsite\b/i, ep2: /\biphone app\b/i, ep3: /\bsocial app\b/i, ep4: /\bnovel\b/i, ep5: /\bplan\b/i, ep6: /\bstore\b/i };

// 1. full-length lesson videos: match by topic, else by release time, else the first empty slot
const slots = Object.keys(VIDEOS).sort((a, b) => +a.slice(2) - +b.slice(2));
for (const v of feed.filter((v) => !isShort(v))) {
  if (Object.values(VIDEOS).includes(v.id)) continue;
  const slot = slots.find((k) => TOPIC[k] && TOPIC[k].test(v.title))
    || slots.find((k) => RELEASES[k] && Math.abs(new Date(RELEASES[k]) - v.out) < 1.5 * DAY)
    || slots.find((k) => !VIDEOS[k]);
  if (!slot) { console.log("No lesson slot for", v.id, v.title); continue; }
  // a filled slot is only replaced when its old video isn't public (re-upload)
  if (VIDEOS[slot] && (inFeed(VIDEOS[slot]) || new Date(RELEASES[slot] || 0) > Date.now())) { console.log("Kept", slot, VIDEOS[slot], "- also public:", v.id, v.title); continue; }
  console.log("Lesson video", slot, ":", VIDEOS[slot] || "(empty)", "->", v.id, v.title);
  VIDEOS[slot] = v.id;
}

// lesson start times, from the release schedule or the feed
const lessonOut = slots.map((k) => { const v = feed.find((f) => f.id === VIDEOS[k]); return v ? v.out : RELEASES[k] ? new Date(RELEASES[k]) : null; });
const lessonOf = (when) => lessonOut.filter((t) => t && t <= when).length; // 0 = before Lesson 1 (teasers)

// 2. six upcoming Short cards for a lesson that has none yet (a Short every 2 days after it)
lessonOut.forEach((t, k) => {
  const n = k + 1;
  if (!t || SHORTS.some((s) => s.lesson === n)) return;
  for (let i = 1; i <= 6; i++) SHORTS.push({ lesson: n, id: "", out: new Date(+t + i * 2 * DAY).toISOString().replace(/\.\d{3}Z$/, "Z"), title: "" });
  console.log("Added upcoming Short cards for Lesson", n);
});

// 3. Shorts: fill the empty card nearest its drop time; a re-upload replaces the card whose old video isn't public
for (const v of feed.filter(isShort)) {
  if (SHORTS.some((s) => s.id === v.id)) continue;
  const n = lessonOf(v.out);
  if (!n) continue;
  const title = v.title.replace(/\s*#shorts?\b/gi, "").trim();
  const near = (s) => Math.abs(new Date(s.out) - v.out);
  let card = SHORTS.filter((s) => s.lesson === n && !s.id && near(s) < 1.5 * DAY).sort((a, b) => near(a) - near(b))[0];
  if (!card) card = SHORTS.filter((s) => s.lesson === n && s.id && !inFeed(s.id) && new Date(s.out) >= feed[0].out && new Date(s.out) <= Date.now() && overlap(s.title, title) >= 0.5).sort((a, b) => overlap(b.title, title) - overlap(a.title, title))[0];
  if (!card) card = SHORTS.filter((s) => s.lesson === n && !s.id).sort((a, b) => near(a) - near(b))[0];
  if (card) { console.log("Short for Lesson", n, ":", card.id || "(empty)", "->", v.id, title); card.id = v.id; card.title = card.title || title; if (!card.out) card.out = v.out.toISOString(); }
  else { SHORTS.push({ lesson: n, id: v.id, out: v.out.toISOString().replace(/\.\d{3}Z$/, "Z"), title }); console.log("New Short card for Lesson", n, v.id, title); }
}

if (JSON.stringify([VIDEOS, SHORTS]) === before) { console.log("Already up to date."); process.exit(0); }
SHORTS.sort((a, b) => a.lesson - b.lesson || new Date(a.out) - new Date(b.out));
const videosText = "{ " + slots.map((k) => k + ": " + JSON.stringify(VIDEOS[k])).join(", ") + " }";
const shortsText = "[\n" + SHORTS.map((s) => "        " + JSON.stringify(s).replace(/^\{/, "{ ").replace(/\}$/, " }").replace(/","/g, '", "').replace(/,"/g, ', "').replace(/":/g, '": ')).join(",\n") + "\n      ]";
html = html.replace(videosRe, "const VIDEOS = " + videosText + ";").replace(shortsRe, (m, a, b, c) => a + shortsText + ";" + c);
writeFileSync(FILE, html);
console.log("index.html updated.");
