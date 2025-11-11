const axios = require('axios');
const cheerio = require('cheerio');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');

// Set a different port for testing to avoid conflict with the main app
const TEST_PORT = 3099;
let server;

// Cross-platform in-place text replacement (avoids macOS-only `sed -i ''`)
function inplaceReplace(file, fromRegex, toStr) {
  const p = path.resolve(file);
  const s = fs.readFileSync(p, 'utf8');
  const updated = s.replace(fromRegex, toStr);
  fs.writeFileSync(p, updated);
}

describe('Integration Tests', () => {
  beforeAll(async () => {
    // Mock external HTTP requests, but allow localhost
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');

    // Create a temporary test app file, and swap the port to TEST_PORT
    fs.copyFileSync(path.resolve('app.js'), path.resolve('app.test.js'));
    inplaceReplace(
      'app.test.js',
      /const\s+PORT\s*=\s*\d+/g,
      `const PORT = ${TEST_PORT}`
    );

    // Start the test server
    server = spawn(process.execPath, ['app.test.js'], {
      detached: true,
      stdio: 'ignore',
    });

    // Give the server time to start
    await new Promise((r) => setTimeout(r, 2000));
  }, 15000);

  afterAll(async () => {
    // Kill the test server and clean up
    if (server && server.pid) {
      try {
        process.kill(-server.pid);
      } catch (_) {
        // ignore if already exited
      }
    }
    try {
      fs.unlinkSync(path.resolve('app.test.js'));
    } catch (_) {
      // ignore
    }
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test(
    'Should replace Yale with Fale in fetched content',
    async () => {
      // Setup mock for example.com
      nock('https://example.com').get('/').reply(200, sampleHtmlWithYale);

      // Make a request to our proxy app
      const response = await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
        url: 'https://example.com/',
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      // Verify Yale has been replaced with Fale in text
      const $ = cheerio.load(response.data.content);
      expect($('title').text()).toBe('Fale University Test Page');
      expect($('h1').text()).toBe('Welcome to Fale University');
      expect($('p').first().text()).toContain('Fale University is a private');

      // Verify URLs remain unchanged
      const links = $('a');
      let hasYaleUrl = false;
      links.each((i, link) => {
        const href = $(link).attr('href');
        if (href && href.includes('yale.edu')) {
          hasYaleUrl = true;
        }
      });
      expect(hasYaleUrl).toBe(true);

      // Verify link text is changed
      expect($('a').first().text()).toBe('About Fale');
    },
    15000
  );

  test('Should handle invalid URLs', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
        url: 'not-a-valid-url',
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(500);
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {});
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data.error).toBe('URL is required');
    }
  });
});