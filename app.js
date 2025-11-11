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

/**
 * Replace only when a Yale token is immediately followed by:
 *   University | College | medical school
 * Operates **within one text node** to avoid crossing element boundaries.
 */
function replaceBrandPhrasesInText(text) {
  // tokens we accept after "Yale"
  const afterWords = ['university', 'college', 'medical school'];

  // scan the text manually for word "Yale" (any case)
  const yaleWordRe = /\b([Yy][Aa][Ll][Ee])\b/g;

  let out = '';
  let lastIndex = 0;
  let m;

  while ((m = yaleWordRe.exec(text)) !== null) {
    const start = m.index;
    const end = yaleWordRe.lastIndex; // end of "Yale" token
    const yaleToken = m[1]; // preserves original case

    // Look ahead in the same text node
    const rest = text.slice(end); // after "Yale"
    // Allow any amount of whitespace before the next word(s)
    const ws = rest.match(/^\s+/);
    const afterStart = ws ? ws[0].length : 0;
    const after = rest.slice(afterStart);

    // Check for allowed phrases (case-insensitive)
    let matchesPhrase = false;
    for (const aw of afterWords) {
      if (after.toLowerCase().startsWith(aw)) {
        // Also ensure we end on a word boundary (e.g., "University" not "UniversityX")
        const boundaryChar = after.charAt(aw.length);
        if (!boundaryChar || /\b/.test(boundaryChar)) {
          matchesPhrase = true;
          break;
        }
      }
    }

    // Emit previous untouched chunk
    out += text.slice(lastIndex, start);

    if (matchesPhrase) {
      // Replace just the Yale token with case-preserved "Fale"
      out += yaleToFalePreserveCase(yaleToken);
    } else {
      // Leave it exactly as-is (e.g., "no Yale references")
      out += yaleToken;
    }

    lastIndex = end;
  }

  // Append the remaining tail
  out += text.slice(lastIndex);
  return out;
}

/**
 * Replace only:
 *  - brand phrases in any text node (by scanning tokens)
 *  - a bare "Yale" in anchor text when the full label is exactly "About Yale"
 * Never touch attributes/URLs or script/style.
 */
function replaceYaleWithFaleCasePreserving(html) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $('*').each((_, el) => {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'script' || tag === 'style') return;

    // 1) Brand phrases in all text nodes
    for (const node of el.childNodes || []) {
      if (node.type !== 'text' || !node.data) continue;
      const replaced = replaceBrandPhrasesInText(node.data);
      if (replaced !== node.data) node.data = replaced;
    }

    // 2) Anchor label “About Yale” -> “About Fale” (exact label)
    if (tag === 'a') {
      for (const node of el.childNodes || []) {
        if (node.type !== 'text' || !node.data) continue;
        const trimmed = node.data.trim();
        if (trimmed === 'About Yale') {
          node.data = trimmed.replace(/\b(YALE|Yale|yale)\b/, (w) =>
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
