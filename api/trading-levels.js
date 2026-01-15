const puppeteer = require('puppeteer-core');
const chrome = require('chrome-aws-lambda');

const notionUrl = 'https://rizzos.notion.site/133463bc0b76802994e4c4a03a6cc89c?v=9779d0b44b944d8588bb219c42fc2bf5';

module.exports = async (req, res) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: chrome.args,
      executablePath: await chrome.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.goto(notionUrl, { waitUntil: 'networkidle0', timeout: 30000 });

    // Calendar wait + CLICK "15"
    await page.waitForSelector('.notion-page-content, [data-block-id]', { timeout: 10000 });
    const today = '15';
    await page.evaluate((day) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.trim().includes(day)) {
          let parent = node.parentElement;
          while (parent && parent !== document.body) {
            if (parent.style.cursor === 'pointer' || parent.onclick || parent.getAttribute('role') === 'button' || parent.classList.contains('notion-toggle')) {
              parent.click();
              break;
            }
            parent = parent.parentElement;
          }
          break;
        }
      }
    }, today);
    await page.waitForTimeout(5000);  // Full expand

    // Post-click extract
    const data = await page.evaluate(() => {
      const bolds = Array.from(document.querySelectorAll('strong, b, [style*="bold"], [style*="700"]'))
        .map(el => el.innerText.trim())
        .filter(t => /\d{5}/.test(t));
      const fullText = document.body.innerText.toLowerCase().replace(/\s+/g, ' ').substring(0, 1500);
      return {
        bolds: bolds.join(' '),
        fullText,
        length: document.body.innerText.length,
        hasLevels: fullText.includes('25695') || fullText.includes('710') || fullText.includes('main focus')
      };
    });

    await browser.close();

    // Parse levels
    const scrapeText = data.bolds + ' ' + data.fullText;
    const levels = [];
    const seen = new Set();
    const regex = /(\d{5})(?:\s*[-–—]\s*\d+)?|\b(\d{5})\b/gi;
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
      hasLevels: data.hasLevels,
      length: data.length,
      levels: levels.slice(0, 20)
    });
  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({ error: error.message });
  }
};