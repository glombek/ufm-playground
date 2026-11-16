---
name: umbraco-versions
description: Check for new @umbraco-cms/backoffice releases and pre-releases, find what's changed in UFM (and how labels are rendered) in them, bring the playground's version branches up to date, and test them. Use when asked to check for new Umbraco versions, upgrade a version branch (main or release/vNN), add a new major or RC, or look for new UFM features.
---

# Umbraco versions

Each Umbraco major has its own playground branch (see "Umbraco versions" in `README.md`):
`main` is the latest release (at `/` and `/vNN/`); `release/vNN` branches are older majors and
pre-releases (at `/vNN/`). Pushing any of them deploys the whole site, so **never push without
asking**, and ask before committing unless the user has said to go ahead.

Changes that only apply to one version go on that version's branch. Changes for the latest
version and up go on `main`, then get merged into the newer `release/vNN` branches.

## 1. What's new

```
node .claude/skills/umbraco-versions/scripts/versions.mjs
```

It lists each major's latest release and pre-release on npm next to the branch that has it, and
what to do: update a branch, create a `release/vNN` branch for a new pre-release, or (when a
pre-release major is released) archive `main` as `release/vNN` and move the new major onto `main`.
Don't trust npm's `latest` dist-tag: it has pointed at an RC.

If everything's up to date, say so and stop.

## 2. What's changed in UFM

For each version to move to, install it into a throwaway copy, in the scratchpad, never the repo:

```
mkdir -p "$SCRATCH/<version>" && git ls-files -co --exclude-standard | tar -cf - -T - | tar -xf - -C "$SCRATCH/<version>"
cd "$SCRATCH/<version>" && npm install --no-audit --no-fund @umbraco-cms/backoffice@<version> && npm run build
```

Then compare its `node_modules/@umbraco-cms/backoffice/dist-cms/packages` with the branch's
current version (another copy, or the repo's `node_modules` on that branch):

- **UFM itself** (`packages/ufm`): diff the file lists and contents. Look at
  `components/manifests.js` (new components, e.g. `umbElementName` in 18), `filters/manifests.js`
  (new filters), `utils/`, `ufm-render` and `ufm-js-expression.element.js` (how expressions run).
- **Where labels are rendered**: grep the other packages for `renderUfm(`, `umb-ufm-render`,
  `UmbUfmVirtualRenderController` and `ufm-…-name`, and diff against the old version. New users of
  UFM, or blocks that skip it, matter: e.g. 19's element library blocks show the element's name
  instead of the label.
- **Values labels get**: diff `packages/block/block/types.d.ts` (block values, e.g. 19's
  `isExternalContent` layout entries with no `contentData`) and the property editors whose values
  templates commonly use.
- **New feature areas**: diff the folder list (`find packages -maxdepth 2 -type d`) and check new
  folders for UFM or label use.
- **Breakage**: the internal files `src/` imports through the aliases in `vite.config.ts`
  (`grep -rhoE "@(ufm-internal|umb-core|umb-tiptap|umb-tags|umb-assets|uui-dist)/[^'\"]+" src`)
  must still exist, and `monaco-editor`'s peer range (`npm view @umbraco-cms/backoffice@<version>
  peerDependencies dependencies`) must still allow the pinned 0.55.1.

Umbraco's release notes (GitHub releases for `umbraco/Umbraco-CMS`) can point at what to look for,
but the package is what the playground runs, so check there.

Summarise what's new or changed for UFM, which branch each finding belongs on, and what the
playground needs (a stand-in in `src/ufm/runtime.ts`, docs in `src/editors/ufm-language/reference.ts`,
analysis hints, value kinds, examples, bookmarklet changes). Run that past the user before building
anything big.

## 3. Updating a branch

On the branch: `npm install @umbraco-cms/backoffice@<version>`, then make the playground changes.
For a new pre-release major, create `release/vNN` from `main` first. On Windows, stop any
running `npm run preview` or `dev` server before `npm ci`/`npm install`: it locks `esbuild.exe`.

## 4. Testing

1. `npm run build && npm test` on each changed branch (or its scratch copy). The deploy runs the
   same for every branch, and any failure stops it.
2. **Expected outputs** (`EXPECTED` in `tests/examples.test.mjs`) were recorded from a real Umbraco
   site. Never change them to match the playground. If a version renders an example differently,
   or there's a new example, the output has to be recorded from a real site on that version:
   the sample site in `CLAUDE.local.md`, run on that version, with `npm run test:bookmarklet`.
   That needs the user, so list exactly what needs recording. A passing test on a new version only
   shows its UFM renders the same as the version the outputs came from.
3. **The whole site**: build each branch, combine them like the deploy does, and serve the result
   with CORS (GitHub Pages sends `Access-Control-Allow-Origin: *`, and `embed.js` loads
   cross-origin):
   ```
   node scripts/assemble-site.mjs "$SCRATCH/site" <main's dist> <other branches' dists…>
   ```
   Check the version picker lists every version, switching keeps the template, Copy link's options
   and the embed's `version` attribute point at the right folders, and a blog page with
   `<ufm-preview version="NN">` loads `/vNN/embed-core.js`.

## 5. Report

What changed in each version, what was updated on which branch, the test results (with any
failures as output), what still needs recording from a real site, and the commands to push. Don't
push.
