/*! @license
 * Express Chocolatey Server
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const AdmZip = require('adm-zip');
const express = require('express');
const fs = require('fs/promises');
const xmldoc = require('xmldoc');

const CONTENT_TYPE = 'Content-Type';
const ATOM_MIME_TYPE = 'application/atom+xml; charset=utf-8';
const BINARY_MIME_TYPE = 'application/octet-stream';

const root = __dirname;

/**
 * Read package metadata from a nupkg file.  The output is everything from the
 * metadata section of the nuspec, as a plain JS object.
 *
 * @param {string} path Path to a nupkg file.
 * @return {!PackageMetadata}
 */
function readPackageMetadata(path) {
  const zipReader = new AdmZip(path);

  // Get a pointer to the nuspec file embedded in the zip.
  const relData = zipReader.readAsText('_rels/.rels');
  const relDoc = new xmldoc.XmlDocument(relData);
  const manifestElement = relDoc.childrenNamed('Relationship').find(
      (element) => element.attr.Type.endsWith('/manifest'));
  if (!manifestElement) {
    throw new Error(`Unable to locate nupkg manifest in ${path}`);
  }
  // Remove the leading slash from the path.
  const nuspecPath = manifestElement.attr.Target.replace(/^\//, '');

  // Read the nuspec metadata.
  const nuspecData = zipReader.readAsText(nuspecPath);
  const nuspecDoc = new xmldoc.XmlDocument(nuspecData);
  const metadataElements = nuspecDoc.childNamed('metadata').children;

  // Convert and return the metadata.  This will feed into our templates later.
  const metadata = {};
  for (const element of metadataElements) {
    if ('text' in element) {
      // Skip text nodes.
      continue;
    }

    // Filter out text nodes from children.
    const children = element.children.filter((element) => !('text' in element));
    if (children.length) {
      // If there are children, store their attributes.
      // For example:
      //   <dependencies><dependency id="foo" version="bar"/></dependencies>
      // Becomes:
      //   [ { "id": "foo", "version": "bar" } ]
      metadata[element.name] = children.map((child) => child.attr);
    } else {
      // Otherwise, store the text value in the element.
      metadata[element.name] = element.val;
    }
  }

  metadata.nupkgData = zipReader.toBuffer();
  return metadata;
}

/**
 * Preprocess certain properties from the raw package metadata, so that they
 * can be easily inserted into our templates.
 *
 * @param {string} prefix A route prefix, to construct download URLs.
 * @param {!Array<!PackageMetadata>} packageMetadataList
 */
function preprocessPackageMetadata(prefix, packageMetadataList) {
  for (const entry of packageMetadataList) {
    // The dependency format is odd, with id and version being combined and
    // followed by colons, then multiple dependencies separated by pipes.
    if (entry.dependencies) {
      entry._flat_deps = entry.dependencies.map((dep) => {
        return dep.id + ':' + (dep.version || '') + ':';
      }).join('|');
    } else {
      entry._flat_deps = '';
    }

    // It is expected that tags have both leading and trailing spaces.
    if (entry.tags) {
      entry._flat_tags = ' ' + entry.tags + ' ';
    } else {
      entry._flat_tags = '';
    }

    // If we have a buffer for the nupkg file, add a URL that points back to
    // this server to download it.  Applications can also provide an explicit,
    // off-site URL.  {EXPRESS_URL_ROOT} will be replaced by the root of the
    // request right before serving the response, so that responses can contain
    // absolute URLs without preconfiguring the server with its own address.
    if (entry.nupkgData) {
      entry.url = `{EXPRESS_URL_ROOT}${prefix}download/${entry.id}`;
    }
  }
}

/**
 * Configure the necessary routes in express to serve Chocolatey packages.
 *
 * Rather than build a complete odata server, build the minimal set of routes
 * that are required to satisfy the Chocolatey client.
 *
 * @param {Express} app An express app to add routes to.
 * @param {string} prefix A route prefix.  All added routes will begin with
 *     this path.
 * @param {!Array<!PackageMetadata> packageMetadataList
 * @return {!Promise}
 */
async function configureRoutes(app, prefix, packageMetadataList) {
  // Route prefixes should start and end with a slash.
  if (!prefix.startsWith('/')) {
    prefix = '/' + prefix;
  }
  if (!prefix.endsWith('/')) {
    prefix += '/';
  }

  preprocessPackageMetadata(prefix, packageMetadataList);

  const rootAtom = await fs.readFile(
      `${root}/static/root.atom`, 'utf8');
  const metadataAtom = await fs.readFile(
      `${root}/static/metadata.atom`, 'utf8');
  const errorAtom = await fs.readFile(
      `${root}/static/error.atom`, 'utf8');
  const entryTemplate = await fs.readFile(
      `${root}/static/entry-template.atom`, 'utf8');
  const packagesTemplate = await fs.readFile(
      `${root}/static/packages-template.atom`, 'utf8');

  // Wrap app.get in an error handler.
  function get(path, handler) {
    app.get(path, async (req, res) => {
      try {
        await handler(req, res);
        res.end();
      } catch (error) {
        console.error(error.stack)
        res.status(500).send('Exception!');
      }
    });
  }

  // This is a giant hack to avoid much, much smarter server.
  // We only see two types of filters in practice coming from choco clients.
  // For install/upgrade commands, we see filters like this:
  //   "(tolower(Id) eq 'foo') and IsLatestVersion"
  // For search commands, we see filters like this:
  //   "(((Id ne null) and substringof('foo',tolower(Id))) or
  //     ((Description ne null) and substringof('foo',tolower(Description)))) or
  //     ((Tags ne null) and substringof(' foo ',tolower(Tags)))"
  // We only need to roughly match these and extract the package names.

  function filterForOnePackage(filter) {
    const match = filter.match(/tolower\(Id\) eq '(.*)'/i);
    return match ? match[1] : null;
  }

  function filterForManyPackages(filter) {
    const match = filter.match(/substringof\('(.*?)',tolower\(.*?\)\)/);
    return match ? match[1] : null;
  }

  function formatPackages(matchedPackages, req) {
    const entries = matchedPackages.map((entry) => {
      return entryTemplate.replace(/{(.*)}/g, (match, key) => entry[key] || '');
    });

    const url_root = req.protocol + '://' + req.get('host');

    return packagesTemplate
        .replace(/{entries}\n/g, entries.join(''))
        .replace(/{EXPRESS_URL_ROOT}/, url_root);
  }

  get(`${prefix}`, (req, res) => {
    res.set(CONTENT_TYPE, ATOM_MIME_TYPE);
    res.send(rootAtom);
  });

  get(`${prefix}[\$]metadata`, (req, res) => {
    res.set(CONTENT_TYPE, ATOM_MIME_TYPE);
    res.send(metadataAtom);
  });

  get(`${prefix}Packages[\(][\)]`, (req, res) => {
    const filter = req.query['$filter'];
    const name = filterForOnePackage(filter);
    const substring = filterForManyPackages(filter);

    let matchedPackages = [];
    if (name) {
      matchedPackages = packageMetadataList.filter(
          (entry) => entry.id == name);
      console.log('Name filter', {name, matchedPackages});
    } else if (substring) {
      matchedPackages = packageMetadataList.filter((entry) => {
        return entry.id.includes(substring) ||
               entry.summary.includes(substring) ||
               entry._flat_tags.includes(' ' + substring + ' ');
      });
      console.log('Search filter', {substring, matchedPackages});
    } else {
      console.log('Unrecognized filter');
      res.status(400);
      res.set(CONTENT_TYPE, ATOM_MIME_TYPE);
      res.send(errorAtom);
      return;
    }

    res.set(CONTENT_TYPE, ATOM_MIME_TYPE);
    res.send(formatPackages(matchedPackages, req));
  });

  get(`${prefix}FindPackagesById[\(][\)]`, (req, res) => {
    // The raw ID from the query string seems to be surrounded by
    // single-quotes.  Strip single-quotes from the ID.
    const id = (req.query['id'] || '').replace(/'(.*)'/, '$1');
    const matchedPackages = packageMetadataList.filter(
        (entry) => entry.id == id);
    console.log('Matched package by ID', {id, matchedPackages});

    res.set(CONTENT_TYPE, ATOM_MIME_TYPE);
    res.send(formatPackages(matchedPackages, req));
  });

  get(`${prefix}download/:name`, (req, res) => {
    const name = req.params.name;
    const matchedPackage = packageMetadataList.find(
        (entry) => entry.id == name);
    if (matchedPackage) {
      res.set(CONTENT_TYPE, BINARY_MIME_TYPE);
      res.send(matchedPackage.nupkgData);
    } else {
      res.status(404);
      res.send('Not found');
    }
  });
}

module.exports = {
  readPackageMetadata,
  configureRoutes,
};
