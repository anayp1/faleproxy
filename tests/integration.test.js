const axios = require('axios');
const cheerio = require('cheerio');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');

// Use a different port so we don't collide with local runs
const TEST_PORT = 3099;
let server;

// Cross-platform in-place text replacement
function inplaceReplace(file, fromRegex, toStr) {
  const p = path.resolve(file);
  const s = fs.readFileSync(p, 'utf8');
  const updated = s.replace(fromRegex, toStr);
  fs.writeFileSync(p, updated);
}

describe('Integration Tests', () => {
  beforeAll(async () => {
    // Block outbound network, allow localhost and 127.0.0.1
    nock.disableNetConnect();
    nock.enableNetConnect(/(127\.0\.0\.1|localhost)/);

    // Copy app.js → app.test.js and swap the port to TEST_PORT
    fs.copyFileSync(path.resolve('app.js'), path.resolve('app.test.js'));
    inplaceReplace('app.test.js', /const\s+PORT\s*=\s*\d+/g, `const PORT = ${TEST_PORT}`);

    // Spawn the test server
    server = spawn(process.execPath, ['app.test.js'], {
      detached: true,
      stdio: 'ignore',
    });

    // Give the server a moment to boot
    await new Promise((r) => setTimeout(r, 2000));
  }, 15000);

  afterAll(async () => {
    // Kill the server (ignore errors if already closed)
    if (server && server.pid) {
      try { process.kill(-server.pid); } catch (_) {}
    }
    try { fs.unlinkSync(path.resolve('app.test.js')); } catch (_) {}
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Mock upstream site
    nock('https://example.com').get('/').reply(200, sampleHtmlWithYale);

    // Call our proxy
    const response = await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
      url: 'https://example.com/',
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);

    // Validate transformed HTML
    const $ = cheerio.load(response.data.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');

    // URLs must remain unchanged
    let hasYaleUrl = false;
    $('a').each((_, link) => {
      const href = $(link).attr('href');
      if (href && href.includes('yale.edu')) hasYaleUrl = true;
    });
    expect(hasYaleUrl).toBe(true);

    // Link text should be updated
    expect($('a').first().text()).toBe('About Fale');
  }, 15000);

  test('Should handle invalid URLs', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, { url: 'not-a-valid-url' });
      expect(true).toBe(false); // should not reach
    } catch (error) {
      expect(error.response.status).toBe(500);
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {});
      expect(true).toBe(false); // should not reach
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data.error).toBe('URL is required');
    }
  });
});
