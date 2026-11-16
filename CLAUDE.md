# UFM Playground

A static site for trying out Umbraco Flavored Markdown (UFM) templates without an Umbraco site, using Umbraco's own UFM code from `@umbraco-cms/backoffice`. See `README.md` for how it fits together.

- Hosted at https://ufm-playground.joe.gl/ (GitHub Pages, `glombek/ufm-playground`).
- **Pushing to `main` deploys it**, via `.github/workflows/deploy.yml`, so ask before pushing.
- `embed.js` is used by live posts (including the UFM cheat sheet), so a breaking change to `<ufm-preview>` breaks other sites. Keep its attributes backwards-compatible.

## Commands

- `npm run dev`: dev server. If it gets stuck on "Outdated Optimize Dep" errors, use `npm run build && npm run preview` instead.
- `npm run build`: type-checks (`tsc --noEmit`) and builds the site and bookmarklet into `dist/`.
- `npm test`: run after a build. Checks every example in `src/app/examples.ts` renders what Umbraco rendered (`EXPECTED` in `tests/examples.test.mjs`), and that `embed.js` works from another origin. Uses the installed Chrome via Playwright.
- `npm run test:bookmarklet`: needs a local Umbraco site running (see `tests/bookmarklet.test.mjs`), so it isn't part of CI.

Run `npm run build && npm test` before calling a change done.

## Things to know

- The expected outputs in the tests were recorded from a real Umbraco site. Don't change them to match the playground: if output changes, it has to be checked against Umbraco first.
- `monaco-editor` is pinned to 0.55.1, the version Umbraco builds with. Newer versions moved the files the backoffice imports.
- Some UFM internals aren't in the package's exports, so they're imported through the aliases in `vite.config.ts` (and `tsconfig.json`): `@ufm-internal`, `@umb-core` and so on.
- Anything needing the Management API (pickers, `umbContentName`, `umbMemberName`, `umbLink`) is replaced by stand-ins, as there's no server.
- `embed.js` must stay small: no Monaco or other big editors. They load after the page renders, and only in the playground.
- Pages use root URLs (`/bookmarklet/`), but URLs inside scripts are relative (`renderBuiltUrl` in `vite.config.ts`), as `embed.js` runs on other sites.
- The embed code is written to be safe in Markdown, as some blogs (including the cheat sheet's) parse Markdown inside HTML attributes and don't support fenced code. Keep the entity escaping in `src/app/embed-dialog.ts`.
- `src/editors/ufm-language/` must stay self-contained, so it could be lifted into Umbraco.

## Code style

- TypeScript, with Lit elements from `@umbraco-cms/backoffice/external/lit`: `static override properties`, `#private` methods, `customElements.define` and an `HTMLElementTagNameMap` entry.
- UUI and backoffice elements (`uui-*`, `umb-*`) over custom UI, so it looks like the backoffice.
- 2-space indentation, single quotes, semicolons.
