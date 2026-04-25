const fs = require("fs");
const path = require("path");
const { marked } = require("marked");
const { chromium } = require("playwright");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_DIR = __dirname;
const OUTPUT_FILE = path.join(BASE_DIR, "The Talent Discovery.pdf");
const HTML_FILE = path.join(BASE_DIR, "_compiled.html");
const SCREENSHOT_DIR = path.join(BASE_DIR, "_screenshots");

const SKIP_FILES = new Set([
  "00_Project_Bible.md",
  "01_Table_of_Contents.md",
  "requirements.txt",
]);

// A4 dimensions at 96 DPI
const A4_W = 794;   // 210mm
const A4_H = 1123;  // 297mm

// ---------------------------------------------------------------------------
// 1. Gather & parse markdown
// ---------------------------------------------------------------------------
function getMarkdownFiles() {
  return fs
    .readdirSync(BASE_DIR)
    .filter((f) => f.endsWith(".md") && !SKIP_FILES.has(f))
    .sort();
}

function fontToDataURI(relPath) {
  const abs = path.join(BASE_DIR, relPath);
  if (!fs.existsSync(abs)) return null;
  return `data:font/woff2;base64,${fs.readFileSync(abs).toString("base64")}`;
}

function imageToBase64(imgPath) {
  const abs = path.resolve(imgPath);
  if (!fs.existsSync(abs)) return null;
  const ext = path.extname(abs).slice(1).toLowerCase();
  const mime = ext === "jpg" ? "jpeg" : ext;
  return `data:image/${mime};base64,${fs.readFileSync(abs).toString("base64")}`;
}

function parseMarkdown(files) {
  const renderer = new marked.Renderer();

  renderer.image = function ({ href, title, text }) {
    let imgPath = href;
    if (imgPath.startsWith("./")) imgPath = path.join(BASE_DIR, imgPath);
    const b64 = imageToBase64(imgPath);
    const src = b64 || href;
    return `<figure class="book-figure"><img src="${src}" alt="${text || ""}" /></figure>`;
  };

  const stripPromptComments = (md) =>
    md.replace(
      /^\[\/\/\]: # \((?:IMAGE_PROMPT_START|IMAGE_PROMPT_END|NANO_BANANA_2:.*)\)\s*$/gm,
      ""
    );

  marked.setOptions({ renderer, gfm: true, breaks: false });

  let html = "";
  for (const file of files) {
    const raw = fs.readFileSync(path.join(BASE_DIR, file), "utf-8");
    html += `<section class="chapter">${marked.parse(stripPromptComments(raw))}</section>\n`;
  }
  return html;
}

// ---------------------------------------------------------------------------
// 2. Post-process HTML
// ---------------------------------------------------------------------------
function postProcessHTML(html) {
  html = html.replace(
    /(<blockquote>\s*<p><strong>Try This Tonight)/g,
    '<blockquote class="try-tonight"><p><strong>Try This Tonight'
  );
  html = html.replace(
    /(<blockquote>\s*<p><strong>Real Parent, Real Story)/g,
    '<blockquote class="real-story"><p><strong>Real Parent, Real Story'
  );
  html = html.replace(
    /(<blockquote>\s*<p><em>"[^]*?<\/em><\/p>\s*<\/blockquote>)/g,
    (m) => m.replace("<blockquote>", '<blockquote class="pull-quote">')
  );
  return html;
}

// ---------------------------------------------------------------------------
// 3. Build the full HTML — A4 page-aware, edge-to-edge background
// ---------------------------------------------------------------------------
function buildHTML(bodyHTML) {
  const interB64 = fontToDataURI("_fonts/inter-latin.woff2");
  const playfairNormalB64 = fontToDataURI("_fonts/playfair-normal-latin.woff2");
  const playfairItalicB64 = fontToDataURI("_fonts/playfair-italic-latin.woff2");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>The Talent Discovery Blueprint</title>
  <style>
    /* ================================================================ */
    /* EMBEDDED FONTS — Base64 data URIs (guaranteed in PDF output)    */
    /* ================================================================ */
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: 300;
      src: url(${interB64}) format('woff2');
    }
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: 400;
      src: url(${interB64}) format('woff2');
    }
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: 500;
      src: url(${interB64}) format('woff2');
    }
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: 600;
      src: url(${interB64}) format('woff2');
    }
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: 700;
      src: url(${interB64}) format('woff2');
    }
    @font-face {
      font-family: 'Playfair Display';
      font-style: normal;
      font-weight: 400;
      src: url(${playfairNormalB64}) format('woff2');
    }
    @font-face {
      font-family: 'Playfair Display';
      font-style: normal;
      font-weight: 600;
      src: url(${playfairNormalB64}) format('woff2');
    }
    @font-face {
      font-family: 'Playfair Display';
      font-style: normal;
      font-weight: 700;
      src: url(${playfairNormalB64}) format('woff2');
    }
    @font-face {
      font-family: 'Playfair Display';
      font-style: normal;
      font-weight: 800;
      src: url(${playfairNormalB64}) format('woff2');
    }
    @font-face {
      font-family: 'Playfair Display';
      font-style: italic;
      font-weight: 400;
      src: url(${playfairItalicB64}) format('woff2');
    }
    @font-face {
      font-family: 'Playfair Display';
      font-style: italic;
      font-weight: 600;
      src: url(${playfairItalicB64}) format('woff2');
    }

    /* ================================================================ */
    /* Heritage Warmth — A4 Edge-to-Edge Editorial Layout               */
    /* ================================================================ */

    :root {
      --surface:      #F5F2E9;
      --surface-alt:  #EDE9DF;
      --fg:           #2D2926;
      --fg-secondary: #5E5954;
      --fg-muted:     #8C8782;
      --border:       #DCD8CB;
      --accent:       #7D6B3D;
      --accent-dark:  #4A3F24;
      --terra:        #C17B5D;
      --sage:         #7C9A72;
      --r-sm: 4px;
      --r-md: 8px;
      --r-lg: 12px;
      /* Page padding baked into content — no Playwright margins */
      --page-px: 72px;   /* ~1 inch horizontal */
      --page-py: 64px;   /* vertical */
    }

    *, *::before, *::after { box-sizing: border-box; }

    @page {
      size: A4;
      margin: 0;
    }

    html {
      font-size: 15px;
    }

    body {
      background: var(--surface);
      color: var(--fg);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 0.9rem;
      line-height: 1.78;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      -webkit-font-smoothing: antialiased;
    }

    /* ================================================================ */
    /* COVER PAGE — full bleed                                          */
    /* ================================================================ */
    .cover-page {
      width: 100%;
      min-height: 100vh;
      background: var(--surface);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 80px var(--page-px);
      position: relative;
      page-break-after: always;
    }
    .cover-page::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 6px;
      background: var(--terra);
    }
    .cover-pre-title {
      font-family: 'Inter', sans-serif;
      font-size: 0.65rem;
      font-weight: 600;
      letter-spacing: 6px;
      text-transform: uppercase;
      color: var(--terra);
      margin: 0 0 12px;
    }
    .cover-page h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-weight: 700;
      font-size: 2.8rem;
      line-height: 1.08;
      color: var(--fg);
      margin: 0 0 20px;
      border: none;
      padding: 0;
    }
    .cover-divider {
      width: 60px;
      height: 2px;
      background: var(--terra);
      margin: 0 auto 20px;
    }
    .cover-subtitle {
      font-family: 'Inter', sans-serif;
      font-size: 0.9rem;
      color: var(--fg-secondary);
      line-height: 1.6;
      margin: 0 0 32px;
      max-width: 340px;
    }
    .cover-author {
      font-family: 'Inter', sans-serif;
      font-size: 0.7rem;
      color: var(--accent);
      font-weight: 600;
      letter-spacing: 3px;
      text-transform: uppercase;
      margin: 0;
    }
    .cover-footer {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      background: var(--accent);
      color: var(--surface);
      font-family: 'Inter', sans-serif;
      font-size: 0.65rem;
      font-weight: 500;
      text-align: center;
      padding: 14px var(--page-px);
      letter-spacing: 0.03em;
    }

    /* ================================================================ */
    /* TABLE OF CONTENTS                                                */
    /* ================================================================ */
    .toc-page {
      padding: 60px var(--page-px) 40px;
      page-break-after: always;
    }
    .toc-page h2 {
      font-family: 'Playfair Display', Georgia, serif;
      font-weight: 700;
      text-align: center;
      font-size: 1.4rem;
      color: var(--fg);
      margin: 0 0 28px;
      border: none;
      padding: 0;
    }
    .toc-entry {
      display: flex;
      align-items: baseline;
      padding: 6px 0;
      border-bottom: 1px dotted var(--border);
    }
    .toc-entry .toc-title {
      font-size: 0.82rem;
      color: var(--fg);
    }
    .toc-entry .toc-part {
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: var(--terra);
      padding-top: 12px;
    }
    .toc-entry.part-header {
      border-bottom: 1.5px solid var(--border);
      margin-top: 8px;
    }

    /* ================================================================ */
    /* CONTENT CONTAINER                                                */
    /* ================================================================ */
    .book-container {
      padding: 0 var(--page-px);
      overflow-wrap: break-word;
      word-wrap: break-word;
    }

    /* ================================================================ */
    /* CHAPTERS                                                         */
    /* ================================================================ */
    section.chapter {
      page-break-before: always;
      padding-top: var(--page-py);
      padding-bottom: 20px;
    }
    section.chapter:first-child {
      page-break-before: avoid;
    }

    /* ================================================================ */
    /* TYPOGRAPHY                                                       */
    /* ================================================================ */

    h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-weight: 700;
      font-size: 1.7rem;
      color: var(--fg);
      margin: 0 0 16px;
      line-height: 1.2;
      padding-bottom: 10px;
      border-bottom: 2px solid var(--border);
      page-break-after: avoid;
    }

    h2 {
      font-family: 'Playfair Display', Georgia, serif;
      font-weight: 700;
      font-size: 1.15rem;
      color: var(--accent);
      margin: 32px 0 8px;
      line-height: 1.3;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--border);
      page-break-after: avoid;
    }
    section.chapter > h2:first-child {
      margin-top: 0;
    }

    h3 {
      font-family: 'Playfair Display', Georgia, serif;
      font-weight: 700;
      font-size: 1rem;
      color: var(--terra);
      margin: 24px 0 6px;
      page-break-after: avoid;
    }

    h4 {
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-size: 0.78rem;
      color: var(--accent);
      margin: 18px 0 4px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      page-break-after: avoid;
    }

    p {
      margin: 0 0 0.75em;
      orphans: 3;
      widows: 3;
    }

    strong { color: var(--fg); font-weight: 600; }
    em { font-style: italic; color: var(--fg-secondary); }

    a {
      color: var(--accent);
      text-decoration: underline;
      text-decoration-color: var(--border);
      text-underline-offset: 3px;
    }

    hr {
      border: none;
      height: 1px;
      background: var(--border);
      margin: 24px 48px;
    }

    /* ---- Lists ---- */
    ul, ol {
      margin: 0 0 0.85em;
      padding-left: 1.4em;
    }
    ul { list-style: none; padding-left: 0; }
    ul > li {
      position: relative;
      padding-left: 1.15em;
      margin-bottom: 0.35em;
    }
    ul > li::before {
      content: '';
      position: absolute;
      left: 0; top: 0.6em;
      width: 5px; height: 5px;
      border-radius: 50%;
      background: var(--terra);
    }
    ol > li { margin-bottom: 0.35em; }
    ol > li::marker { color: var(--accent); font-weight: 600; }

    /* ================================================================ */
    /* BLOCKQUOTES & CALLOUT BOXES                                      */
    /* ================================================================ */

    blockquote {
      background: var(--surface-alt);
      border-left: 3px solid var(--terra);
      border-radius: 0 var(--r-md) var(--r-md) 0;
      padding: 14px 18px;
      margin: 18px 0;
      font-size: 0.82rem;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    blockquote p { margin-bottom: 0.35em; }
    blockquote p:last-child { margin-bottom: 0; }

    /* Pull-quote */
    blockquote.pull-quote {
      background: transparent;
      border-left: 3px solid var(--terra);
      padding: 12px 20px;
    }
    blockquote.pull-quote p em {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 0.95rem;
      line-height: 1.6;
      color: var(--fg-secondary);
    }

    /* Try This Tonight */
    blockquote.try-tonight,
    blockquote blockquote {
      background: #FAF5EE;
      border: 1px solid var(--terra);
      border-left-width: 4px;
      border-radius: var(--r-md);
      padding: 16px 18px;
    }
    blockquote.try-tonight > p:first-child strong,
    blockquote blockquote > p:first-child strong {
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--terra);
      display: block;
      margin-bottom: 2px;
    }

    /* Real Parent, Real Story */
    blockquote.real-story {
      background: var(--surface-alt);
      border-left: 3px solid var(--sage);
    }
    blockquote.real-story > p:first-child strong {
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--sage);
      display: block;
      margin-bottom: 2px;
    }

    blockquote blockquote { margin: 10px 0 0; }

    /* ================================================================ */
    /* TABLES                                                           */
    /* ================================================================ */
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin: 16px 0;
      font-size: 0.78rem;
      border-radius: var(--r-md);
      overflow: hidden;
      border: 1px solid var(--border);
      table-layout: fixed;
      page-break-inside: auto;
    }
    thead {
      background: var(--accent);
      color: var(--surface);
      display: table-header-group;
    }
    th {
      padding: 8px 12px;
      text-align: left;
      font-weight: 700;
      font-size: 0.72rem;
      letter-spacing: 0.03em;
    }
    td {
      padding: 7px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
      overflow-wrap: break-word;
    }
    tbody tr:nth-child(even) { background: rgba(232,228,216,0.45); }
    tbody tr:last-child td { border-bottom: none; }
    tr { page-break-inside: avoid; }

    blockquote table { background: transparent; }

    td:has(input[type="checkbox"]) { text-align: center; }

    /* ================================================================ */
    /* IMAGES                                                           */
    /* ================================================================ */
    .book-figure {
      margin: 20px 0;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .book-figure img {
      border-radius: var(--r-md);
      box-shadow: 0 2px 12px rgba(0,0,0,0.05);
      max-width: 100%;
      height: auto;
      max-height: 360px;
    }

    /* ================================================================ */
    /* CODE                                                             */
    /* ================================================================ */
    code {
      background: var(--surface-alt);
      padding: 1px 4px;
      border-radius: var(--r-sm);
      font-size: 0.85em;
      color: var(--accent);
    }
    pre {
      background: var(--surface-alt);
      padding: 12px;
      border-radius: var(--r-md);
      overflow-x: auto;
      font-size: 0.78rem;
      page-break-inside: avoid;
    }

    /* ================================================================ */
    /* PRINT RULES                                                      */
    /* ================================================================ */
    @media print {
      html { font-size: 14px; }
      body { font-size: 0.85rem; line-height: 1.72; }

      .book-container { padding: 0 var(--page-px); }

      h1, h2, h3, h4 {
        page-break-after: avoid;
        break-after: avoid;
      }
      h1 + *, h2 + *, h3 + *, h4 + * {
        page-break-before: avoid;
        break-before: avoid;
      }

      blockquote, .book-figure {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      ul, ol { page-break-inside: avoid; break-inside: avoid; }
      p { orphans: 3; widows: 3; }

      /* Keep heading + next content together */
      h1, h2, h3, h4 { break-after: avoid-page; }

      /* Hide spacers injected by pagination engine — they're only for
         controlling layout in the continuous viewport; print uses
         break-after/before natively. We keep them visible so the
         continuous-scroll layout matches the printed layout. */
    }

    /* Pagination engine spacer — invisible background */
    .page-push-spacer, .page-split-spacer {
      background: transparent;
      border: none;
      padding: 0;
      margin: 0;
    }

    /* ================================================================ */
    /* MOBILE RESPONSIVE (for HTML ebook viewing)                       */
    /* ================================================================ */
    @media screen and (max-width: 768px) {
      :root { --page-px: 20px; --page-py: 32px; }
      html { font-size: 15px; }
      .cover-page { padding: 48px 20px; }
      .cover-page h1 { font-size: 2rem; }
      h1 { font-size: 1.4rem; }
      h2 { font-size: 1.05rem; }
      table { font-size: 0.72rem; }
      th, td { padding: 5px 8px; }
      .book-figure img { max-height: 260px; }
    }

    @media screen and (max-width: 480px) {
      :root { --page-px: 16px; }
      html { font-size: 14px; }
      .cover-page h1 { font-size: 1.65rem; }
      h1 { font-size: 1.25rem; }
      table { font-size: 0.68rem; }
      th, td { padding: 4px 6px; }
    }
  </style>
</head>
<body>

  <!-- COVER -->
  <div class="cover-page">
    <p class="cover-pre-title">The</p>
    <h1>Talent Discovery<br/>Blueprint</h1>
    <div class="cover-divider"></div>
    <p class="cover-subtitle">How to Identify and Nurture Your Child's Hidden Genius (Ages 0–10)</p>
    <p class="cover-author">Amelia Sorrell</p>
    <div class="cover-footer">A Practical Guide for Parents Who Want to See Their Child Clearly</div>
  </div>

  <!-- TABLE OF CONTENTS -->
  <div class="toc-page">
    <h2>Contents</h2>

    <div class="toc-entry">
      <span class="toc-title">Introduction: The Myth of the "Gifted" Child</span>
    </div>

    <div class="toc-entry part-header">
      <span class="toc-part">Part 1: The Talent Discovery Framework</span>
    </div>
    <div class="toc-entry"><span class="toc-title" style="padding-left:1.25em;">Chapter 1: The Observer Parent Method</span></div>
    <div class="toc-entry"><span class="toc-title" style="padding-left:1.25em;">Chapter 2: Decoding Playtime</span></div>
    <div class="toc-entry"><span class="toc-title" style="padding-left:1.25em;">Chapter 3: The 8 Types of Intelligence</span></div>

    <div class="toc-entry part-header">
      <span class="toc-part">Part 2: Age-Specific Identification Guides</span>
    </div>
    <div class="toc-entry"><span class="toc-title" style="padding-left:1.25em;">Chapter 4: Ages 0–3 — The Foundation Years</span></div>
    <div class="toc-entry"><span class="toc-title" style="padding-left:1.25em;">Chapter 5: Ages 4–6 — The Exploration Explosion</span></div>
    <div class="toc-entry"><span class="toc-title" style="padding-left:1.25em;">Chapter 6: Ages 7–10 — Passion Takes Shape</span></div>

    <div class="toc-entry part-header">
      <span class="toc-part">Part 3: Nurturing Without Pressure</span>
    </div>
    <div class="toc-entry"><span class="toc-title" style="padding-left:1.25em;">Chapter 7: Growing a Growth Mindset at Home</span></div>
    <div class="toc-entry"><span class="toc-title" style="padding-left:1.25em;">Chapter 8: Talent Stations</span></div>
    <div class="toc-entry"><span class="toc-title" style="padding-left:1.25em;">Chapter 9: When It Stops Being Fun</span></div>

    <div class="toc-entry part-header">
      <span class="toc-part">Part 4: The Parent's Action Plan</span>
    </div>
    <div class="toc-entry"><span class="toc-title" style="padding-left:1.25em;">Chapter 10: Your 30-Day Talent Discovery Schedule</span></div>
    <div class="toc-entry"><span class="toc-title" style="padding-left:1.25em;">Chapter 11: Budget-Friendly Talent Exploration</span></div>

    <div class="toc-entry" style="margin-top:10px; border-bottom:none;">
      <span class="toc-title">Closing: A Letter to the Parent</span>
    </div>
    <div class="toc-entry" style="border-bottom:none;">
      <span class="toc-title">Appendix</span>
    </div>
  </div>

  <!-- BOOK CONTENT -->
  <div class="book-container">
    ${bodyHTML}
  </div>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 4. Visual QA
// ---------------------------------------------------------------------------
async function visualQA(page) {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const overflows = await page.evaluate(() => {
    const r = [];
    document.querySelectorAll("*").forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 2 && el.tagName !== "HTML" && el.tagName !== "BODY") {
        const s = window.getComputedStyle(el);
        if (s.overflow !== "hidden" && s.overflowX !== "hidden")
          r.push({ tag: el.tagName, cls: el.className?.substring(0,40), diff: el.scrollWidth - el.clientWidth });
      }
    });
    return r.slice(0,10);
  });

  if (overflows.length) {
    console.log("  OVERFLOW ISSUES:");
    overflows.forEach((o) => console.log(`    <${o.tag}.${o.cls}> +${o.diff}px`));
  } else {
    console.log("  No overflow issues.");
  }

  // Screenshots at A4 viewport
  for (const p of [1, 2, 3, 5, 8, 12, 20]) {
    await page.evaluate((y) => window.scrollTo(0, y), (p - 1) * A4_H);
    await page.waitForTimeout(100);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `qa_p${String(p).padStart(2,"0")}.png`),
    });
  }
  console.log("  QA screenshots saved.");
}

// ---------------------------------------------------------------------------
// 5. Generate PDF — A4, zero margins, background enabled
// ---------------------------------------------------------------------------
async function generatePDF(html) {
  console.log("\nLaunching browser...");
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setViewportSize({ width: A4_W, height: A4_H });
  await page.setContent(html, { waitUntil: "networkidle", timeout: 120000 });

  // Force-load all font variants we need
  console.log("Force-loading fonts...");
  const fontStatus = await page.evaluate(async () => {
    const fontsToLoad = [
      ["300 1em Inter", "ABCabc"],
      ["400 1em Inter", "ABCabc"],
      ["500 1em Inter", "ABCabc"],
      ["600 1em Inter", "ABCabc"],
      ["700 1em Inter", "ABCabc"],
      ["400 1em 'Playfair Display'", "ABCabc"],
      ["600 1em 'Playfair Display'", "ABCabc"],
      ["700 1em 'Playfair Display'", "ABCabc"],
      ["800 1em 'Playfair Display'", "ABCabc"],
      ["italic 400 1em 'Playfair Display'", "ABCabc"],
      ["italic 600 1em 'Playfair Display'", "ABCabc"],
    ];
    const results = [];
    for (const [spec, text] of fontsToLoad) {
      try {
        const faces = await document.fonts.load(spec, text);
        results.push({ spec, loaded: faces.length });
      } catch (e) {
        results.push({ spec, error: e.message });
      }
    }
    await document.fonts.ready;
    const loaded = [];
    document.fonts.forEach(f => {
      if (f.status === "loaded") loaded.push(`${f.family} ${f.weight} ${f.style}`);
    });
    return { results, loaded };
  });
  console.log(`  ${fontStatus.loaded.length} font faces loaded:`);
  fontStatus.loaded.forEach(f => console.log(`    ${f}`));

  await page.waitForTimeout(1000); // let layout settle after font load

  // =====================================================================
  // PAGINATION ENGINE — Multi-pass, Gamma-style block-aware layout
  // =====================================================================
  console.log("Running pagination engine...");

  // Pass 1: Split oversized TABLES at row boundaries (repeat headers)
  console.log("  Pass 1: Splitting oversized tables...");
  const tableSplits = await page.evaluate((pageH) => {
    const log = [];
    const maxBlockH = pageH * 0.82; // leave breathing room

    // Keep splitting until no table exceeds max height (handles recursive splits)
    let changed = true;
    while (changed) {
      changed = false;
      document.querySelectorAll("table").forEach(table => {
        const h = table.getBoundingClientRect().height;
        if (h <= maxBlockH) return;

        const thead = table.querySelector("thead");
        const tbody = table.querySelector("tbody");
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll(":scope > tr"));
        if (rows.length < 2) return;

        const theadH = thead ? thead.getBoundingClientRect().height : 0;
        const targetH = maxBlockH - theadH - 20; // 20px safety
        let cumH = 0;
        let splitAt = 0;

        for (let i = 0; i < rows.length; i++) {
          cumH += rows[i].getBoundingClientRect().height;
          if (cumH > targetH && i > 0) { splitAt = i; break; }
        }
        if (splitAt === 0) splitAt = Math.ceil(rows.length / 2);

        // Build continuation table
        const newTable = document.createElement("table");
        // Copy all classes and attributes
        for (const attr of table.attributes) {
          newTable.setAttribute(attr.name, attr.value);
        }
        if (thead) newTable.appendChild(thead.cloneNode(true));
        const newTbody = document.createElement("tbody");
        for (let i = splitAt; i < rows.length; i++) {
          newTbody.appendChild(rows[i]); // move, not clone
        }
        newTable.appendChild(newTbody);

        // Insert a page-break spacer + continuation table after original
        const spacer = document.createElement("div");
        spacer.style.breakBefore = "page";
        spacer.style.pageBreakBefore = "always";
        spacer.className = "page-split-spacer";

        // If table is inside a blockquote, split the blockquote too
        const parent = table.parentNode;
        if (parent.tagName === "BLOCKQUOTE") {
          // Clone the blockquote wrapper for continuation
          const newBQ = document.createElement("blockquote");
          for (const attr of parent.attributes) {
            newBQ.setAttribute(attr.name, attr.value);
          }
          // Move everything after the original table into the new blockquote
          const siblingsAfter = [];
          let sib = table.nextSibling;
          while (sib) {
            siblingsAfter.push(sib);
            sib = sib.nextSibling;
          }
          siblingsAfter.forEach(s => newBQ.appendChild(s));
          newBQ.insertBefore(newTable, newBQ.firstChild);

          // Add a continuation label
          const contLabel = document.createElement("p");
          contLabel.innerHTML = "<em>(continued)</em>";
          contLabel.style.fontSize = "0.7rem";
          contLabel.style.color = "#8C8782";
          contLabel.style.marginBottom = "6px";
          newBQ.insertBefore(contLabel, newBQ.firstChild);

          parent.parentNode.insertBefore(spacer, parent.nextSibling);
          parent.parentNode.insertBefore(newBQ, spacer.nextSibling);
        } else {
          parent.insertBefore(spacer, table.nextSibling);
          parent.insertBefore(newTable, spacer.nextSibling);
        }

        log.push(`Split table (${rows.length + (rows.length - splitAt)} → ${splitAt} + ${rows.length - splitAt + (rows.length - splitAt)} rows, header repeated)`);
        changed = true;
      });
    }
    return log;
  }, A4_H);
  tableSplits.forEach(m => console.log(`    ${m}`));

  await page.waitForTimeout(300);

  // Pass 2: Split oversized LISTS at item boundaries
  console.log("  Pass 2: Splitting oversized lists...");
  const listSplits = await page.evaluate((pageH) => {
    const log = [];
    const maxBlockH = pageH * 0.82;

    document.querySelectorAll("ul, ol").forEach(list => {
      const h = list.getBoundingClientRect().height;
      if (h <= maxBlockH) return;

      const items = Array.from(list.querySelectorAll(":scope > li"));
      if (items.length < 2) return;

      const targetH = maxBlockH - 20;
      let cumH = 0;
      let splitAt = 0;

      for (let i = 0; i < items.length; i++) {
        cumH += items[i].getBoundingClientRect().height;
        if (cumH > targetH && i > 0) { splitAt = i; break; }
      }
      if (splitAt === 0) return;

      const newList = document.createElement(list.tagName);
      for (const attr of list.attributes) {
        newList.setAttribute(attr.name, attr.value);
      }
      // If ordered list, continue numbering
      if (list.tagName === "OL") newList.setAttribute("start", String(splitAt + 1));

      for (let i = splitAt; i < items.length; i++) {
        newList.appendChild(items[i]);
      }

      const spacer = document.createElement("div");
      spacer.style.breakBefore = "page";
      spacer.style.pageBreakBefore = "always";
      spacer.className = "page-split-spacer";

      list.parentNode.insertBefore(spacer, list.nextSibling);
      list.parentNode.insertBefore(newList, spacer.nextSibling);

      log.push(`Split ${list.tagName} (${items.length + newList.children.length} items → ${list.children.length} + ${newList.children.length})`);
    });
    return log;
  }, A4_H);
  listSplits.forEach(m => console.log(`    ${m}`));

  await page.waitForTimeout(300);

  // Pass 3: Split oversized BLOCKQUOTES that don't contain tables
  // (table-containing ones were handled in Pass 1)
  console.log("  Pass 3: Splitting oversized blockquotes...");
  const bqSplits = await page.evaluate((pageH) => {
    const log = [];
    const maxBlockH = pageH * 0.82;

    document.querySelectorAll("blockquote").forEach(bq => {
      const h = bq.getBoundingClientRect().height;
      if (h <= maxBlockH) return;
      if (bq.querySelector("table")) return; // already handled

      const children = Array.from(bq.children);
      if (children.length < 2) return;

      const targetH = maxBlockH - 20;
      let cumH = 0;
      let splitAt = 0;

      for (let i = 0; i < children.length; i++) {
        cumH += children[i].getBoundingClientRect().height;
        if (cumH > targetH && i > 0) { splitAt = i; break; }
      }
      if (splitAt === 0) return;

      const newBQ = document.createElement("blockquote");
      for (const attr of bq.attributes) {
        newBQ.setAttribute(attr.name, attr.value);
      }

      const contLabel = document.createElement("p");
      contLabel.innerHTML = "<em>(continued)</em>";
      contLabel.style.fontSize = "0.7rem";
      contLabel.style.color = "#8C8782";
      contLabel.style.marginBottom = "6px";
      newBQ.appendChild(contLabel);

      for (let i = splitAt; i < children.length; i++) {
        newBQ.appendChild(children[i]);
      }

      const spacer = document.createElement("div");
      spacer.style.breakBefore = "page";
      spacer.style.pageBreakBefore = "always";

      bq.parentNode.insertBefore(spacer, bq.nextSibling);
      bq.parentNode.insertBefore(newBQ, spacer.nextSibling);

      log.push(`Split blockquote "${bq.textContent?.substring(0,40)}..." (${Math.round(h)}px → 2 blocks)`);
    });
    return log;
  }, A4_H);
  bqSplits.forEach(m => console.log(`    ${m}`));

  await page.waitForTimeout(300);

  // Pass 4: Push orphaned elements using physical DOM spacers
  // Single top-to-bottom sweep with fresh measurements after each fix.
  // Spacers only push content downward, so already-processed elements stay put.
  console.log("  Pass 4: Fixing boundary orphans (top-to-bottom sweep)...");
  const orphanFixes = await page.evaluate((pageH) => {
    const log = [];

    // Gather all fixable elements into a single list, sorted top-to-bottom
    const allEls = [
      ...document.querySelectorAll("h1, h2, h3, h4, blockquote, .book-figure"),
    ];
    // Initial sort by position
    allEls.sort((a, b) => {
      return (a.getBoundingClientRect().top + window.scrollY)
           - (b.getBoundingClientRect().top + window.scrollY);
    });

    for (const el of allEls) {
      // Fresh measurement (positions shift as spacers are inserted above)
      const rect = el.getBoundingClientRect();
      const absTop = rect.top + window.scrollY;
      const absBottom = rect.bottom + window.scrollY;
      const height = absBottom - absTop;
      const pageNum = Math.floor(absTop / pageH);
      const pageBottom = (pageNum + 1) * pageH;

      // Skip if element doesn't cross a page boundary
      if (absBottom <= pageBottom || absTop >= pageBottom) continue;

      const tag = el.tagName;
      const isHeading = ["H1","H2","H3","H4"].includes(tag);
      const isBlockquote = tag === "BLOCKQUOTE";
      const isFigure = el.classList.contains("book-figure");

      if (isHeading) {
        // Push heading to next page if it's near the bottom (orphan risk)
        const distFromBottom = pageBottom - absTop;
        if (distFromBottom < 160) {
          const spacer = document.createElement("div");
          spacer.className = "page-push-spacer";
          spacer.style.height = Math.ceil(distFromBottom) + "px";
          el.parentNode.insertBefore(spacer, el);
          log.push(`Pushed <${tag}> "${el.textContent?.substring(0,50)}" (${Math.round(distFromBottom)}px spacer)`);
        }
      } else if ((isBlockquote || isFigure) && height < pageH * 0.82) {
        // Element fits on one page but crosses boundary — push to next page
        const spacerH = pageBottom - absTop;
        const spacer = document.createElement("div");
        spacer.className = "page-push-spacer";
        spacer.style.height = Math.ceil(spacerH) + "px";
        el.parentNode.insertBefore(spacer, el);

        const label = isBlockquote
          ? `blockquote "${el.textContent?.substring(0,35)}..."`
          : `image "${el.querySelector("img")?.alt?.substring(0,40)}"`;
        log.push(`Pushed ${label} (${Math.round(spacerH)}px spacer)`);
      }
    }

    return log;
  }, A4_H);
  orphanFixes.forEach(m => console.log(`    ${m}`));

  await page.waitForTimeout(500);

  // Pass 5: Final verification — count remaining issues
  console.log("  Pass 5: Verifying...");
  const remaining = await page.evaluate((pageH) => {
    const issues = [];
    const totalPages = Math.ceil(document.body.scrollHeight / pageH);

    for (let pg = 1; pg <= totalPages; pg++) {
      const pageBottom = pg * pageH;

      document.querySelectorAll("h1, h2, h3, h4").forEach(h => {
        const absTop = h.getBoundingClientRect().top + window.scrollY;
        const absBottom = h.getBoundingClientRect().bottom + window.scrollY;
        if (absTop < pageBottom && absBottom > pageBottom) {
          issues.push(`P${pg}: <${h.tagName}> "${h.textContent?.substring(0,40)}" SPLIT`);
        }
      });

      document.querySelectorAll("blockquote").forEach(bq => {
        const absTop = bq.getBoundingClientRect().top + window.scrollY;
        const absBottom = bq.getBoundingClientRect().bottom + window.scrollY;
        if (absTop < pageBottom && absBottom > pageBottom && (absBottom - absTop) < pageH * 0.8) {
          issues.push(`P${pg}: blockquote "${bq.textContent?.substring(0,30)}..." SPLIT (${Math.round(absBottom - absTop)}px)`);
        }
      });
    }
    return issues;
  }, A4_H);

  if (remaining.length === 0) {
    console.log("    All clear — no split elements remain.");
  } else {
    console.log(`    ${remaining.length} minor issues remain:`);
    remaining.forEach(r => console.log(`      ${r}`));
  }

  console.log("Running visual QA...");
  await visualQA(page);

  console.log("\nGenerating PDF (A4, background OFF)...");
  await page.pdf({
    path: OUTPUT_FILE,
    format: "A4",
    printBackground: false,
    margin: { top: "0.26in", right: "0", bottom: "0.29in", left: "0" },
    displayHeaderFooter: false,
  });

  await browser.close();

  // Verify file
  if (fs.existsSync(OUTPUT_FILE)) {
    const size = fs.statSync(OUTPUT_FILE).size;
    console.log(`PDF saved: ${OUTPUT_FILE} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    console.error("ERROR: PDF file was not created!");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=".repeat(60));
  console.log("  The Talent Discovery Blueprint — PDF Compiler v3");
  console.log("  Format: A4 | Margins: T=0.26in B=0.29in | Background: OFF");
  console.log("=".repeat(60));

  const files = getMarkdownFiles();
  console.log(`\nFound ${files.length} markdown files.`);

  console.log("Parsing markdown & embedding images...");
  let bodyHTML = parseMarkdown(files);

  console.log("Post-processing HTML...");
  bodyHTML = postProcessHTML(bodyHTML);

  const fullHTML = buildHTML(bodyHTML);
  fs.writeFileSync(HTML_FILE, fullHTML, "utf-8");
  console.log(`HTML saved: ${HTML_FILE}`);

  await generatePDF(fullHTML);

  console.log("\n" + "=".repeat(60));
  console.log("  Done!");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
