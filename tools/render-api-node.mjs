import express from "express";
import { chromium } from "playwright";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const outputDir = path.join(root, "output");
const port = Number(process.env.PORT || 8787);
const runFile = promisify(execFile);

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

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function makeVideoScenes(data) {
  const slides = Array.isArray(data.slides) ? data.slides : [];
  const opening = slides[0] || {};
  const detailSlides = slides.slice(1);
  const lastSlide = slides[slides.length - 1] || {};
  const sections = detailSlides
    .flatMap((slide) => (slide.sections || []).map((section) => ({
      title: section.heading || slide.title,
      subtitle: section.text || slide.footer || "",
      narration: section.narration || section.text || section.heading || "",
      visual: `${slide.visual || ""} ${section.heading || ""} ${section.text || ""}`
    })))
    .filter((scene) => scene.title || scene.subtitle)
    .slice(0, 5);

  const pointDuration = sections.length > 3 ? 5 : 6;
  const scenes = [
    {
      kind: "opening",
      durationSeconds: 3,
      title: opening.title || data.topic,
      subtitle: opening.body || data.topic,
      narration: opening.body || opening.title || data.topic,
      visual: opening.visual || data.topic,
      layout: "hero"
    },
    ...sections.map((section, index) => ({
      kind: "point",
      durationSeconds: pointDuration,
      title: section.title,
      subtitle: section.subtitle,
      narration: section.narration,
      visual: section.visual,
      layout: ["focus", "diagram", "process", "compare", "checklist"][index % 5],
      step: index + 1
    })),
    {
      kind: "summary",
      durationSeconds: sections.length > 3 ? 5 : 6,
      title: lastSlide.title || data.topic,
      subtitle: lastSlide.footer || data.caption,
      narration: lastSlide.footer || data.caption || data.topic,
      visual: lastSlide.visual || data.topic,
      layout: "summary"
    }
  ];

  return scenes.map((scene) => ({
    ...scene,
    title: cleanText(scene.title).slice(0, 120),
    subtitle: cleanText(scene.subtitle).slice(0, 210),
    narration: cleanText(scene.narration).slice(0, 160),
    visual: cleanText(scene.visual)
  }));
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

async function renderDailyVideo(data, publicBaseUrl) {
  await mkdir(dataDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const day = data.day;
  const renderVersion = Date.now();
  const dataFileName = `day-${day}.json`;
  const dataFile = path.join(dataDir, dataFileName);
  const dayOutputDir = path.join(outputDir, `day-${day}`);
  const frameDir = path.join(dayOutputDir, "video-frames");
  const videoFileName = `day-${day}-carousel.mp4`;
  const videoFile = path.join(dayOutputDir, videoFileName);
  await mkdir(dayOutputDir, { recursive: true });
  await rm(frameDir, { recursive: true, force: true });
  await mkdir(frameDir, { recursive: true });
  data.design = normalizeDesign(data.design);
  data.videoScenes = makeVideoScenes(data);
  await writeFile(dataFile, JSON.stringify(data, null, 2), "utf8");

  const fps = 5;
  const browser = await chromium.launch({
    headless: true,
    args: ["--font-render-hinting=medium"]
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1350 },
      deviceScaleFactor: 1
    });

    let frame = 0;
    for (let scene = 0; scene < data.videoScenes.length; scene += 1) {
      const sceneData = data.videoScenes[scene];
      const framesInScene = Math.max(12, Math.round(sceneData.durationSeconds * fps));
      const url = `http://127.0.0.1:${port}/index.html?data=data/${dataFileName}&videoScene=${scene}&export=1&video=1`;
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForFunction(() => window.__DENUCHECK__ !== undefined);
      for (let index = 0; index < framesInScene; index += 1) {
        const fileName = `frame-${String(frame).padStart(4, "0")}.png`;
        await page.screenshot({
          path: path.join(frameDir, fileName),
          type: "png",
          clip: { x: 0, y: 0, width: 1080, height: 1350 }
        });
        frame += 1;
        await page.waitForTimeout(1000 / fps);
      }
    }
  } finally {
    await browser.close();
  }

  await runFile("ffmpeg", [
    "-y",
    "-framerate", String(fps),
    "-i", path.join(frameDir, "frame-%04d.png"),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    videoFile
  ]);
  await rm(frameDir, { recursive: true, force: true });
  const buffer = await readFile(videoFile);
  const durationSeconds = data.videoScenes.reduce((total, scene) => total + scene.durationSeconds, 0);

  return {
    ok: true,
    day,
    caption: data.caption,
    videoScenes: data.videoScenes,
    video: {
      fileName: videoFileName,
      mimeType: "video/mp4",
      durationSeconds,
      sizeBytes: buffer.length,
      url: `${publicBaseUrl}/output/day-${day}/${videoFileName}?v=${renderVersion}`
    }
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "denu-coffee-render-api", video: true });
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

app.post("/video", async (req, res) => {
  try {
    const issues = validateDailyData(req.body);
    if (issues.length > 0) {
      res.status(400).json({ ok: false, issues });
      return;
    }

    const publicBaseUrl = `${req.protocol}://${req.get("host")}`;
    const result = await renderDailyVideo(req.body, publicBaseUrl);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/video", (_req, res) => {
  res.status(405).json({ ok: false, error: "Use POST /video to render an MP4." });
});

app.post("/rerender-video", async (req, res) => {
  try {
    const day = Number(req.body?.day);
    if (!Number.isInteger(day)) {
      res.status(400).json({ ok: false, issues: ["day must be a number"] });
      return;
    }

    const raw = await readFile(path.join(dataDir, `day-${day}.json`), "utf8");
    const data = JSON.parse(raw);
    const publicBaseUrl = `${req.protocol}://${req.get("host")}`;
    const result = await renderDailyVideo(data, publicBaseUrl);
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
