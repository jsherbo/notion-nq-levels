const puppeteer = require('puppeteer');

const notionUrl = 'https://rizzos.notion.site/133463bc0b76802994e4c4a03a6cc89c?v=9779d0b44b944d8588bb219c42fc2bf5';

module.exports = async (req, res) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    const page = await browser.newPage();
    await page.setViewport({width: 1920, height: 1080});
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.goto(notionUrl, {waitUntil: 'networkidle2', timeout: 40000});

    // DEEP CLICK: Wait calendar + exact "15" toggle
    await page.waitForSelector('.notion-page-content, [data-block-id]', {timeout: 15000});
    const today = '15';  // Hardcoded test
    await page.waitForFunction((day) => {
      const els = document.querySelectorAll('div[style*="cursor:pointer"], div[role="button"], .notion-focusable');
      for (let el of els) {
        if (el.textContent.includes(day)) return true;
      }
      return false;
    }, {}, today, {timeout: 10000});
    await page.evaluate((day) => {
      const els = document.querySelectorAll('div[style*="cursor:pointer"], div[role="button"], .notion-focusable, [data-qa="toggle-block"]');
      for (let el of els) {
        if ((el.textContent || '').includes(day)) {
          el.click({force: true});
          return;
        }
      }
    }, today);
    await page.waitForTimeout(5000);  // Full expand

    // Extract post-click
    const data = await page.evaluate(() => {
      const bolds = Array.from(document.querySelectorAll('strong, b, [style*="font-weight:bold"], [style*="700"]'))
        .map(el => el.textContent.trim())
        .filter(t => /\d{4,}/.test(t));
      const fullText = document.body.innerText.toLowerCase().replace(/\s+/g, ' ').substring(0, 1500);
      return { bolds: bolds.join(' '), fullText, hasLevels: fullText.includes('25695') || fullText.includes('710') };
    });

    await browser.close();

    // Parse
    const scrapeText = data.bolds + ' ' + data.fullText;
    const levels = [];
    const seen = new Set();
    const regex = /(\d{5})(?:\s*[-–]\s*\d{3,4})?|\d{5}s?/gi;
    let match;
    while ((match = regex.exec(scrapeText)) !== null) {
      const price = parseInt(match[1]);
      if (price >= 25000 && price <= 30000 && !seen.has(price)) {
        seen.add(price);
        levels.push({price, raw: match[0].trim()});
      }
    }
    levels.sort((a, b) => a.price - b.price);

    res.json({
      today,
      scrapePreview: data.fullText.substring(0, 400) + '...',
      boldsPreview: data.bolds.substring(0, 300) + '...',
      hasLevels: data.hasLevels,
      levels
    });
  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({error: error.message});
  }
};