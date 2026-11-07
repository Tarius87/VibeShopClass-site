// Builds cal/lesson-N.ics (Apple Calendar / any .ics app) from RELEASES and LESSONS in index.html.
// Run from the repo root after changing a premiere date:  node tools/make-calendars.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const grab = (re, what) => { const m = html.match(re); if (!m) throw new Error("Could not find " + what + " in index.html"); return m[1]; };
const RELEASES = Function("return " + grab(/const RELEASES = (\{[^}]*\});/, "RELEASES"))();
const CHANNEL_URL = grab(/const CHANNEL_URL = "([^"]+)"/, "CHANNEL_URL");
const lessons = [...html.matchAll(/\{ n: (\d+), tab: "[^"]*", title: "([^"]*)", time: "[^"]*", vid: "(ep\d+)",\s*text: "([^"]*)"/g)]
  .map(([, n, title, vid, text]) => ({ n: +n, title, vid, text }));

const stamp = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
const escText = (s) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
// RFC 5545: lines over 75 octets are folded with CRLF + space.
const fold = (line) => {
  const out = []; let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ""; }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
};

mkdirSync("cal", { recursive: true });
for (const f of readdirSync("cal")) if (/^lesson-\d+\.ics$/.test(f)) unlinkSync("cal/" + f);

let made = 0;
for (const l of lessons) {
  const d = new Date(RELEASES[l.vid] || "");
  if (isNaN(d)) continue;
  const end = new Date(+d + 30 * 60000), link = "https://vibeshopclass.com/#lessons-" + l.n;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vibe Shop Class//Lessons//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:lesson-" + l.n + "@vibeshopclass.com",
    "DTSTAMP:" + stamp(new Date()),
    "DTSTART:" + stamp(d),
    "DTEND:" + stamp(end),
    "SUMMARY:" + escText("Vibe Shop Class Lesson " + l.n + ": " + l.title),
    "DESCRIPTION:" + escText("Lesson " + l.n + " premieres on YouTube. " + l.text + "\n\nWatch: " + CHANNEL_URL + "\nLesson page: " + link),
    "LOCATION:" + escText(CHANNEL_URL),
    "URL:" + link,
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + escText("Lesson " + l.n + " premieres in 15 minutes"), "TRIGGER:-PT15M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  writeFileSync("cal/lesson-" + l.n + ".ics", lines.map(fold).join("\r\n") + "\r\n");
  console.log("cal/lesson-" + l.n + ".ics  " + d.toISOString());
  made++;
}
if (!lessons.length) throw new Error("No lessons found in index.html");
console.log(made ? made + " calendar file(s) written." : "No dates set in RELEASES yet; no calendar files written.");
