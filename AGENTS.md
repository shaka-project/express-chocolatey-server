# Agent Guide: Express Chocolatey Server

Express Chocolatey Server is a minimal Node.js library (and thin CLI wrapper)
that speaks just enough of the NuGet v2/OData protocol to satisfy the
Chocolatey client. It is intentionally not a full OData or NuGet
implementation. Agents working in this repo are typically modifying the library
(`chocolatey-server.js`) or its Atom XML templates (`static/`); the CLI
(`cli.js`) is a thin bootstrap and rarely needs changes.

It was built to serve shaka-lab packages to Windows devices.  See also
https://github.com/shaka-project/shaka-lab


## Attribution

Read [AGENT-ATTRIBUTION.md](AGENT-ATTRIBUTION.md) for attribution details.


## Directory overview

```
chocolatey-server.js      # Library: readPackageMetadata() and configureRoutes()
cli.js                    # Standalone CLI — bootstraps the library on PORT (default 8000)
static/                   # Atom XML templates; {key} placeholders filled from package metadata
  entry-template.atom     # One package entry
  packages-template.atom  # Wrapper for a list of entries
  root.atom               # Response for GET /
  metadata.atom           # Response for GET /$metadata
  error.atom              # Response for unrecognized filters
```


## Development workflow

Install dependencies:

```sh
npm install
```

There are no automated tests or linter yet (see issues #26 and #27). To verify
changes manually, you can download a sample package and run the CLI against it:

```sh
curl -L -o shaka-lab-browsers.nupkg \
  https://shaka-lab-chocolatey-dot-shaka-player-demo.appspot.com/download/shaka-lab-browsers
node cli.js shaka-lab-browsers.nupkg
```

Other available sample packages: `shaka-lab-gateway-client`, `shaka-lab-node`,
`shaka-lab-recommended-settings` (same URL pattern, different name).


## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/).
Prefix commit messages and PR titles with a type: `fix:`, `feat:`, `chore:`,
`docs:`, etc. The PR title becomes the changelog entry, so describe the
user-visible impact rather than the implementation detail.


## Gotchas

**The OData filter parsing is intentionally minimal.** The Chocolatey client
only ever sends two filter shapes in practice — one for exact install/upgrade
lookups and one for search. These are matched with two regexes. Do not attempt
to generalize this into a real OData implementation; it would add complexity
with no practical benefit.

**Do not break the `{EXPRESS_URL_ROOT}` placeholder.** Download URLs in
responses contain the literal string `{EXPRESS_URL_ROOT}`, which is replaced
with the request's protocol and host at response time. This allows the server
to generate correct absolute URLs without being pre-configured with its own
address. It must survive through template rendering untouched.

**Atom XML templates drive the response format.** The files in `static/` are
the response bodies. Metadata fields from the nupkg are injected via `{key}`
placeholders. If you add a new field to the response, the template is where it
goes.

**`nupkgData` vs `url` in package metadata.** When packages are loaded via the
CLI, the raw binary is stored in memory as `nupkgData` and a local download URL
is auto-generated. In library mode with externally-hosted packages, callers
provide a `url` field instead and omit `nupkgData`. Both paths go through the
same `configureRoutes()` — don't conflate them.
