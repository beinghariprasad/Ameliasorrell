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

  // --- Desktop viewport (PDF-like) ---
  const desktopPage = await browser.newPage();
  await desktopPage.setViewportSize({ width: 816, height: 1056 });
  await desktopPage.setContent(html, { waitUntil: "networkidle", timeout: 60000 });
  await desktopPage.waitForTimeout(2000);

  const docHeight = await desktopPage.evaluate(() => document.body.scrollHeight);
  const pageHeight = 1056;
  const totalPages = Math.ceil(docHeight / pageHeight);
  console.log(`Total estimated pages: ${totalPages}`);

  // Screenshot specific pages: cover, TOC, a table page, callout page, closing
  const desktopPages = [1, 2, 6, 8, 12, 18, 25, 35, 45, totalPages - 2, totalPages];
  for (const p of desktopPages) {
    if (p < 1 || p > totalPages) continue;
    await desktopPage.evaluate((y) => window.scrollTo(0, y), (p - 1) * pageHeight);
    await desktopPage.waitForTimeout(150);
    await desktopPage.screenshot({
      path: path.join(SCREENSHOT_DIR, `final_desktop_p${String(p).padStart(2, "0")}.png`),
    });
    console.log(`Desktop page ${p}`);
  }

  // --- Mobile viewport (ebook) ---
  const mobilePage = await browser.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 }); // iPhone 14
  await mobilePage.setContent(html, { waitUntil: "networkidle", timeout: 60000 });
  await mobilePage.waitForTimeout(2000);

  const mobilePages = [1, 2, 4, 8, 15];
  const mobileDocHeight = await mobilePage.evaluate(() => document.body.scrollHeight);
  const mobilePageHeight = 844;
  const mobileTotalPages = Math.ceil(mobileDocHeight / mobilePageHeight);
  console.log(`Mobile estimated pages: ${mobileTotalPages}`);

  for (const p of mobilePages) {
    if (p > mobileTotalPages) continue;
    await mobilePage.evaluate((y) => window.scrollTo(0, y), (p - 1) * mobilePageHeight);
    await mobilePage.waitForTimeout(150);
    await mobilePage.screenshot({
      path: path.join(SCREENSHOT_DIR, `final_mobile_p${String(p).padStart(2, "0")}.png`),
    });
    console.log(`Mobile page ${p}`);
  }

  // Check for any remaining issues
  const issues = await desktopPage.evaluate(() => {
    const problems = [];

    // Check blockquotes that are too tall (might break badly in print)
    document.querySelectorAll("blockquote").forEach((bq) => {
      const rect = bq.getBoundingClientRect();
      if (rect.height > 600) {
        problems.push({
          type: "tall-blockquote",
          height: Math.round(rect.height),
          text: bq.textContent?.substring(0, 50),
        });
      }
    });

    // Check tables that are too tall
    document.querySelectorAll("table").forEach((tbl) => {
      const rect = tbl.getBoundingClientRect();
      if (rect.height > 800) {
        problems.push({
          type: "tall-table",
          height: Math.round(rect.height),
        });
      }
    });

    // Check images that aren't loading
    document.querySelectorAll("img").forEach((img) => {
      if (!img.complete || img.naturalHeight === 0) {
        problems.push({
          type: "broken-image",
          alt: img.alt,
          src: img.src?.substring(0, 60),
        });
      }
    });

    return problems;
  });

  if (issues.length) {
    console.log("\n--- ISSUES ---");
    issues.forEach((i) => console.log(JSON.stringify(i)));
  } else {
    console.log("\nNo content issues found.");
  }

  await browser.close();
  console.log("Done.");
}

inspect().catch(console.error);
