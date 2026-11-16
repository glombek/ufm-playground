// Puts the builds of each Umbraco version together into one site, for GitHub Pages:
//
//   node scripts/assemble-site.mjs <out> <latest build> [other builds…]
//
// The latest build (from main) is the whole site at the root, and its playground is also in its own
// folder (e.g. /v18/), so links can stay on a version. The other builds (release/v* branches) are
// each just a playground in their own folder (/v17/, /v19/…). Each build's Umbraco version comes
// from its umbraco-version.json. Writes /versions.json, for the playground's version picker.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Only the root has these: there's one embed script, embed page and bookmarklet for every version
const ROOT_ONLY = ['CNAME', 'embed.js', 'embed.html', 'bookmarklet', 'bookmarklet.js', 'bookmarklet-version.json', 'plausible'];

const [out, latestBuild, ...otherBuilds] = process.argv.slice(2);
if (!out || !latestBuild) {
  console.error('Usage: node scripts/assemble-site.mjs <out> <latest build> [other builds…]');
  process.exit(1);
}

const versionOf = (build) => JSON.parse(readFileSync(join(build, 'umbraco-version.json'), 'utf8')).version;
const majorOf = (version) => version.split('.')[0];
const isPrerelease = (version) => version.includes('-');

function addFolder(build, version) {
  const folder = join(out, `v${majorOf(version)}`);
  if (existsSync(folder)) throw new Error(`There's more than one build of Umbraco ${majorOf(version)}.`);
  cpSync(build, folder, { recursive: true });
  for (const name of ROOT_ONLY) rmSync(join(folder, name), { recursive: true, force: true });
  console.log(`Umbraco ${version} → /v${majorOf(version)}/`);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const latest = versionOf(latestBuild);
if (isPrerelease(latest)) throw new Error(`main is on a pre-release (${latest}). Pre-releases belong on a release/v* branch until they're released.`);
cpSync(latestBuild, out, { recursive: true });
console.log(`Umbraco ${latest} → /`);
addFolder(latestBuild, latest);

const versions = [latest];
for (const build of otherBuilds) {
  const version = versionOf(build);
  addFolder(build, version);
  versions.push(version);
}

versions.sort((a, b) => Number(majorOf(b)) - Number(majorOf(a)));
writeFileSync(
  join(out, 'versions.json'),
  JSON.stringify({
    latest: majorOf(latest),
    versions: versions.map((version) => ({ major: majorOf(version), version, ...(isPrerelease(version) ? { prerelease: true } : {}) })),
  }),
);
