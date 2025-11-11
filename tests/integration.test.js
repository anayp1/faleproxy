const request = require('supertest');
const cheerio = require('cheerio');
const app = require('../app'); // Import your app
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');

describe('Integration Tests', () => {
  beforeAll(() => {
    nock.disableNetConnect();
    nock.enableNetConnect((host) => host.startsWith('127.0.0.1'));
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  // Test to increase coverage
  test('Should serve the index.html file on the root route', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/html/);
    // CORRECTED: Changed 'Fale Proxy' to 'Faleproxy' to match the actual HTML
    expect(response.text).toContain('<h1>Faleproxy</h1>');
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    nock('https://example.com').get('/').reply(200, sampleHtmlWithYale);
    
    const response = await request(app)
      .post('/fetch')
      .send({ url: 'https://example.com/' });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    
    const $ = cheerio.load(response.body.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
  });

  test('Should handle invalid URLs', async () => {
    nock('http://not-a-valid-url').get('/').replyWithError('Invalid URL');

    const response = await request(app)
      .post('/fetch')
      .send({ url: 'http://not-a-valid-url' });
      
    expect(response.status).toBe(500);
  });

  test('Should handle missing URL parameter', async () => {
    const response = await request(app)
      .post('/fetch')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('URL is required');
  });
});