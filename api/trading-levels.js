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
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(notionUrl, { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait calendar + CLICK "15"
    await page.waitForSelector('.notion-page-content, body > div > div', { timeout: 10000 });
    const today = '15'; // Test hardcoded
    await page.waitForTimeout(2000);
    const clicked = await page.evaluate((day) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.includes(day)) {
          const parent = node.parentElement;
          if (parent && (parent.style.cursor === 'pointer' || parent.onclick || parent.getAttribute('role') === 'button')) {
            parent.click();
            return true;
          }
        }
      }
      return false;
    }, today);
    await page.waitForTimeout(4000); // Expand content

    // Extract bold prices post-click
    const data = await page.evaluate(() => {
      const bolds = Array.from(document.querySelectorAll('strong, b, [style*="font-weight: 700"], [style*="bold"]'))
        .map(el => el.innerText.trim())
        .filter(t => /\d{5}/.test(t));
      const fullText = document.body.innerText.substring(0, 2000).toLowerCase();
      return { 
        bolds: bolds.join(' '), 
        fullText, 
        length: document.body.innerText.length,
        hasContent: fullText.includes('25695') || fullText.includes('focus') || fullText.includes('vpoc')
      };
    });

    await browser.close();

    // Parse levels
    const scrapeText = data.bolds + ' ' + data.fullText;
    const levels = [];
    const seen = new Set();
    const regex = /(\d{5})(?:\s*[-–]\s*\d{3,4})?|\b(\d{5})\b/gi;
    let match;
    while ((match = regex.exec(scrapeText)) !== null) {
      const priceStr = match[1] || match[2];
      const price = parseInt(priceStr, 10);
      if (price >= 25000 && price <= 30000 && !seen.has(price)) {
        seen.add(price);
        levels.push({ price, raw: match[0].trim() });
      }
    }
    levels.sort((a, b) => a.price - b.price);

    res.json({
      today,
      scrapePreview: data.fullText.substring(0, 400) + '...',
      boldsPreview: data.bolds.substring(0, 400) + '...',
      hasContent: data.hasContent,
      length: data.length,
      levels: levels.slice(0, 20)
    });
  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({ error: error.message });
  }
};