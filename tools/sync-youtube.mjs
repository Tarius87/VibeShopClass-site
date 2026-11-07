// Fills in YouTube IDs on the site from the channel's public feed, so new lessons and Shorts
// appear without editing index.html by hand. Run from the repo root:  node tools/sync-youtube.mjs
// (A GitHub Action runs this on a schedule; see .github/workflows/sync-youtube.yml.)
//
// - A new full-length video goes into the first empty VIDEOS slot (ep1, ep2, ...).
// - A Short belongs to the latest lesson published before it. It fills that lesson's next empty
//   Short slot (the one with the closest drop time), or is added as a new card.
// - When a new lesson appears and it has no Short cards yet, six upcoming cards are added,
//   one every two days at the lesson's time of day, as with Lessons 1 and 2.
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

// 1. full-length lesson videos
const slots = Object.keys(VIDEOS).sort((a, b) => +a.slice(2) - +b.slice(2));
for (const v of feed.filter((v) => !isShort(v))) {
  if (Object.values(VIDEOS).includes(v.id)) continue;
  const empty = slots.find((k) => !VIDEOS[k]);
  if (!empty) { console.log("No empty lesson slot for", v.id, v.title); continue; }
  VIDEOS[empty] = v.id;
  console.log("Lesson video", empty, "=", v.id, v.title);
}

// lesson publish times: from the feed where we can see them; older lessons count as "before everything"
const lessonOut = slots.map((k) => { const v = feed.find((f) => f.id === VIDEOS[k]); return VIDEOS[k] ? (v ? v.out : new Date(0)) : null; });
const lessonOf = (when) => lessonOut.filter((t) => t && t <= when).length; // 0 = before Lesson 1 (teasers)

// 2. six upcoming Short cards for a lesson that has none yet
lessonOut.forEach((t, k) => {
  const n = k + 1;
  if (!t || +t === 0 || SHORTS.some((s) => s.lesson === n)) return;
  for (let i = 1; i <= 6; i++) SHORTS.push({ lesson: n, id: "", out: new Date(+t + i * 2 * 86400000).toISOString().replace(/\.\d{3}Z$/, "Z"), title: "" });
  console.log("Added upcoming Short cards for Lesson", n);
});

// 3. Shorts
for (const v of feed.filter(isShort)) {
  if (SHORTS.some((s) => s.id === v.id)) continue;
  const n = lessonOf(v.out);
  if (!n) continue;
  const title = v.title.replace(/\s*#shorts?\b/gi, "").trim();
  const out = v.out.toISOString().replace(/\.\d{3}Z$/, "Z");
  const open = SHORTS.filter((s) => s.lesson === n && !s.id).sort((a, b) => Math.abs(new Date(a.out) - v.out) - Math.abs(new Date(b.out) - v.out))[0];
  if (open) Object.assign(open, { id: v.id, title, out });
  else SHORTS.push({ lesson: n, id: v.id, out, title });
  console.log("Short for Lesson", n, "=", v.id, title);
}

if (JSON.stringify([VIDEOS, SHORTS]) === before) { console.log("Already up to date."); process.exit(0); }
SHORTS.sort((a, b) => a.lesson - b.lesson || new Date(a.out) - new Date(b.out));
const videosText = "{ " + slots.map((k) => k + ": " + JSON.stringify(VIDEOS[k])).join(", ") + " }";
const shortsText = "[\n" + SHORTS.map((s) => "        " + JSON.stringify(s).replace(/^\{/, "{ ").replace(/\}$/, " }").replace(/","/g, '", "').replace(/,"/g, ', "').replace(/":/g, '": ')).join(",\n") + "\n      ]";
html = html.replace(videosRe, "const VIDEOS = " + videosText + ";").replace(shortsRe, (m, a, b, c) => a + shortsText + ";" + c);
writeFileSync(FILE, html);
console.log("index.html updated.");
