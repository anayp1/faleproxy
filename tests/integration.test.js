const axios = require('axios');
const cheerio = require('cheerio');
const nock = require('nock');
const { sampleHtmlWithYale } = require('./test-utils');
const { app } = require('../app');

const TEST_PORT = 3099;
let server;

describe('Integration Tests', () => {
  beforeAll(async () => {
    // Allow only localhost; mock everything else
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');

    // Start the app on a test port without editing files
    server = app.listen(TEST_PORT);
    await new Promise(r => setTimeout(r, 500));
  }, 10000);

  afterAll(async () => {
    if (server && server.close) {
      await new Promise(r => server.close(r));
    }
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Mock the external page
    nock('https://example.com').get('/').reply(200, sampleHtmlWithYale);

    // Call our proxy
    const response = await axios.post(`http://127.0.0.1:${TEST_PORT}/fetch`, {
      url: 'https://example.com/',
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);

    // Validate transformed HTML
    const $ = cheerio.load(response.data.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');

    // URLs should remain unchanged
    const links = $('a')
      .map((_, a) => $(a).attr('href'))
      .get();
    expect(links.some(h => (h || '').includes('yale.edu'))).toBe(true);

    // Link text should be updated
    expect($('a').first().text()).toBe('About Fale');
  }, 15000);

  test('Should handle invalid URLs', async () => {
    try {
      await axios.post(`http://127.0.0.1:${TEST_PORT}/fetch`, {
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
      await axios.post(`http://127.0.0.1:${TEST_PORT}/fetch`, {});
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data.error).toBe('URL is required');
    }
  });
});
