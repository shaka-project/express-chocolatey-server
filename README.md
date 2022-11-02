# Express Chocolatey Server

A simple Chocolatey package server for Express.

Designed to host packages for https://github.com/shaka-project/shaka-lab

If you need to serve Chocolatey packages, and the
[other options](https://docs.chocolatey.org/en-us/features/host-packages)
look too complicated, this is the server for you.

It doesn't require Windows, it doesn't require .NET, it can be deployed
anywhere you can use [Express](https://expressjs.com/), and it can be
integrated into other Express-based servers.  It is not a full nuget v2 API
implementation, nor a full odata implementation.  Rather, it implements the
bare minimum to interact with the Chocolatey client.

You can use the standalone server CLI to serve the packages themselves as well
as their metadata.  Or, if you want to host the package files separately, you
can use the module as a library and provide the package metadata.


## Standalone server 

If you want to host the actual package files in the same server, this is the
easiest way to use express-chocolatey-server.  You can use our standalone
server CLI, and provide paths to all the packages you want to serve.

```sh
PORT=8000 npx express-chocolatey-server *.nupkg
```


## Hosting packages separately

The library provides two methods:

`function readPackageMetadata(path)`: Reads a single nupkg file and returns
metadata extracted from it.

`async function configureRoutes(app, prefix, packageMetadataList)`: Sets up
Express routes for a Chocolatey server under the given prefix, and serves
metadata for the packages listed.

If you want to host the packages separately from the Express server, you will
want to pre-computing the package metadata, rather than maintaining it by hand.

```js
// This is an example script for pre-computing package metadata and hosting
// packages on another server.

const chocolateyServer = require('express-chocolatey-server');

(async () => {
  // Load metadata about chocolatey packages given on the command-line.
  const packagePaths = process.argv.slice(2);
  const packageMetadataList = await Promise.all(packagePaths.map((path) => {
    return chocolateyServer.readPackageMetadata(path);
  }));

  // YOU NEED TO CUSTOMIZE THIS PART.
  // In each package entry, add a `url` field with the download URL.

  // Save this JSON to a file to be loaded in the server later.
  console.log(JSON.stringify(packageMetadataList));
});
```

```js
// This is an example server using pre-computed metadata, with packages hosted
// on another server.

const express = require('express');
const chocolateyServer = require('express-chocolatey-server');

const app = express();
const port = process.env['PORT'] || 8000;

(async () => {
  // Load pre-computed package metadata in JSON.
  // These entries MUST have a `url` field.
  const packageMetadataList = require('package-metadata.json');

  // Configure chocolatey server routes at the root ('/').
  // You could also use any other route prefix you like.
  await chocolateyServer.configureRoutes(app, '/', packageMetadataList);

  // Start the server.
  app.listen(port, () => {
    console.log(`Listening on port ${port}`)
  });
})();
```
