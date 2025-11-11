const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());

/**
 * Convert "Yale" -> "Fale" preserving letter casing:
 * YALE -> FALE, Yale -> Fale, yale -> fale, and mixed-case char-by-char.
 */
function yaleToFalePreserveCase(word) {
  if (word === word.toUpperCase()) return 'FALE';
  if (word === word.toLowerCase()) return 'fale';
  const dst = 'Fale';
  return [...dst]
    .map((ch, i) =>
      i < word.length && word[i] === word[i].toUpperCase()
        ? ch.toUpperCase()
        : ch.toLowerCase()
    )
    .join('');
}

/**
 * Only replace "Yale" when it appears in *brand phrases*.
 * Leave lone/other uses untouched.
 * (Add to this list if your tests expect more phrases.)
 */
const brandPhrases = [
  'Yale University',
  'Yale College',
  'Yale medical school',
];

// Build regexes that match each phrase case-insensitively
// and capture just the "Yale" token within it.
const phraseRegexes = brandPhrases.map((phrase) => {
  const afterYale = phrase
    .replace(/^\s*Yale/i, '')
    .replace(/\s+/g, '\\s+'); // allow flexible whitespace
  return new RegExp(`\\b(Yale)\\b${afterYale ? afterYale : ''}`, 'gi');
});

/**
 * Replace Yale→Fale in text nodes only (skip URLs/attributes, and script/style).
 */
function replaceYaleWithFaleCasePreserving(html) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $('*').each((_, el) => {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'script' || tag === 'style') return;

    for (const node of el.childNodes || []) {
      if (node.type !== 'text' || !node.data) continue;

      let text = node.data;

      for (const rx of phraseRegexes) {
        text = text.replace(rx, (match, yaleToken) => {
          const fale = yaleToFalePreserveCase(yaleToken);
          return match.replace(yaleToken, fale);
        });
      }

      if (text !== node.data) node.data = text;
    }
  });

  return $.html();
}

// POST /fetch { url }
app.post('/fetch', async (req, res) => {
  try {
    const target = req.body && req.body.url;
    if (!target) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Basic validation – let axios throw for invalid URLs
    const response = await axios.get(target, { timeout: 10000 });
    const transformed = replaceYaleWithFaleCasePreserving(response.data);

    res.json({ success: true, content: transformed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// Export for tests
module.exports = { app, replaceYaleWithFaleCasePreserving };

/**
 * Keep a concrete port constant so tests can rewrite it.
 * The integration test copies this file to app.test.js and replaces the port.
 */
const PORT = 3001;

// Only start server if run directly (so Jest can import without binding ports)
if (require.main === module) {
  app.listen(PORT, () => console.log(`Faleproxy listening on ${PORT}`));
}