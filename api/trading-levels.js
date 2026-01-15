const axios = require('axios');
const cheerio = require('cheerio');

const notionUrl = 'https://rizzos.notion.site/133463bc0b76802994e4c4a03a6cc89c?v=9779d0b44b944d8588bb219c42fc2bf5';

module.exports = async (req, res) => {
  try {
    const { data: html } = await axios.get(notionUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const $ = cheerio.load(html);
    
    // **NOTION CORE**: Parse __NEXT_DATA__ JSON (full blocks!)
    let pageContent = '';
    let blockMap = {};
    const nextDataScript = $('#__NEXT_DATA__');
    if (nextDataScript.length) {
      try {
        const nextData = JSON.parse(nextDataScript.html());
        const recordMap = nextData?.props?.pageQuery?.recordMap;
        if (recordMap) {
          blockMap = recordMap.block || {};
          pageContent = JSON.stringify(blockMap).toLowerCase();
        }
      } catch (e) {
        console.error('JSON parse fail:', e.message);
      }
    }

    // Extract ALL bold/rich_text prices from blocks
    const levels = [];
    const seen = new Set();
    Object.values(blockMap).forEach(block => {
      const content = JSON.stringify(block).toLowerCase();
      // Bold annotations or price patterns in rich_text/plain_text
      const regex = /(\d{5})(?:\s*[-–]\s*\d{1,4})?|\d{5}(s?)/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const priceStr = match[1];
        const price = parseInt(priceStr, 10);
        if (price >= 25000 && price <= 30000 && !seen.has(price)) {
          seen.add(price);
          levels.push({ price, raw: match[0].replace(/\\u[\dA-Fa-f]{4}/g, '').trim() });
        }
      }
    });

    // TODAY filter: Prioritize blocks near date
    const today = new Date().getDate().toString();
    const todayLevels = [];
    Object.values(blockMap).forEach(block => {
      const content = JSON.stringify(block).toLowerCase();
      if (content.includes(today)) {
        const regex = /(\d{5})(?:\s*[-–]\s*\d{1,4})?|\d{5}(s?)/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
          const priceStr = match[1];
          const price = parseInt(priceStr, 10);
          if (price >= 25000 && price <= 30000 && !seen.has(price)) {
            seen.add(price);
            todayLevels.push({ price, raw: match[0].replace(/\\u[\dA-Fa-f]{4}/g, '').trim() });
          }
        }
      }
    });
    if (todayLevels.length > 0) levels.length = 0, levels.push(...todayLevels);

    levels.sort((a, b) => a.price - b.price);

    // Fallback body bold if empty
    if (levels.length === 0) {
      let boldText = '';
      $('strong, b, [style*="bold"], [style*="700"]').each((i, el) => {
        boldText += $(el).text() + ' ';
      });
      const bodyText = $('body').text().replace(/[\s\n\r\t]+/g, ' ');
      const fallbackText = boldText + ' ' + bodyText;
      const regex = /(\d{5})(?:\s*[-–]\s*\d{1,4})?|\d{5}(s?)/g;
      let match;
      while ((match = regex.exec(fallbackText)) !== null) {
        const price = parseInt(match[1], 10);
        if (price >= 25000 && price <= 30000 && !seen.has(price)) {
          seen.add(price);
          levels.push({ price, raw: match[0].trim() });
        }
      }
      levels.sort((a, b) => a.price - b.price);
    }

    res.json({
      url: notionUrl,
      symbol: 'NQ',
      timeframe: 'DAILY',
      today,
      scrapePreview: pageContent.substring(0, 300) + '...',
      levels: levels.slice(0, 20)
    });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Scrape failed', details: error.message });
  }
};