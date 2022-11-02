#!/usr/bin/env node

/*! @license
 * Express Chocolatey Server
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const express = require('express');
const fs = require('fs');

const chocolateyServer = require('./chocolatey-server.js');

const app = express();
const port = process.env['PORT'] || 8000;

// Express middleware that logs all requests.
function loggingMiddleware(req, res, next) {
  console.log(req.method, req.path, req.query);
  next();
}

(async () => {
  // Log requests.
  app.use(loggingMiddleware);

  // Load metadata about Chocolatey packages given on the command-line.
  const packagePaths = process.argv.slice(2);
  if (!packagePaths.length) {
    console.log('Please specify paths to Chocolatey packages.');
    process.exit(1);
  }
  const packageMetadataList = await Promise.all(packagePaths.map((path) => {
    return chocolateyServer.readPackageMetadata(path);
  }));

  console.log('Loaded packages:', packageMetadataList);

  // Configure Chocolatey server routes at the root.
  await chocolateyServer.configureRoutes(app, '/', packageMetadataList);

  // Start the server.
  app.listen(port, () => {
    console.log(`Listening on port ${port}`)
    console.log('To override the port, use the PORT environment variable.');
  });
})();
