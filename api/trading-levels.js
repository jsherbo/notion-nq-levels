const axios = require('axios');
const cheerio = require('cheerio');

const notionUrl = 'https://rizzos.notion.site/NQ-Levels-3b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b';  // Update to exact Rizzo URL if changed

module.exports = async (req, res) => {
  try {
    const { data: html } = await axios.get(notionUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(html);
    let pageText = $('body').text().toLowerCase();

    // Clean Notion junk
    pageText = pageText.replace(/[\n\r\t\s]+/g, ' ').trim();

    // Symbol/Timeframe
    const symbol = /nq/i.test(pageText) ? 'NQ' : 'NQ';
    const timeframe = /daily|day/i.test(pageText) ? 'DAILY' : 'DAILY';

    // Robust Regex: Catches ALL "25400 - 410", "25500", "25565", "25695 - 710", "25920s" etc.
    const levels = [];
    const priceRegex = /(\d{2,3}[45]\d{3})(?:\s*[-–]\s*\d+)?|(25[456789]\d{2})(s?)/gi;
    const seen = new Set();
    let match;

    while ((match = priceRegex.exec(pageText)) !== null) {
      const priceStr = match[1] || match[2];
      const price = parseInt(priceStr, 10);
      if (price >= 25000 && price <= 30000 && !seen.has(price)) {
        seen.add(price);
        const raw = match[0].replace(/\s+/g, ' ').trim();
        levels.push({ price, raw });
      }
    }

    // Sort + limit
    levels.sort((a, b) => a.price - b.price);

    res.json({
      url: notionUrl,
      symbol,
      timeframe,
      levels: levels.slice(0, 20)
    });
  } catch (error) {
    console.error('Scrape error:', error.message);
    res.status(500).json({ error: 'Scrape failed', details: error.message });
  }
};