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
    
    // **NOTION MAGIC**: Parse __NEXT_DATA__ JSON (full page content!)
    let pageContent = '';
    $('script[type="application/json"]').each((i, el) => {
      try {
        const jsonStr = $(el).html();
        if (jsonStr && jsonStr.includes('block')) {
          const data = JSON.parse(jsonStr);
          if (data.props && data.props.pageQuery) {
            pageContent = JSON.stringify(data.props.pageQuery.recordMap.block).toLowerCase();
          }
        }
      } catch {}
    });

    // Fallback: Bold + body text
    let boldText = '';
    $('strong, b, [style*="bold"], [style*="700"], .notion-bold, em').each((i, el) => {
      boldText += $(el).text().trim() + ' ';
    });
    const bodyText = $('body').text().toLowerCase().replace(/[\s\n\r\t]+/g, ' ').trim();
    let scrapeText = (boldText + ' ' + bodyText + ' ' + pageContent).replace(/[\s\n\r\t]+/g, ' ');

    // TODAY filter (15th section)
    const today = new Date().getDate().toString();
    const todayMatch = scrapeText.match(new RegExp(today + `.*?(\\d{5}|focus|target|support|v poc|balance)`, 'i'));
    if (todayMatch) scrapeText = todayMatch[0];

    // SR/TP Regex (exact matches: 25695 - 710, 25570, 25770s, etc.)
    const levels = [];
    const patterns = [
      /(\d{5})\s*[-–]\s*\d{3,4}/gi,   // 25695 - 710
      /(\d{5})(s?)/gi,                // 25770s
      /\b(\d{5})\b/gi                 // 25570 standalone
    ];
    const seen = new Set();
    patterns.forEach(regex => {
      let match;
      while ((match = regex.exec(scrapeText)) !== null) {
        const price = parseInt(match[1], 10);
        if (price >= 25000 && price <= 30000 && !seen.has(price)) {
          seen.add(price);
          levels.push({ price, raw: match[0].replace(/\s+/g, ' ').trim() });
        }
      }
    });

    // Sort + dedup
    levels.sort((a, b) => a.price - b.price).filter((l, i, self) => 
      i === self.findIndex(t => t.price === l.price)
    );

    res.json({
      url: notionUrl,
      symbol: 'NQ',
      timeframe: 'DAILY',
      today,
      scrapePreview: scrapeText.substring(0, 300) + '...',
      levels: levels.slice(0, 20)
    });
  } catch (error) {
    res.status(500).json({ error: 'Scrape failed', details: error.message });
  }
};