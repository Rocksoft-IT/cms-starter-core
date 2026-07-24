# @rocksoft/cms-starter-core

Shared CMS-driven Astro starter core — page-builder **blocks**, the **BlockRenderer**, the block
**registry**, the **API client** and **types** — consumed by each client site as a git dependency:

```json
"@rocksoft/cms-starter-core": "github:Rocksoft-IT/cms-starter-core#v0.1.0"
```

Source of truth is `frontend/packages/cms-starter-core/` in `Rocksoft-IT/diligently-dashboard`;
this repo is its release target (see epic diligently-dashboard#843). The consuming site provides
the `~site` alias (its `cms.config.ts`) at build time.
