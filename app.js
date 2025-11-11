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
 * Full-phrase regexes:
 * We match the entire phrase but only mutate the captured Yale token.
 * This guarantees "no Yale references" stays untouched.
 */
const phraseRegexes = [
  // Yale University
  /\b(Yale)(\s+University)\b/gi,
  // Yale College
  /\b(Yale)(\s+College)\b/gi,
  // Yale medical school (allow flexible whitespace between "medical" and "school")
  /\b(Yale)(\s+medical\s+school)\b/gi,
];

/**
 * Bare "Yale" token — used ONLY for <a> tag text (link labels),
 * never for general text nodes.
 */
const yaleTokenOnly = /\b(Yale)\b/gi;

/**
 * Replace Yale→Fale in text nodes only (skip attributes/URLs; skip script/style).
 * - Replace within brand phrases anywhere in text nodes.
 * - Additionally, replace bare "Yale" inside <a> tag text nodes (link labels).
 * - Do NOT replace plain "Yale" elsewhere (e.g., "no Yale references").
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

      // 1) Replace the Yale token only inside the full brand phrases
      for (const rx of phraseRegexes) {
        text = text.replace(rx, (match, yaleToken, rest) => {
          changed = true;
          return `${yaleToFalePreserveCase(yaleToken)}${rest}`;
        });
      }

      // 2) For anchor text only, also replace a bare "Yale" token
      if (tag === 'a') {
        text = text.replace(yaleTokenOnly, (m, yale) => {
          changed = true;
          return yaleToFalePreserveCase(yale);
        });
      }

      if (changed && text !== node.data) node.data = text;
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
 * Fixed port so the integration test can rewrite it in a temp copy.
 */
const PORT = 3001;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Faleproxy listening on ${PORT}`));
}
