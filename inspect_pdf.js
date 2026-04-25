const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_DIR = __dirname;
const HTML_FILE = path.join(BASE_DIR, "_compiled.html");
const SCREENSHOT_DIR = path.join(BASE_DIR, "_screenshots");

async function inspect() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const html = fs.readFileSync(HTML_FILE, "utf-8");
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Set viewport to approximate a PDF letter page at 96dpi
  await page.setViewportSize({ width: 816, height: 1056 });
  await page.setContent(html, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);

  // Take full-page screenshot first
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "full_page.png"),
    fullPage: true,
  });
  console.log("Full page screenshot saved");

  // Get total document height
  const docHeight = await page.evaluate(() => document.body.scrollHeight);
  console.log(`Document height: ${docHeight}px`);

  // Take viewport-sized screenshots page by page
  const pageHeight = 1056;
  const totalPages = Math.ceil(docHeight / pageHeight);
  console.log(`Estimated ${totalPages} pages`);

  for (let i = 0; i < Math.min(totalPages, 20); i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * pageHeight);
    await page.waitForTimeout(200);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `page_${String(i + 1).padStart(2, "0")}.png`),
    });
    console.log(`Screenshot page ${i + 1}`);
  }

  // Check for overflow issues
  const overflowIssues = await page.evaluate(() => {
    const issues = [];
    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      // Check horizontal overflow
      if (el.scrollWidth > el.clientWidth + 2 && style.overflow !== "hidden" && style.overflowX !== "hidden") {
        if (el.tagName !== "HTML" && el.tagName !== "BODY") {
          issues.push({
            tag: el.tagName,
            class: el.className,
            text: el.textContent?.substring(0, 60),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          });
        }
      }
    }
    return issues.slice(0, 20);
  });

  if (overflowIssues.length > 0) {
    console.log("\n--- OVERFLOW ISSUES ---");
    overflowIssues.forEach((issue, i) => {
      console.log(`${i + 1}. <${issue.tag} class="${issue.class}"> scrollW=${issue.scrollWidth} clientW=${issue.clientWidth}`);
      console.log(`   Text: ${issue.text}`);
    });
  } else {
    console.log("\nNo horizontal overflow issues found.");
  }

  // Check for elements that are too wide
  const wideElements = await page.evaluate(() => {
    const bodyWidth = document.body.clientWidth;
    const issues = [];
    const els = document.querySelectorAll("table, figure, blockquote, pre, img");
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.width > bodyWidth) {
        issues.push({
          tag: el.tagName,
          class: el.className,
          width: Math.round(rect.width),
          bodyWidth,
        });
      }
    }
    return issues;
  });

  if (wideElements.length > 0) {
    console.log("\n--- ELEMENTS WIDER THAN BODY ---");
    wideElements.forEach((issue, i) => {
      console.log(`${i + 1}. <${issue.tag}> width=${issue.width} body=${issue.bodyWidth}`);
    });
  }

  // Check section/chapter structure
  const sectionInfo = await page.evaluate(() => {
    const sections = document.querySelectorAll("section.chapter");
    return Array.from(sections).map((s, i) => {
      const h1 = s.querySelector("h1");
      const h2 = s.querySelector("h2");
      const rect = s.getBoundingClientRect();
      return {
        index: i,
        title: h1?.textContent?.substring(0, 60) || h2?.textContent?.substring(0, 60) || "(no heading)",
        height: Math.round(rect.height),
        top: Math.round(rect.top + window.scrollY),
      };
    });
  });

  console.log("\n--- SECTION STRUCTURE ---");
  sectionInfo.forEach((s) => {
    console.log(`  ${s.index + 1}. "${s.title}" — height: ${s.height}px, top: ${s.top}px`);
  });

  // Check blockquote/callout sizes
  const calloutInfo = await page.evaluate(() => {
    const bqs = document.querySelectorAll("blockquote");
    return Array.from(bqs).slice(0, 10).map((bq) => {
      const rect = bq.getBoundingClientRect();
      const firstText = bq.querySelector("p")?.textContent?.substring(0, 50);
      return {
        text: firstText,
        height: Math.round(rect.height),
        width: Math.round(rect.width),
      };
    });
  });

  console.log("\n--- CALLOUT BOXES (first 10) ---");
  calloutInfo.forEach((c, i) => {
    console.log(`  ${i + 1}. h=${c.height}px w=${c.width}px "${c.text}"`);
  });

  await browser.close();
  console.log("\nDone. Check _screenshots/ folder.");
}

inspect().catch(console.error);
