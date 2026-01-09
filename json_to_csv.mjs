import fs from "node:fs";

const j = JSON.parse(fs.readFileSync("dataset.json", "utf8"));
const header = ["day","gid","gnick","nick","lv","power","maxpower","sumkill","die","score","caiji","createdAt"];

function esc(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const lines = [header.join(",")];

for (const r of j.series) {
  const row = header.map((k) => esc(r[k]));
  lines.push(row.join(","));
}

fs.writeFileSync("dataset.csv", lines.join("\n"), "utf8");
console.log("Wrote dataset.csv rows=", j.series.length);
