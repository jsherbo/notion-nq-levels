const axios = require('axios');
const cheerio = require('cheerio');

const notionUrl = 'https://rizzos.notion.site/133463bc0b76802994e4c4a03a6cc89c?v=9779d0b44b944d8588bb219c42fc2bf5';

module.exports = async (req, res) => {
  try {
    const { data: html } = await axios.get(notionUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(html);
    
    // PRIORITY: Bold text (Notion **bold** = prices!)
    let boldText = '';
    $('strong, b, [style*="bold"], [style*="700"], [class*="bold"]').each((i, el) => {
      boldText += $(el).text() + ' ';
    });
    boldText = boldText.toLowerCase().replace(/[\s\n\r\t]+/g, ' ').trim();

    // Full body fallback
    let pageText = $('body').text().toLowerCase().replace(/[\s\n\r\t]+/g, ' ').trim();

    // TODAY filter: Section near "15" (calendar day)
    const today = new Date().getDate();
    const todayStr = today.toString();
    let scrapeText = boldText || pageText;
    const todayMatch = pageText.match(new RegExp(todayStr + `.*?(\\d{5}|level|focus|target|support|resistance)`, 'i'));
    if (todayMatch) {
      scrapeText = todayMatch[0];
    }

    // SUPPORT/RESISTANCE/TP Regex: Bold prices + ranges
    const levels = [];
    const pricePatterns = [
      /(\d{5})\s*[-–]\s*\d{1,4}/g,  // 25695 - 710 → 25695
      /(\d{5})(s?)/g,               // 25570, 25920s
      /\b(\d{5})\b/g                // Standalone 25770
    ];
    const seen = new Set();

    pricePatterns.forEach(regex => {
      let match;
      while ((match = regex.exec(scrapeText)) !== null) {
        const priceStr = match[1];
        const price = parseInt(priceStr, 10);
        if (price >= 25000 && price <= 30000 && !seen.has(price)) {
          seen.add(price);
          const raw = match[0].replace(/\s+/g, ' ').trim();
          levels.push({ price, raw });
        }
      }
    });

    // Fallback: Whole page if today empty
    if (levels.length === 0) {
      pricePatterns.forEach(regex => {
        let match;
        while ((match = regex.exec(pageText)) !== null) {
          const priceStr = match[1];
          const price = parseInt(priceStr, 10);
          if (price >= 25000 && price <= 30000 && !seen.has(price)) {
            seen.add(price);
            const raw = match[0].replace(/\s+/g, ' ').trim();
            levels.push({ price, raw });
          }
        }
      });
    }

    levels.sort((a, b) => a.price - b.price);

    res.json({
      url: notionUrl,
      symbol: 'NQ',
      timeframe: 'DAILY',
      today: todayStr,
      scrapeTextPreview: scrapeText.substring(0, 200) + '...',  // Debug
      levels: levels.slice(0, 20)
    });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Scrape failed', details: error.message });
  }
};