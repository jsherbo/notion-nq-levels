const axios = require('axios');
const cheerio = require('cheerio');

const notionUrl = 'https://rizzos.notion.site/133463bc0b76802994e4c4a03a6cc89c?v=9779d0b44b944d8588bb219c42fc2bf5';  // Real Rizzo calendar

module.exports = async (req, res) => {
  try {
    const { data: html } = await axios.get(notionUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(html);
    let pageText = $('body').text().toLowerCase().replace(/[\n\r\t\s]+/g, ' ');

    // Symbol/Timeframe
    const symbol = /nq/i.test(pageText) ? 'NQ' : 'NQ';
    const timeframe = /daily|day/i.test(pageText) ? 'DAILY' : 'DAILY';

    // TODAY ONLY: Get day # (15th = 15)
    const today = new Date().getDate().toString();
    const todaySection = pageText.match(new RegExp(today + `[^.]*?(?:\\d{5}|level)`, 'i'));

    // Robust price regex (25xxx-30xxx + suffixes/ranges)
    const levels = [];
    const priceRegex = /(\d{5})(?:\s*[-–]\s*\d{1,4})?|\d{5}(s?)/gi;
    const seen = new Set();

    // Scrape WHOLE page first, then prioritize today
    let scrapeText = pageText;
    if (todaySection && todaySection[0]) {
      scrapeText = todaySection[0];  // Narrow to today (higher accuracy)
    }

    let match;
    while ((match = priceRegex.exec(scrapeText)) !== null) {
      const priceStr = (match[1] || match[0]).replace(/[^\d]/g, '');
      const price = parseInt(priceStr, 10);
      if (price >= 25000 && price <= 30000 && !seen.has(price)) {
        seen.add(price);
        levels.push({ price, raw: match[0].replace(/\s+/g, ' ').trim() });
      }
    }

    // Fallback: Broader page search if today empty
    if (levels.length === 0) {
      while ((match = priceRegex.exec(pageText)) !== null) {
        const priceStr = (match[1] || match[0]).replace(/[^\d]/g, '');
        const price = parseInt(priceStr, 10);
        if (price >= 25000 && price <= 30000 && !seen.has(price)) {
          seen.add(price);
          levels.push({ price, raw: match[0].replace(/\s+/g, ' ').trim() });
        }
      }
    }

    levels.sort((a, b) => a.price - b.price);

    res.json({
      url: notionUrl,
      symbol,
      timeframe,
      today: today,
      levels: levels.slice(0, 20)
    });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Scrape failed', details: error.message });
  }
};