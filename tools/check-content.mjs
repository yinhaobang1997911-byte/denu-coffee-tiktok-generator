import { readFile } from "node:fs/promises";

const file = process.argv[2] || "data/day-28.json";
const raw = await readFile(file, "utf8");
const data = JSON.parse(raw);

const issues = [];
const myanmarPattern = /[\u1000-\u109F]/;
const englishTerms = [
  "Arabica",
  "Natural Process",
  "Washed Process",
  "Light Roast",
  "Specialty Coffee",
  "Fruity",
  "Berry",
  "Citrus"
];

if (!Number.isInteger(data.day)) issues.push("day must be a number");
if (!Array.isArray(data.slides) || data.slides.length !== 3) issues.push("exactly three slides are required");
if (!data.caption || !myanmarPattern.test(data.caption)) issues.push("caption needs Myanmar text");

for (const [index, slide] of (data.slides || []).entries()) {
  const slideNo = index + 1;
  const serialized = JSON.stringify(slide);
  if (!slide.title) issues.push(`slide ${slideNo}: missing title`);
  if (!myanmarPattern.test(serialized)) issues.push(`slide ${slideNo}: no Myanmar text detected`);
  if (serialized.length > 1700) issues.push(`slide ${slideNo}: text may be too long for the template`);
  if (slide.sections && slide.sections.length > 3) issues.push(`slide ${slideNo}: too many sections`);
}

const allText = JSON.stringify(data);
const hasCoffeeTerm = englishTerms.some(term => allText.includes(term));
if (!hasCoffeeTerm) issues.push("content should keep simple English coffee terms");

console.log(JSON.stringify({
  ok: issues.length === 0,
  file,
  day: data.day,
  slideCount: data.slides?.length || 0,
  issues
}, null, 2));

process.exit(issues.length ? 1 : 0);
