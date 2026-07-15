/*! @license
 * Express Chocolatey Server
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const assert = require('node:assert');
const path = require('node:path');
const {test} = require('node:test');

const express = require('express');
const request = require('supertest');

const {
  readPackageMetadata,
  configureRoutes,
} = require('../chocolatey-server.js');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const FIXTURES = [
  'shaka-lab-browsers.nupkg',
  'shaka-lab-gateway-client.nupkg',
  'shaka-lab-recommended-settings.nupkg',
];

const VERSION = '20260708.194501.0';

// The two filter shapes the Chocolatey client actually sends.
const ID_FILTER =
  "(tolower(Id) eq 'shaka-lab-browsers') and IsLatestVersion";
const SEARCH_FILTER =
  "((Id ne null) and substringof('gateway',tolower(Id))) or " +
    "((Tags ne null) and substringof(' gateway ',tolower(Tags)))";

// Build an Express app with all fixtures loaded, optionally with route options.
// Request logging is silenced by default so the tests run quietly; callers can
// override the log option to observe it.
function buildApp(options = {}) {
  const app = express();
  const packages = FIXTURES.map(
      (name) => readPackageMetadata(path.join(FIXTURE_DIR, name)));
  configureRoutes(app, packages, {log: () => {}, ...options});
  return app;
}

test('GET / serves the root atom document', async () => {
  const res = await request(buildApp()).get('/');

  assert.strictEqual(res.status, 200);
  assert.match(res.headers['content-type'], /atom\+xml/);
});

test('GET /$metadata serves the metadata document', async () => {
  const res = await request(buildApp()).get('/$metadata');

  assert.strictEqual(res.status, 200);
  assert.match(res.headers['content-type'], /atom\+xml/);
});

test('GET Packages(Id,Version) returns the matching package', async () => {
  const res = await request(buildApp()).get(
      `/Packages(Id='shaka-lab-browsers',Version='${VERSION}')`);

  assert.strictEqual(res.status, 200);
  assert.match(res.text, /shaka-lab-browsers/);
});

test('GET Packages(Id,Version) misses on a wrong version', async () => {
  const res = await request(buildApp()).get(
      "/Packages(Id='shaka-lab-browsers',Version='0.0.0')");

  assert.strictEqual(res.status, 200);
  assert.doesNotMatch(res.text, /shaka-lab-browsers/);
});

test('GET Packages() with an id filter matches by exact id', async () => {
  const res = await request(buildApp())
      .get('/Packages()')
      .query({$filter: ID_FILTER});

  assert.strictEqual(res.status, 200);
  assert.match(res.text, /shaka-lab-browsers/);
  assert.doesNotMatch(res.text, /shaka-lab-gateway-client/);
});

test('GET Packages() with a search filter matches by substring', async () => {
  const res = await request(buildApp())
      .get('/Packages()')
      .query({$filter: SEARCH_FILTER});

  assert.strictEqual(res.status, 200);
  assert.match(res.text, /shaka-lab-gateway-client/);
  assert.doesNotMatch(res.text, /shaka-lab-browsers/);
});

test('GET Packages() with an unrecognized filter returns 400', async () => {
  const res = await request(buildApp())
      .get('/Packages()')
      .query({$filter: 'nonsense'});

  assert.strictEqual(res.status, 400);
});

test('GET FindPackagesById() matches by id and strips quotes', async () => {
  const res = await request(buildApp())
      .get('/FindPackagesById()')
      .query({id: "'shaka-lab-browsers'"});

  assert.strictEqual(res.status, 200);
  assert.match(res.text, /shaka-lab-browsers/);
});

test('GET download/:name returns the package bytes', async () => {
  const fixture = readPackageMetadata(
      path.join(FIXTURE_DIR, 'shaka-lab-browsers.nupkg'));
  const res = await request(buildApp()).get('/download/shaka-lab-browsers');

  assert.strictEqual(res.status, 200);
  assert.match(res.headers['content-type'], /octet-stream/);
  assert.strictEqual(
      Number(res.headers['content-length']), fixture.nupkgData.length);
});

test('GET download/:name returns 404 for an unknown package', async () => {
  const res = await request(buildApp()).get('/download/nope');

  assert.strictEqual(res.status, 404);
});

test('download URLs default to the request host', async () => {
  const res = await request(buildApp())
      .get('/Packages()')
      .query({$filter: ID_FILTER});

  assert.match(res.text, /http:\/\/[^"]*\/download\/shaka-lab-browsers/);
  assert.doesNotMatch(res.text, /EXPRESS_URL_ROOT/);
});

test('the urlRoot option overrides the download host', async () => {
  const res = await request(buildApp({urlRoot: 'https://example.com'}))
      .get('/Packages()')
      .query({$filter: ID_FILTER});

  assert.match(
      res.text, /https:\/\/example\.com\/download\/shaka-lab-browsers/);
});

test('the _flat_deps field renders dependencies', async () => {
  const res = await request(buildApp())
      .get('/FindPackagesById()')
      .query({id: "'shaka-lab-recommended-settings'"});

  assert.match(res.text, /<d:Dependencies>vim::<\/d:Dependencies>/);
});

test('the log option receives request diagnostics', async () => {
  const messages = [];
  const app = buildApp({log: (...args) => messages.push(args)});

  await request(app)
      .get('/FindPackagesById()')
      .query({id: "'shaka-lab-browsers'"});

  assert.ok(messages.length > 0);
  assert.strictEqual(messages[0][0], 'Matched package by ID');
});

test('routes are served under a custom prefix', async () => {
  const app = buildApp({prefix: 'choco'});

  const prefixed = await request(app).get('/choco/');
  assert.strictEqual(prefixed.status, 200);

  const unprefixed = await request(app).get('/');
  assert.strictEqual(unprefixed.status, 404);
});
