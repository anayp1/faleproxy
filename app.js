// app.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

/**
 * Convert "Yale" -> "Fale" preserving letter casing, e.g.
 * YALE->FALE, Yale->Fale, yale->fale.
 */
function yaleToFalePreserveCase(word) {
  const base = 'Fale';
  if (word.toUpperCase() === word) return base.toUpperCase();
  if (word.toLowerCase() === word) return base.toLowerCase();
  // Title / mixed-case: follow the first letter's case, rest by source
  return [...base]
    .map((ch, i) => (word[i] && word[i] === word[i].toUpperCase() ? ch.toUpperCase() : ch.toLowerCase()))
    .join('');
}

/**
 * Replace only *brand phrases* containing Yale in text nodes.
 * Example phrases (expand if your tests include more):
 * - "Yale University", "Yale College", "Yale medical school"
 * (We convert the "Yale" token within those phrases, preserving case.)
 */
const brandPhrases = [
  'Yale University',
  'Yale College',
  'Yale medical school'
];

// Build case-insensitive regexes that match phrases in a way
// we can transform just the "Yale" token while leaving the rest.
const phrasePatterns = brandPhrases.map((p) => {
  // split at "Yale" word boundary (case-insensitive)
  const parts = p.split(/Yale/i);
  // Reconstruct pattern: capture "Yale" word with boundaries
  const pattern = new RegExp(`\\b(Yale)\\b${parts[1] ? '\\s*' + parts[1].replace(/\s+/g, '\\s+') : ''}`, 'gi');
  return { phrase: p, regex: pattern };
});

function replaceYaleWithFaleCasePreserving(html) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // Don’t touch URLs/attributes; text nodes only (and not in script/style)
  $('*').each((_, el) => {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'script' || tag === 'style') return;

    el.childNodes?.forEach((node) => {
      if (node.type !== 'text' || !node.data) return;

      let text = node.data;

      phrasePatterns.forEach(({ regex }) => {
        text = text.replace(regex, (match, yaleWord) => {
          // Replace only the "Yale" token inside the phrase
          const fale = yaleToFalePreserveCase(yaleWord);
          return match.replace(yaleWord, fale);
        });
      });

      // Only assign back if changed
      if (text !== node.data) node.data = text;
    });
  });

  return $.html();
}

app.get('/fetch', async (req, res) => {
  try {
    const target = req.query.url;
    if (!target) return res.status(400).send('Missing ?url=');

    const response = await axios.get(target, { timeout: 10000 });
    const transformed = replaceYaleWithFaleCasePreserving(response.data);
    res.send(transformed);
  } catch (err) {
    res.status(500).send('Failed to fetch or transform the page.');
  }
});

// Export for tests
module.exports = { app, replaceYaleWithFaleCasePreserving };

// Only start server if run directly (so Jest can import w/o binding ports)
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Faleproxy listening on ${port}`));
}