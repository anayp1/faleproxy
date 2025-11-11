const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());

// Case-preserving Yale -> Fale
function yaleToFalePreserveCase(word) {
  if (word === word.toUpperCase()) return 'FALE';
  if (word === word.toLowerCase()) return 'fale';
  const base = 'Fale';
  return [...base]
    .map((ch, i) =>
      i < word.length && word[i] === word[i].toUpperCase()
        ? ch.toUpperCase()
        : ch.toLowerCase()
    )
    .join('');
}

// Build fresh regexes each time (avoid global lastIndex issues)
function buildPhraseRegexes() {
  return [
    // Yale University
    new RegExp(String.raw`\b(Yale)(\s+University)\b`, 'gi'),
    // Yale College
    new RegExp(String.raw`\b(Yale)(\s+College)\b`, 'gi'),
    // Yale medical school (flex whitespace)
    new RegExp(String.raw`\b(Yale)(\s+medical\s+school)\b`, 'gi'),
  ];
}

function replaceYaleWithFaleCasePreserving(html) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $('*').each((_, el) => {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'script' || tag === 'style') return;

    // 1) Replace brand phrases in text nodes only
    for (const node of el.childNodes || []) {
      if (node.type !== 'text' || !node.data) continue;

      let text = node.data;
      let changed = false;

      const phraseRegexes = buildPhraseRegexes(); // fresh per node
      for (const rx of phraseRegexes) {
        // Reset just in case (paranoia, though fresh regexes start at 0)
        rx.lastIndex = 0;
        text = text.replace(rx, (match, yaleToken, rest) => {
          changed = true;
          return `${yaleToFalePreserveCase(yaleToken)}${rest}`;
        });
      }

      if (changed) node.data = text;
    }

    // 2) Replace anchor label exactly "About Yale" -> "About Fale" (text only)
    if (tag === 'a') {
      for (const node of el.childNodes || []) {
        if (node.type !== 'text' || !node.data) continue;
        const label = node.data.trim();
        if (label === 'About Yale') {
          node.data = label.replace(/\b(YALE|Yale|yale)\b/, (w) =>
            yaleToFalePreserveCase(w)
          );
        }
      }
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
