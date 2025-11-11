const axios = require('axios');
const cheerio = require('cheerio');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { sampleHtmlWithYale } = require('./test-utils');

const TEST_PORT = 3099;        // faleproxy test server
const UPSTREAM_PORT = 3101;    // local upstream server we control
let proxyProc;
let upstreamServer;

// Cross-platform in-place text replacement
function inplaceReplace(file, fromRegex, toStr) {
  const p = path.resolve(file);
  const s = fs.readFileSync(p, 'utf8');
  const updated = s.replace(fromRegex, toStr);
  fs.writeFileSync(p, updated);
}

describe('Integration Tests', () => {
  beforeAll(async () => {
    // 1) Start a tiny local upstream server that returns the Yale HTML
    const upstream = express();
    upstream.get('/', (_req, res) => {
      res.status(200).send(sampleHtmlWithYale);
    });
    await new Promise((resolve) => {
      upstreamServer = upstream.listen(UPSTREAM_PORT, resolve);
    });

    // 2) Copy app.js → app.test.js and set the port to TEST_PORT
    fs.copyFileSync(path.resolve('app.js'), path.resolve('app.test.js'));
    inplaceReplace('app.test.js', /const\s+PORT\s*=\s*\d+/g, `const PORT = ${TEST_PORT}`);

    // 3) Spawn the proxy server in a child process
    proxyProc = spawn(process.execPath, ['app.test.js'], {
      detached: true,
      stdio: 'ignore',
    });

    // Give the server a moment to boot
    await new Promise((r) => setTimeout(r, 1200));
  }, 20000);

  afterAll(async () => {
    // Stop proxy
    if (proxyProc && proxyProc.pid) {
      try { process.kill(-proxyProc.pid); } catch (_) {}
    }
    try { fs.unlinkSync(path.resolve('app.test.js')); } catch (_) {}

    // Stop upstream
    if (upstreamServer) {
      await new Promise((resolve) => upstreamServer.close(resolve));
    }
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    const response = await axios.post(`http://127.0.0.1:${TEST_PORT}/fetch`, {
      url: `http://127.0.0.1:${UPSTREAM_PORT}/`,
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);

    const $ = cheerio.load(response.data.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');

    // URLs should remain unchanged (yale.edu stays)
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
      await axios.post(`http://127.0.0.1:${TEST_PORT}/fetch`, { url: 'not-a-valid-url' });
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(500);
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(`http://127.0.0.1:${TEST_PORT}/fetch`, {});
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data.error).toBe('URL is required');
    }
  });
});
