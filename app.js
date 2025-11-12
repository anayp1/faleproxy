const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware to parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Route to serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Replaces all occurrences of "yale" with "fale" while preserving the original case.
 * @param {string} text The input text.
 * @returns {string} The modified text.
 */
function yaleToFale(text) {
  // Use a regex with word boundaries (\b) to only replace the whole word "yale"
  // The 'gi' flags make it global and case-insensitive.
  return text.replace(/\byale\b/gi, (match) => {
    if (match === 'YALE') return 'FALE';
    if (match === 'Yale') return 'Fale';
    return 'fale'; // for 'yale'
  });
}

// API endpoint to fetch and modify content
app.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const response = await axios.get(url);
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Process text nodes throughout the document
    $('body').find('*').addBack().contents().filter((i, el) => el.type === 'text').each((i, el) => {
      el.nodeValue = yaleToFale(el.nodeValue);
    });
    
    // Process the title separately
    const title = yaleToFale($('title').text());
    $('title').text(title);
    
    return res.json({ 
      success: true, 
      content: $.html(),
      title: title,
      originalUrl: url
    });
  } catch (error) {
    console.error('Error fetching URL:', error.message);
    return res.status(500).json({ 
      error: `Failed to fetch content: ${error.message}` 
    });
  }
});

// Start the server only if the file is run directly (not when imported for tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Faleproxy server running at http://localhost:${PORT}`);
  });
}

// Export the app for testing purposes
module.exports = app;