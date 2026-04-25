const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_DIR = __dirname;
const HTML_FILE = path.join(BASE_DIR, "_compiled.html");
const SCREENSHOT_DIR = path.join(BASE_DIR, "_screenshots");

// A4 at 96 DPI
const A4_W = 794;
const A4_H = 1123;

async function audit() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const html = fs.readFileSync(HTML_FILE, "utf-8");
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setViewportSize({ width: A4_W, height: A4_H });
  await page.setContent(html, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(5000); // extra time for fonts

  // 1. CHECK FONT LOADING
  console.log("=== FONT AUDIT ===");
  const fontInfo = await page.evaluate(() => {
    const results = {};
    // Check what fonts are actually used
    const h1 = document.querySelector("h1");
    const p = document.querySelector("p");
    const body = document.body;

    if (h1) results.h1_font = window.getComputedStyle(h1).fontFamily;
    if (p) results.p_font = window.getComputedStyle(p).fontFamily;
    results.body_font = window.getComputedStyle(body).fontFamily;

    // Check document.fonts API
    const loadedFonts = [];
    if (document.fonts) {
      document.fonts.forEach(f => {
        loadedFonts.push(`${f.family} ${f.weight} ${f.style} [${f.status}]`);
      });
    }
    results.loadedFonts = loadedFonts;

    return results;
  });

  console.log("  H1 font:", fontInfo.h1_font);
  console.log("  P font:", fontInfo.p_font);
  console.log("  Body font:", fontInfo.body_font);
  console.log("  Loaded fonts:");
  fontInfo.loadedFonts.forEach(f => console.log("    ", f));

  // 2. GET TOTAL PAGES
  const docHeight = await page.evaluate(() => document.body.scrollHeight);
  const totalPages = Math.ceil(docHeight / A4_H);
  console.log(`\n=== PAGE AUDIT (${totalPages} pages) ===`);

  // 3. CHECK EVERY PAGE BOUNDARY FOR BROKEN SECTIONS
  const brokenSections = await page.evaluate((pageH) => {
    const issues = [];
    const totalPages = Math.ceil(document.body.scrollHeight / pageH);

    for (let pg = 1; pg <= totalPages; pg++) {
      const pageTop = (pg - 1) * pageH;
      const pageBottom = pg * pageH;

      // Check all headings
      document.querySelectorAll("h1, h2, h3, h4").forEach(h => {
        const rect = h.getBoundingClientRect();
        const absTop = rect.top + window.scrollY;
        const absBottom = rect.bottom + window.scrollY;

        // Heading split across page boundary
        if (absTop < pageBottom && absBottom > pageBottom) {
          issues.push({
            type: "heading-split",
            page: pg,
            tag: h.tagName,
            text: h.textContent?.substring(0, 60),
            position: Math.round(absTop),
          });
        }

        // Heading at very bottom of page (orphan - less than 80px from bottom)
        if (absTop > pageBottom - 80 && absTop < pageBottom) {
          const next = h.nextElementSibling;
          if (next) {
            const nextRect = next.getBoundingClientRect();
            const nextAbsTop = nextRect.top + window.scrollY;
            if (nextAbsTop > pageBottom) {
              issues.push({
                type: "heading-orphan",
                page: pg,
                tag: h.tagName,
                text: h.textContent?.substring(0, 60),
                distFromBottom: Math.round(pageBottom - absTop),
              });
            }
          }
        }
      });

      // Check blockquotes split across page boundaries
      document.querySelectorAll("blockquote").forEach(bq => {
        const rect = bq.getBoundingClientRect();
        const absTop = rect.top + window.scrollY;
        const absBottom = rect.bottom + window.scrollY;

        if (absTop < pageBottom && absBottom > pageBottom && (absBottom - absTop) < 400) {
          issues.push({
            type: "callout-split",
            page: pg,
            text: bq.textContent?.substring(0, 50),
            height: Math.round(absBottom - absTop),
          });
        }
      });

      // Check images split across page boundaries
      document.querySelectorAll(".book-figure").forEach(fig => {
        const rect = fig.getBoundingClientRect();
        const absTop = rect.top + window.scrollY;
        const absBottom = rect.bottom + window.scrollY;

        if (absTop < pageBottom && absBottom > pageBottom) {
          issues.push({
            type: "image-split",
            page: pg,
            alt: fig.querySelector("img")?.alt?.substring(0, 40),
          });
        }
      });

      // Check tables split (header on one page, first row on next)
      document.querySelectorAll("table").forEach(tbl => {
        const thead = tbl.querySelector("thead");
        if (thead) {
          const theadRect = thead.getBoundingClientRect();
          const theadBottom = theadRect.bottom + window.scrollY;
          const firstRow = tbl.querySelector("tbody tr");
          if (firstRow) {
            const firstRowTop = firstRow.getBoundingClientRect().top + window.scrollY;
            // If thead ends near page bottom and first row starts on next page
            if (theadBottom > pageBottom - 40 && theadBottom < pageBottom && firstRowTop > pageBottom) {
              issues.push({
                type: "table-header-orphan",
                page: pg,
              });
            }
          }
        }
      });
    }

    return issues;
  }, A4_H);

  if (brokenSections.length === 0) {
    console.log("  No broken sections found!");
  } else {
    console.log(`  Found ${brokenSections.length} issues:`);
    brokenSections.forEach((issue, i) => {
      if (issue.type === "heading-split") {
        console.log(`  ${i+1}. PAGE ${issue.page}: <${issue.tag}> SPLIT across page break — "${issue.text}"`);
      } else if (issue.type === "heading-orphan") {
        console.log(`  ${i+1}. PAGE ${issue.page}: <${issue.tag}> ORPHANED at bottom (${issue.distFromBottom}px from edge) — "${issue.text}"`);
      } else if (issue.type === "callout-split") {
        console.log(`  ${i+1}. PAGE ${issue.page}: CALLOUT SPLIT (${issue.height}px) — "${issue.text}"`);
      } else if (issue.type === "image-split") {
        console.log(`  ${i+1}. PAGE ${issue.page}: IMAGE SPLIT — "${issue.alt}"`);
      } else if (issue.type === "table-header-orphan") {
        console.log(`  ${i+1}. PAGE ${issue.page}: TABLE HEADER orphaned at page bottom`);
      }
    });
  }

  // 4. SCREENSHOT EVERY PAGE
  console.log(`\n=== SCREENSHOTS (all ${totalPages} pages) ===`);
  for (let i = 0; i < totalPages; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * A4_H);
    await page.waitForTimeout(80);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `audit_p${String(i + 1).padStart(2, "0")}.png`),
    });
  }
  console.log(`  All ${totalPages} page screenshots saved.`);

  await browser.close();
  console.log("\nDone.");
}

audit().catch(console.error);
