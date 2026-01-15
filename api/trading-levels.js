const axios = require('axios');
const cheerio = require('cheerio');

const PAGE_URL = 'https://rizzos.notion.site/133463bc0b76802994e4c4a03a6cc89c?v=9779d0b44b944d8588bb219c42fc2bf5';

module.exports = async (req, res) => {
  try {
    const { data: html } = await axios.get(PAGE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const $ = cheerio.load(html);

    // Extract header (e.g., "# NQ DAILY")
    let symbol = 'NQ', timeframe = 'DAILY';
    $('h1').each((i, el) => {
      const headerText = $(el).text().trim();
      const match = headerText.match(/#?\s*(\w+)\s+(\w+)/i);
      if (match) {
        symbol = match[1].toUpperCase();
        timeframe = match[2].toUpperCase();
      }
    });

    // Parse bold numbers: <strong>25835</strong> or span.bold → extract \d+s?
    const levels = [];
    $('strong, .notion-semibold, [style*="font-weight: bold"]').each((i, el) => {
      const boldText = $(el).text().trim();
      const matches = boldText.match(/(\d+(?:\.\d+)?s?)/g);
      if (matches) {
        matches.forEach(numStr => {
          const price = parseFloat(numStr.replace(/s?$/g, ''));
          if (!isNaN(price) && price > 10000 && !levels.some(l => Math.abs(l.price - price) < 1)) {
            levels.push({ price, raw: numStr });
          }
        });
      }
    });

    // Also scan all text for bold-like patterns (backup)
    $('.notion-page-content').text().match(/(\*\*(\d+(?:\.\d+)?s?)\*\*)/g)?.forEach(match => {
      const numStr = match.replace(/\*\*/g, '');
      const price = parseFloat(numStr.replace(/s?$/g, ''));
      if (!isNaN(price) && price > 10000 && !levels.some(l => Math.abs(l.price - price) < 1)) {
        levels.push({ price, raw: numStr });
      }
    });

    // Dedupe, sort, limit
    const uniqueLevels = levels.sort((a, b) => a.price - b.price).slice(0, 20);

    res.json({
      url: PAGE_URL,
      symbol,
      timeframe,
      levels: uniqueLevels
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};