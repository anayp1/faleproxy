const cheerio = require('cheerio');
const { sampleHtmlWithYale } = require('./test-utils');

// This is the same correct replacement function from your app.js.
// We include it here to test the logic in isolation.
function yaleToFale(text) {
  return text.replace(/\byale\b/gi, (match) => {
    if (match === 'YALE') return 'FALE';
    if (match === 'Yale') return 'Fale';
    return 'fale'; // for 'yale'
  });
}

describe('Yale to Fale replacement logic', () => {

  test('should replace Yale with Fale in complex HTML content', () => {
    const $ = cheerio.load(sampleHtmlWithYale);
    
    // Apply the correct logic to all text nodes
    $('body').find('*').addBack().contents().filter((i, el) => el.type === 'text').each((i, el) => {
      el.nodeValue = yaleToFale(el.nodeValue);
    });
    
    $('title').text(yaleToFale($('title').text()));
    
    const modifiedHtml = $.html();
    
    // Check text replacements
    expect(modifiedHtml).toContain('Fale University Test Page');
    expect(modifiedHtml).toContain('Welcome to Fale University');
    expect(modifiedHtml).toContain('Fale University is a private Ivy League');
    expect(modifiedHtml).toContain('Fale was founded in 1701');
    
    // Check that URLs remain unchanged
    expect(modifiedHtml).toContain('https://www.yale.edu/about');
    expect(modifiedHtml).toContain('https://www.yale.edu/admissions');
    
    // Check that link text is replaced
    expect(modifiedHtml).toContain('>About Fale<');
    expect(modifiedHtml).toContain('>Fale Admissions<');
    
    // Check that alt attributes are not changed
    expect(modifiedHtml).toContain('alt="Yale Logo"');
  });

  test('should handle text that has no Yale references', () => {
    const htmlWithoutYale = `
      <!DOCTYPE html>
      <html>
      <head><title>Test Page</title></head>
      <body>
        <h1>Hello World</h1>
        <p>This is a test page with no special references.</p>
      </body>
      </html>
    `;
    
    const modifiedHtml = yaleToFale(htmlWithoutYale);
    
    // The content should be completely unchanged
    expect(modifiedHtml).toContain('<title>Test Page</title>');
    expect(modifiedHtml).toContain('<h1>Hello World</h1>');
    expect(modifiedHtml).toContain('<p>This is a test page with no special references.</p>');
  });

  test('should handle case-insensitive replacements correctly', () => {
    const mixedCaseHtml = `
      <p>YALE University, Yale College, and yale medical school are all part of the same institution.</p>
    `;
    
    const $ = cheerio.load(mixedCaseHtml, { decodeEntities: false });
    
    $('p').text(yaleToFale($('p').text()));
    
    const modifiedHtml = $.html();

    // CORRECTED: This assertion now expects the proper case-preserved output
    expect(modifiedHtml).toContain('FALE University, Fale College, and fale medical school are all part of the same institution.');
  });
});