const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());

/**
 * Preserve casing for "Yale" -> "Fale".
 * YALE -> FALE, Yale -> Fale, yale -> fale, mixed-case char-by-char.
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
 * Token regex for "Yale" with brand lookahead:
 * Replace only when the token "Yale" is immediately followed by
 *   University | College | medical school
 * (keeps non-brand uses like "no Yale references" untouched)
 */
const yaleBrandToken = /\b(Yale)\b(?=\s+(?:University|College|medical\s+school)\b)/gi;

/**
 * Token regex for "Yale" by itself (used ONLY for anchor text replacement).
 */
const yaleTokenOnly = /\b(Yale)\b/gi;

/**
 * Replace Yale→Fale in text nodes only (skip attributes/URLs; skip script/style).
 * - Replace in brand phrases (global in all text nodes).
 * - Additionally, replace "Yale" inside <a> ...text... </a> nodes (link labels).
 * - Do NOT replace plain occurrences elsewhere (e.g., "no Yale references").
 */
function replaceYaleWithFaleCasePreserving(html) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $('*').each((_, el) => {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'script' || tag === 'style') return;

    for (const node of el.childNodes || []) {
      if (node.type !== 'text' || !node.data) continue;

      let text = node.data;
      let changed = false;

      // 1) Brand-phrase replacement everywhere (text nodes only)
      const brandReplaced = text.replace(yaleBrandToken, (m, yale) => {
        changed = true;
        return yaleToFalePreserveCase(yale);
      });

      // 2) Anchor-text replacement: if parent is <a>, also replace bare "Yale"
      let finalText = brandReplaced;
      if (tag === 'a') {
        finalText = finalText.replace(yaleTokenOnly, (m, yale) => {
          changed = true;
          return yaleToFalePreserveCase(yale);
        });
      }

      if (changed && finalText !== node.data) node.data = finalText;
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

module.exports = { app, replaceYaleWithFaleCasePreserving };

/**
 * Keep a concrete port constant so integration test can rewrite it.
 */
const PORT = 3001;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Faleproxy listening on ${PORT}`));
}
