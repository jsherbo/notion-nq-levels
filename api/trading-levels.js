import axios from 'axios';
import cheerio from 'cheerio';

const notionUrl = 'https://rizzos.notion.site/NQ-Levels-3b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b';  // Rizzo NQ page

export default async function handler(req, res) {
  try {
    const { data: html } = await axios.get(notionUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    const $ = cheerio.load(html);
    const pageText = $('body').text().toLowerCase();

    // Symbol/Timeframe (fallback if changed)
    const symbol = pageText.includes('nq') ? 'NQ' : 'NQ';
    const timeframe = pageText.includes('daily') ? 'DAILY' : 'DAILY';

    // Robust level extraction: Regex for NQ prices (25xxx patterns + suffixes)
    const levels = [];
    const priceRegex = /(\d{5})(?:\s*[-–]\s*(\d{1,4}))?|(\d{5})(s?)/g;
    let match;
    const seen = new Set();

    while ((match = priceRegex.exec(pageText)) !== null) {
      let price = parseFloat(match[1] || match[3]);
      if (price >= 25000 && price <= 30000 && !seen.has(price)) {
        seen.add(price);
        const raw = match[0].replace(/\s+/g, ' ').trim();
        levels.push({ price: Math.round(price), raw });
      }
    }

    // Sort ascending
    levels.sort((a, b) => a.price - b.price);

    res.json({
      url: notionUrl,
      symbol,
      timeframe,
      levels: levels.slice(0, 20)  // Top 20
    });
  } catch (error) {
    res.status(500).json({ error: 'Scrape failed', details: error.message });
  }
}