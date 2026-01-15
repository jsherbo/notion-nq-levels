const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const notionUrl = 'https://rizzos.notion.site/133463bc0b76802994e4c4a03a6cc89c?v=9779d0b44b944d8588bb219c42fc2bf5';

module.exports = async (req, res) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(notionUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // CLICK "15" (calendar day toggle - Notion specific)
    const today = '15';  // Hardcode for test (change to new Date().getDate().toString() later)
    await page.waitForTimeout(3000); // Initial load
    const clicked = await page.evaluate((day) => {
      const elements = document.querySelectorAll('div, span[role="button"], [data-qa-toggle-state]');
      for (let el of elements) {
        const text = el.innerText || el.textContent || '';
        if (text.includes(day) && (el.style.cursor === 'pointer' || el.getAttribute('role') === 'button' || el.classList.contains('notion-focusable'))) {
          el.click();
          return true;
        }
      }
      return false;
    }, today);
    await page.waitForTimeout(4000); // Content expand

    // Extract
    const data = await page.evaluate(() => {
      const bolds = Array.from(document.querySelectorAll('strong, b')).map(el => el.innerText.trim()).filter(t => t.match(/\d{5}/));
      const fullText = document.body.innerText.substring(0, 2000);
      return { bolds: bolds.join(' | '), fullText, clicked: fullText.includes('25695') || fullText.includes('focus') };
    });

    await browser.close();

    // Levels from bolds + text
    const scrapeText = data.bolds + ' ' + data.fullText;
    const levels = [];
    const regex = /\b(\d{5})\b|(\d{5})\s*[-–]\s*\d{3,4}/gi;
    let match;
    const seen = new Set();
    while ((match = regex.exec(scrapeText)) !== null) {
      const priceStr = match[1] || match[2];
      const price = parseInt(priceStr);
      if (price >= 25000 && price <= 30000 && !seen.has(price)) {
        seen.add(price);
        levels.push({ price, raw: priceStr });
      }
    }
    levels.sort((a, b) => a.price - b.price);

    res.json({
      url: notionUrl,
      symbol: 'NQ',
      timeframe: 'DAILY',
      today,
      scrapePreview: data.fullText.substring(0, 400) + '...',
      boldsPreview: data.bolds,
      clicked: data.clicked,
      levels
    });
  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({ error: error.message });
  }
};