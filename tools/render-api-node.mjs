import express from "express";
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const outputDir = path.join(root, "output");
const port = Number(process.env.PORT || 8787);

const app = express();
app.use(express.json({ limit: "15mb" }));
app.use(express.static(root, {
  etag: false,
  maxAge: 0
}));

function hasMyanmarText(value) {
  return /[\u1000-\u109F]/.test(JSON.stringify(value));
}

function validateDailyData(data) {
  const issues = [];

  if (!Number.isInteger(data?.day)) issues.push("day must be a number");
  if (!Array.isArray(data?.slides) || data.slides.length !== 3) {
    issues.push("exactly three slides are required");
  }
  if (!data?.caption || !hasMyanmarText(data.caption)) {
    issues.push("caption with Myanmar text is required");
  }

  for (const [index, slide] of (data?.slides || []).entries()) {
    const slideNo = index + 1;
    if (!slide.title) issues.push(`slide ${slideNo}: title is required`);
    if (!hasMyanmarText(slide)) issues.push(`slide ${slideNo}: Myanmar text is required`);
    if (slide.kind !== "hook" && (!Array.isArray(slide.sections) || slide.sections.length !== 3)) {
      issues.push(`slide ${slideNo}: exactly three sections are required`);
    }
  }

  return issues;
}

async function renderDailyData(data) {
  await mkdir(dataDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const day = data.day;
  const dataFileName = `day-${day}.json`;
  const dataFile = path.join(dataDir, dataFileName);
  const dayOutputDir = path.join(outputDir, `day-${day}`);
  await mkdir(dayOutputDir, { recursive: true });
  await writeFile(dataFile, JSON.stringify(data, null, 2), "utf8");

  const browser = await chromium.launch({
    headless: true,
    args: ["--font-render-hinting=medium"]
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1350 },
      deviceScaleFactor: 1
    });

    const images = [];

    for (let index = 0; index < 3; index += 1) {
      const url = `http://127.0.0.1:${port}/index.html?data=data/${dataFileName}&slide=${index}&export=1`;
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForFunction(() => window.__DENUCHECK__ !== undefined);

      const check = await page.evaluate(() => window.__DENUCHECK__);
      const buffer = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: 1080, height: 1350 }
      });

      const fileName = `day-${day}-slide-${index + 1}.png`;
      const filePath = path.join(dayOutputDir, fileName);
      await writeFile(filePath, buffer);

      images.push({
        slide: index + 1,
        fileName,
        mimeType: "image/png",
        base64: buffer.toString("base64"),
        check
      });
    }

    return {
      ok: images.every((image) => image.check?.ok),
      day,
      caption: data.caption,
      images
    };
  } finally {
    await browser.close();
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "denu-coffee-render-api" });
});

app.post("/render", async (req, res) => {
  try {
    const issues = validateDailyData(req.body);
    if (issues.length > 0) {
      res.status(400).json({ ok: false, issues });
      return;
    }

    const result = await renderDailyData(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/example/day-28", async (_req, res) => {
  const raw = await readFile(path.join(dataDir, "day-28.json"), "utf8");
  res.type("json").send(raw);
});

app.listen(port, () => {
  console.log(`Denu Coffee render API listening on port ${port}`);
});
