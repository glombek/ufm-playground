# UFM Playground

Try out [Umbraco Flavored Markdown](https://docs.umbraco.com/umbraco-cms/reference/umbraco-flavored-markdown) (UFM) templates for block labels, collection columns and property descriptions, without an Umbraco site.

Templates are rendered by **Umbraco's own UFM code**, from the [`@umbraco-cms/backoffice`](https://www.npmjs.com/package/@umbraco-cms/backoffice) package, so what you see is what the backoffice does, quirks and all.

- The template editor is Umbraco's own code editor (Monaco), with a `ufm` language: highlighting, completions (components, aliases, filters, translation keys, HTML and Umbraco's elements and icons) and hover help.
- Problems are flagged as you type: unknown filters or components, expressions that won't parse (like `x => …` without brackets), filter arguments that are silently ignored, missing translations and more.
- The blocks look and work like a block list in inline editing mode: each label is rendered from the template, and opening a block lets you edit its placeholder values with the backoffice's own editors (rich text, tags, repeatable textstrings…). Values are guessed from how the template uses each property (e.g. `stripHtml` means rich text, `umbContentName` means picked items), and can be changed or unset.
- There's always a "Nothing filled in" block too, showing the label as an editor would first see it, with a warning if it's blank.
- The URL updates as you go, so you can share a template, and there's an embed for using live previews in other pages (like blog posts).

## How it works

In the backoffice, UFM is wired up by the extension registry and a global context. `src/ufm/runtime.ts` does the same outside the backoffice:

- registers UFM's Marked extensions, filters, and the `umbValue` and `umbLocalize` components from the package,
- creates one UFM context and provides it to the whole page,
- registers the backoffice's English translations, for `umbLocalize`.

The `umbContentName`, `umbMemberName` and `umbLink` components look picked items up with the Management API, so they're swapped for a stand-in (`src/ufm/placeholder-name.component.ts`) that renders names straight from the values.

`src/ufm/ui.ts` loads the UUI component library, its theme and font, and Umbraco's icons, so templates can use `<uui-tag>`, `<umb-icon>` and friends.

The playground's editors (`src/editors/`) are mostly the backoffice's own:

| Editing | Element |
| --- | --- |
| The template | `<umb-code-editor>` with the `ufm` language |
| Rich text | `<umb-input-tiptap>`, with the TipTap extensions that work without a server |
| Tags | `<umb-tags-input>` (without a tag group, so it doesn't ask a server for suggestions) |
| Lists | `<umb-input-multiple-text-string>` |
| Toggles | `<umb-input-toggle>` |
| JSON | `<umb-code-editor>` |
| Picked items, links | Lookalikes built from `<uui-ref-node>` (the real pickers need the Management API) |
| Blocks | `<ufm-block-list-editor>`, styled like the block list's inline editing mode |

They're big (Monaco especially), so they load after the page has rendered, and aren't part of `embed.js`.

### The `ufm` Monaco language

`src/editors/ufm-language/` is self-contained, with no dependencies on the rest of the playground. It registers a `ufm` language on the backoffice's own Monaco instance, so works with `<umb-code-editor language="ufm">`, and could be lifted into Umbraco itself (e.g. for the block label field). What it knows about the template being edited (aliases, translations, icons) is passed in with `setUfmLanguageData()`.

## Developing

```
npm install
npm run dev
```

- `npm run build` type-checks and builds the site into `dist/`.
- `npm test` (after a build) checks that every example renders exactly what Umbraco rendered for the same template and values (including with nothing filled in), and that `embed.js` works from another origin. It uses your installed Chrome.

`npm run dev` works for most things, but Vite's dependency optimiser sometimes struggles with the size of `@umbraco-cms/backoffice`. If the dev server gets stuck on "Outdated Optimize Dep" errors, use `npm run build && npm run preview` instead.

`monaco-editor` is pinned to the version Umbraco builds with (0.55.1): newer versions moved the files the backoffice imports.

### Updating Umbraco

Bump `@umbraco-cms/backoffice` in `package.json`, then `npm install && npm run build && npm test`. If an example's output changes, check it against a real Umbraco site (the UFM cheat sheet's sample project has every example in it) before updating `tests/examples.test.mjs`.

## Deploying to GitHub Pages

Push to `main` and the workflow in `.github/workflows/deploy.yml` builds, tests and deploys the site. In the repository's settings, under **Pages**, set the source to **GitHub Actions**.

It's served from the root of its own domain, [ufm-playground.joe.gl](https://ufm-playground.joe.gl/) (`public/CNAME`), so pages use root URLs (`/bookmarklet/`, `/favicon.svg`). Set the same custom domain in the repository's Pages settings. URLs inside scripts are relative to the script instead (see `renderBuiltUrl` in `vite.config.ts`), as `embed.js` runs on other sites.

## Embedding previews

```html
<script type="module" src="https://ufm-playground.joe.gl/embed.js"></script>

<ufm-preview template="Call to Action: {umbContentName: page}" values='{"page": "Contact us"}'></ufm-preview>
```

See `embed.html` (or `/embed.html` on the deployed site) for all the options. The playground's **Copy embed code** button gives you the element for whatever's in the playground.

## The bookmarklet

"Send to UFM Playground" (`src/bookmarklet/`, installed from `/bookmarklet`) sends the block labels on a page in the Umbraco backoffice to the playground: their real templates and each block's real values.

It doesn't use the Management API (which isn't available to scripts on the page in Umbraco 17). Every block label is rendered by an `<umb-ufm-render>` element, holding the template (`markdown`) and the exact value Umbraco gives it (`value`), so it reads those. Picked items' keys are swapped for the names Umbraco has already looked up, and the state's marked `exact`, so properties that have never been set load as unset.

It's built on its own, as a self-contained script (`vite.bookmarklet.config.ts`), and the install page turns it into a `javascript:` link pointing at wherever the playground's deployed. Its version is a hash of its source: when it runs, it checks `bookmarklet-version.json` and, if there's a newer version, says so.

`npm run test:bookmarklet` (after a build, with the UFM cheat sheet's sample site running) runs the bookmarklet on the sample site's examples page, opens every label it finds in the playground, and checks they render the same as in Umbraco. It also checks the update notice. Labels relying on the sample site's own extensions (a custom filter, component and translation) are expected to differ.

## Known quirks

- When a template using a filter pipe in an expression (e.g. `${ bodyText | stripHtml }`) is replaced, Umbraco's `<umb-ufm-js-expression>` element re-evaluates as it's removed, after it's lost access to the filters, and logs `… is not a function`. It doesn't affect what's rendered.
- Placeholder names for pickers are just the text you enter: nothing is looked up, and the real components don't always keep the picked order.
