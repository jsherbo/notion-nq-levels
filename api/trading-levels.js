const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const notionUrl = 'https://rizzos.notion.site/133463bc0b76802994e4c4a03a6cc89c?v=9779d0b44b944d8588bb219c42fc2bf5';

module.exports = async (req, res) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto(notionUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // AUTO-CLICK TODAY'S CALENDAR SECTION
    const today = new Date().getDate();
    await page.evaluate((dayStr) => {
      const elements = [...document.querySelectorAll('div, span, button')];
      for (let el of elements) {
        const text = el.textContent || el.innerText || '';
        if (text.includes(dayStr) && (el.style.cursor === 'pointer' || el.onclick || el.classList.contains('toggle') || text.match(/\d{1,2}(st|nd|rd|th)?/))) {
          el.click();
          return;  // Click first match (today header)
        }
      }
    }, today.toString());

    await page.waitForTimeout(2000);  // Expand animation

    // EXTRACT BOLD PRICES + FULL TEXT (SR/TP/Support/Resistance)
    const content = await page.evaluate(() => {
      const bolds = [];
      const boldSelectors = ['strong', 'b', '[style*="font-weight: 700"]', '[style*="bold"]', '.notion-bold'];
      boldSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          const text = (el.textContent || el.innerText || '').trim();
          if (/\d{4,}/.test(text)) bolds.push(text);  // Numbers (prices/ranges)
        });
      });
      const fullText = document.body.innerText.toLowerCase().replace(/\s+/g, ' ').trim();
      return { bolds: bolds.join(' '), fullText };
    });

    await browser.close();

    // REGEX: SR/TP Levels from bold + context
    const scrapeText = content.bolds + ' ' + content.fullText;
    const levels = [];
    const priceRegex = /(\d{5})(?:\s*[-–]\s*\d{3,4})?|\d{5}(s?)/gi;
    const seen = new Set();
    let match;
    while ((match = priceRegex.exec(scrapeText)) !== null) {
      const priceStr = match[1];
      const price = parseInt(priceStr, 10);
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
      today: today.toString(),
      scrapePreview: scrapeText.substring(0, 300) + '...',
      levels: levels.slice(0, 20)
    });
  } catch (error) {
    if (browser) await browser.close();
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Render failed', details: error.message });
  }
};