# UFM Playground

A static site for trying out Umbraco Flavored Markdown (UFM) templates without an Umbraco site, using Umbraco's own UFM code from `@umbraco-cms/backoffice`. See `README.md` for how it fits together.

- Hosted at https://ufm-playground.joe.gl/ (GitHub Pages, `glombek/ufm-playground`).
- **Pushing to `main` or a `release/v*` branch deploys it**, via `.github/workflows/deploy.yml`, so ask before pushing.
- `embed.js` is used by live posts (including the UFM cheat sheet), so a breaking change to `<ufm-preview>` breaks other sites. Keep its attributes backwards-compatible.
- Each Umbraco major has a branch: `main` is the latest release (at `/` and `/vNN/`), and `release/vNN` branches are older majors and pre-releases (at `/vNN/`). See "Umbraco versions" in `README.md`. Changes go on `main` unless they're for one version.

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
- Anything needing the Management API (pickers, `umbContentName`, `umbMemberName`, `umbElementName`, `umbLink`) is replaced by stand-ins, as there's no server.
- `embed.js` (`src/embed.ts`) is a tiny loader with no dependencies: `<ufm-preview>` loads the version's `embed-core.js` and shows a `<ufm-preview-core>` (`src/components/ufm-preview.ts`), the real renderer, which the playground uses directly. New attributes go on `<ufm-preview-core>`; `<ufm-preview>` passes them on.
- `embed-core.js` must stay small: no Monaco or other big editors. They load after the page renders, and only in the playground.
- Each build is served from more than one folder, so built pages use relative URLs (`base: './'`), and scripts use relative URLs too (`renderBuiltUrl` in `vite.config.ts`), as `embed-core.js` runs on other sites. Only links to the root-only pages (`/bookmarklet/`, `/embed.html`) use root URLs.
- The embed code is written to be safe in Markdown, as some blogs (including the cheat sheet's) parse Markdown inside HTML attributes and don't support fenced code. Keep the entity escaping in `src/app/embed-dialog.ts`.
- `src/editors/ufm-language/` must stay self-contained, so it could be lifted into Umbraco.

## Code style

- TypeScript, with Lit elements from `@umbraco-cms/backoffice/external/lit`: `static override properties`, `#private` methods, `customElements.define` and an `HTMLElementTagNameMap` entry.
- UUI and backoffice elements (`uui-*`, `umb-*`) over custom UI, so it looks like the backoffice.
- 2-space indentation, single quotes, semicolons.
