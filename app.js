const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());

// Case-preserving Yale -> Fale
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
 * We only change the Yale token inside these exact phrases:
 *   Yale University | Yale College | Yale medical school
 * We match the whole phrase but only mutate the (Yale) capture.
 */
const phraseRegexes = [
  /\b(Yale)(\s+University)\b/gi,
  /\b(Yale)(\s+College)\b/gi,
  /\b(Yale)(\s+medical\s+school)\b/gi,
];

// Anchor label that should flip “Yale” -> “Fale” (exact text match)
const exactAnchorLabels = new Set(['About Yale']);

function replaceYaleWithFaleCasePreserving(html) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // 1) Replace within brand phrases in text nodes only
  $('*').each((_, el) => {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'script' || tag === 'style') return;

    for (const node of el.childNodes || []) {
      if (node.type !== 'text' || !node.data) continue;

      let text = node.data;
      let changed = false;

      for (const rx of phraseRegexes) {
        text = text.replace(rx, (m, yaleToken, rest) => {
          changed = true;
          return `${yaleToFalePreserveCase(yaleToken)}${rest}`;
        });
      }

      if (changed) node.data = text;
    }
  });

  // 2) Replace bare “Yale” inside <a> labels ONLY when the entire label equals "About Yale"
  $('a').each((_, a) => {
    const children = a.childNodes || [];
    for (const node of children) {
      if (node.type !== 'text' || !node.data) continue;

      const label = node.data.trim();
      if (!exactAnchorLabels.has(label)) continue; // exact match only

      node.data = label.replace(/\b(Yale)\b/g, (m, yale) => yaleToFalePreserveCase(yale));
    }
  });

  return $.html();
}

// POST /fetch { url }
app.post('/fetch', async (req, res) => {
  try {
    const target = req.body && req.body.url;
    if (!target) return res.status(400).json({ error: 'URL is required' });

    const { data } = await axios.get(target, { timeout: 10000 });
    const transformed = replaceYaleWithFaleCasePreserving(data);
    res.json({ success: true, content: transformed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

module.exports = { app, replaceYaleWithFaleCasePreserving };

// Fixed port so the integration test can rewrite it in a temp copy.
const PORT = 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Faleproxy listening on ${PORT}`));
}
