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
 * Only replace when "Yale" is part of a brand phrase:
 *   Yale University | Yale College | Yale medical school
 * We operate on text nodes only (skip attributes/URLs; skip script/style).
 */
const phraseRe = /\b(Yale)\s+(University|College|medical\s+school)\b/gi;

function replaceYaleWithFaleCasePreserving(html) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $('*').each((_, el) => {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'script' || tag === 'style') return;

    for (const node of el.childNodes || []) {
      if (node.type !== 'text' || !node.data) continue;

      // Replace all phrase occurrences within this text node
      let changed = false;
      let text = node.data;
      text = text.replace(phraseRe, (match, yaleToken, rest) => {
        changed = true;
        return `${yaleToFalePreserveCase(yaleToken)} ${rest}`;
      });

      if (changed) node.data = text;
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
