const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const notionUrl = 'https://rizzos.notion.site/133463bc0b76802994e4c4a03a6cc89c?v=9779d0b44b944d8588bb219c42fc2bf5';

module.exports = async (req, res) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: 'new',
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.goto(notionUrl, { waitUntil: 'networkidle0', timeout: 25000 });

    // Click TODAY calendar (e.g., "15")
    const today = new Date().getDate().toString();
    await page.waitForSelector('div[role="button"], [data-qa="toggle-block"], .notion-toggle', { timeout: 10000 });
    await page.evaluate((day) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.includes(day) && node.parentElement && (node.parentElement.onclick || node.parentElement.style.cursor === 'pointer' || node.parentElement.classList.contains('cursor-pointer'))) {
          node.parentElement.click();
          break;
        }
      }
    }, today);

    await page.waitForTimeout(1500);

    // Bold prices (SR/TP)
    const data = await page.evaluate(() => {
      const bolds = Array.from(document.querySelectorAll('strong, b, [style*="bold"], [style*="700"], em[style*="bold"]')).map(el => el.textContent.trim()).filter(t => /\d{5}/.test(t));
      const text = document.body.innerText.toLowerCase().replace(/\s+/g, ' ');
      return { bolds: bolds.join(' '), text };
    });

    await browser.close();

    // Extract levels from bold/text
    const scrapeText = data.bolds + ' ' + data.text;
    const levels = [];
    const regex = /(\d{5})(?:\s*[-–]\s*\d{1,4})?|\d{5}(s?)/gi;
    const seen = new Set();
    let match;
    while ((match = regex.exec(scrapeText)) !== null) {
      const price = parseInt(match[1], 10);
      if (price >= 25000 && price <= 30000 && !seen.has(price)) {
        seen.add(price);
        levels.push({ price, raw: match[0].replace(/\s+/g, ' ').trim() });
      }
    }

    levels.sort((a, b) => a.price - b.price);

    res.json({
      url: notionUrl,
      symbol: 'NQ',
      timeframe: 'DAILY',
      today,
      scrapePreview: data.bolds.substring(0, 300) + '...',
      levels
    });
  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({ error: error.message });
  }
};