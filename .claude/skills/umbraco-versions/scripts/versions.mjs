// Compares the @umbraco-cms/backoffice versions on npm with the playground's version branches, and
// says what each major needs. Read-only, apart from fetching the remote's branches.
//
//   node .claude/skills/umbraco-versions/scripts/versions.mjs [--from 17]
import { execSync } from 'node:child_process';

const fromArg = process.argv.indexOf('--from');
const FROM = fromArg > -1 ? Number(process.argv[fromArg + 1]) : 17;

const run = (command) => execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const major = (v) => Number(v.split('.')[0]);
const isPrerelease = (v) => v.includes('-');
// Good enough for Umbraco's versions (e.g. 19.0.0-rc1 < 19.0.0-rc2 < 19.0.0 < 19.1.0)
const compare = (a, b) => {
  const [coreA, preA] = a.split('-');
  const [coreB, preB] = b.split('-');
  const diff = coreA.split('.').map(Number).reduce((d, n, i) => d || n - Number(coreB.split('.')[i]), 0);
  if (diff) return diff;
  if (!preA || !preB) return (preA ? -1 : 0) - (preB ? -1 : 0);
  return preA.localeCompare(preB, undefined, { numeric: true });
};

const published = JSON.parse(run('npm view @umbraco-cms/backoffice versions --json')).filter((v) => major(v) >= FROM);
const majors = [...new Set(published.map(major))].sort((a, b) => a - b);

run('git fetch --quiet origin');
const branchVersion = (ref) => {
  try {
    return JSON.parse(run(`git show ${ref}:package-lock.json`)).packages['node_modules/@umbraco-cms/backoffice'].version;
  } catch {
    return undefined;
  }
};
const releaseBranches = run('git branch -r --list "origin/release/v*"')
  .split('\n')
  .map((b) => b.trim())
  .filter(Boolean);
const deployed = new Map(releaseBranches.map((ref) => [Number(ref.match(/v(\d+)$/)?.[1]), { branch: ref.replace('origin/', ''), version: branchVersion(ref) }]));
const mainVersion = branchVersion('origin/main');
if (mainVersion) deployed.set(major(mainVersion), { branch: 'main', version: mainVersion });

const latestStableMajor = Math.max(...published.filter((v) => !isPrerelease(v)).map(major));
const rows = majors.map((m) => {
  const versions = published.filter((v) => major(v) === m).sort(compare);
  const stable = versions.filter((v) => !isPrerelease(v)).at(-1);
  const prerelease = versions.filter((v) => isPrerelease(v) && (!stable || compare(v, stable) > 0)).at(-1);
  // A major with a release only takes releases (main can't be on a pre-release); one without takes the newest pre-release
  const target = stable ?? versions.at(-1);
  const current = deployed.get(m);
  const mainMajor = major(mainVersion ?? '0');
  let action;
  if (!current) action = stable ? `New major: archive main as release/v${mainMajor}, then move main to ${stable}` : `New pre-release: create release/v${m} from main on ${target}`;
  else if (current.branch !== 'main' && stable && m === latestStableMajor && m > mainMajor) action = `Released: archive main as release/v${mainMajor}, then move release/v${m} onto main (${stable})`;
  else if (compare(target, current.version) > 0) action = `Update ${current.branch}: ${current.version} → ${target}`;
  else action = 'Up to date';
  return { major: m, 'latest stable': stable ?? '-', 'latest pre-release': prerelease ?? '-', branch: current?.branch ?? '-', 'branch version': current?.version ?? '-', action };
});

console.table(rows);
