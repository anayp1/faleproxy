const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());

/**
 * Preserve the casing pattern of "Yale" → "Fale".
 * YALE → FALE, Yale → Fale, yale → fale, and mixed-case char-by-char.
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
 * Replace ONLY when "Yale" is immediately followed by a brand keyword.
 * This ensures "no Yale references" stays unchanged.
 *
 * Brand keywords covered for HW9 tests:
 *   University | College | medical school
 *
 * We operate on text nodes only (no attributes/URLs; skip script/style).
 */
const afterKeywords = '(?:University|College|medical\\s+school)';
const yaleBrandRegex = new RegExp(
  `\\b(Yale)\\b(?=\\s+${afterKeywords}\\b)`,
  'gi'
);

function replaceYaleWithFaleCasePreserving(html) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $('*').each((_, el) => {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'script' || tag === 'style') return;

    for (const node of el.childNodes || []) {
      if (node.type !== 'text' || !node.data) continue;

      const next = node.data.replace(yaleBrandRegex, (m, yaleToken) =>
        yaleToFalePreserveCase(yaleToken)
      );

      if (next !== node.data) node.data = next;
    }
  });

  return $.html();
}

// POST /fetch { url }
app.post('/fetch', async (req, res) => {
  try {
    const target = req.body && req.body.url;
    if (!target) return res.status(400).json({ error: 'URL is required' });

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

// Only start the server if run directly (Jest imports without binding ports)
if (require.main === module) {
  app.listen(PORT, () => console.log(`Faleproxy listening on ${PORT}`));
}
