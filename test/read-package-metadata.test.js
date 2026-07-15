/*! @license
 * Express Chocolatey Server
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const assert = require('node:assert');
const path = require('node:path');
const {test} = require('node:test');

const {readPackageMetadata} = require('../chocolatey-server.js');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');

function readFixture(name) {
  return readPackageMetadata(path.join(FIXTURE_DIR, name));
}

test('extracts core metadata fields from the nuspec', () => {
  const metadata = readFixture('shaka-lab-browsers.nupkg');

  assert.strictEqual(metadata.id, 'shaka-lab-browsers');
  assert.strictEqual(metadata.version, '20260708.194501.0');
  assert.strictEqual(metadata.summary, 'Shaka Lab Browsers');
  assert.strictEqual(metadata.tags, 'shaka-lab-browsers shaka-lab');
});

test('stores the raw package bytes as a Buffer', () => {
  const metadata = readFixture('shaka-lab-browsers.nupkg');

  assert.ok(Buffer.isBuffer(metadata.nupkgData));
  assert.ok(metadata.nupkgData.length > 0);
});

test('parses dependencies into an array of attribute objects', () => {
  const metadata = readFixture('shaka-lab-recommended-settings.nupkg');

  assert.deepStrictEqual(metadata.dependencies, [{id: 'vim'}]);
});

test('leaves dependencies undefined when the package has none', () => {
  const metadata = readFixture('shaka-lab-gateway-client.nupkg');

  assert.strictEqual(metadata.dependencies, undefined);
});
