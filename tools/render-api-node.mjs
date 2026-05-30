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

const allowedThemes = new Set(["warm", "minimal", "fresh", "dark"]);
const allowedFonts = new Set(["myanmar-text", "noto-sans-myanmar", "myanmar3"]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeDesign(design = {}) {
  return {
    theme: allowedThemes.has(design.theme) ? design.theme : "warm",
    font: allowedFonts.has(design.font) ? design.font : "myanmar-text",
    titleScale: clamp(Number(design.titleScale) || 1, 0.78, 1.2),
    bodyScale: clamp(Number(design.bodyScale) || 1, 0.78, 1.2)
  };
}

function parseDesignInstruction(instruction = "", previousDesign = {}) {
  const design = normalizeDesign(previousDesign);
  const text = String(instruction).toLowerCase();

  if (/简约|极简|minimal/.test(text)) design.theme = "minimal";
  if (/清新|自然|绿色|fresh|green/.test(text)) design.theme = "fresh";
  if (/深色|高级|暗色|dark|premium/.test(text)) design.theme = "dark";
  if (/温暖|咖啡色|原来|warm|classic/.test(text)) design.theme = "warm";

  if (/noto/.test(text)) design.font = "noto-sans-myanmar";
  if (/myanmar3/.test(text)) design.font = "myanmar3";
  if (/myanmar text|默认字体|原来字体/.test(text)) design.font = "myanmar-text";

  if (/标题.{0,6}(大一点|放大|加大)|title.{0,6}(larger|bigger)/.test(text)) {
    design.titleScale = clamp(design.titleScale + 0.08, 0.78, 1.2);
  }
  if (/标题.{0,6}(小一点|缩小)|title.{0,6}smaller/.test(text)) {
    design.titleScale = clamp(design.titleScale - 0.08, 0.78, 1.2);
  }
  if (/(正文|字体).{0,6}(大一点|放大|加大)|body.{0,6}(larger|bigger)/.test(text)) {
    design.bodyScale = clamp(design.bodyScale + 0.08, 0.78, 1.2);
  }
  if (/(正文|字体).{0,6}(小一点|缩小)|body.{0,6}smaller/.test(text)) {
    design.bodyScale = clamp(design.bodyScale - 0.08, 0.78, 1.2);
  }
  if (/重置|恢复默认|reset/.test(text)) {
    return normalizeDesign();
  }

  return design;
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

async function renderDailyData(data, publicBaseUrl) {
  await mkdir(dataDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const day = data.day;
  const renderVersion = Date.now();
  data.design = normalizeDesign(data.design);
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
        url: `${publicBaseUrl}/output/day-${day}/${fileName}?v=${renderVersion}`,
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

    const publicBaseUrl = `${req.protocol}://${req.get("host")}`;
    const result = await renderDailyData(req.body, publicBaseUrl);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/rerender", async (req, res) => {
  try {
    const day = Number(req.body?.day);
    if (!Number.isInteger(day)) {
      res.status(400).json({ ok: false, issues: ["day must be a number"] });
      return;
    }

    const raw = await readFile(path.join(dataDir, `day-${day}.json`), "utf8");
    const data = JSON.parse(raw);
    data.design = req.body?.design
      ? normalizeDesign({ ...data.design, ...req.body.design })
      : parseDesignInstruction(req.body?.instruction, data.design);

    const publicBaseUrl = `${req.protocol}://${req.get("host")}`;
    const result = await renderDailyData(data, publicBaseUrl);
    res.json({ ...result, design: data.design });
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
