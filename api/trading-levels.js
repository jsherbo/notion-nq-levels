const puppeteer = require('puppeteer');

const notionUrl = 'https://rizzos.notion.site/133463bc0b76802994e4c4a03a6cc89c?v=9779d0b44b944d8588bb219c42fc2bf5';

module.exports = async (req, res) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // Chrome flags for Vercel
        '--disable-gpu'
      ]
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto(notionUrl, { waitUntil: 'networkidle0', timeout: 20000 });

    // Click TODAY (15th) calendar toggle
    const today = new Date().getDate().toString();
    await page.evaluate((day) => {
      const toggles = document.querySelectorAll('[role="button"], [data-block-id], .notion-toggle, div[style*="cursor: pointer"]');
      for (let el of toggles) {
        if ((el.textContent || el.innerText || '').includes(day)) {
          el.click();
          break;
        }
      }
    }, today);
    await page.waitForTimeout(2000); // Expand

    // Extract bold prices + text (SR/TP)
    const data = await page.evaluate(() => {
      const bolds = [];
      document.querySelectorAll('strong, b, [style*="font-weight"], [style*="bold"]').forEach(el => {
        const text = el.textContent.trim();
        if (/\d{5}/.test(text)) bolds.push(text);
      });
      const text = document.body.innerText.toLowerCase().replace(/\s+/g, ' ');
      return { bolds: bolds.join(' '), text };
    });

    await browser.close();

    // Parse levels
    const scrapeText = data.bolds + ' ' + data.text;
    const levels = [];
    const regex = /(\d{5})(?:\s*[-–]\s*\d+)?|\d{5}s?/gi;
    const seen = new Set();
    let match;
    while ((match = regex.exec(scrapeText)) !== null) {
      const priceStr = match[1];
      const price = parseInt(priceStr);
      if (price >= 25000 && price <= 30000 && !seen.has(price)) {
        seen.add(price);
        levels.push({ price, raw: match[0].trim() });
      }
    }
    levels.sort((a, b) => a.price - b.price);

    res.json({
      url: notionUrl,
      symbol: 'NQ',
      timeframe: 'DAILY',
      today,
      scrapePreview: data.bolds.substring(0, 300) + '...',
      levels: levels.slice(0, 20)
    });
  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({ error: error.message });
  }
};