/**
 * The Umbraco version this build of the playground uses, and the others deployed alongside it. The
 * latest release is at the root, and every version (including the latest) is in its own folder,
 * e.g. /v17/. The deploy lists them in /versions.json (see scripts/assemble-site.mjs).
 */
declare const __UMBRACO_VERSION__: string;

export const UMBRACO_VERSION = __UMBRACO_VERSION__;
export const MAJOR = UMBRACO_VERSION.split('.')[0];

export interface DeployedVersion {
  major: string;
  version: string;
  prerelease?: boolean;
}

export interface DeployedVersions {
  /** The major version at the root. */
  latest: string;
  versions: Array<DeployedVersion>;
}

/** Whether this page is in a version's folder (e.g. /v17/), rather than the root. */
export const inVersionFolder = /^\/v\d+\/$/.test(new URL('./', location.href).pathname);

/** The URL of a version's own folder, which always uses that version. */
export const fixedVersionUrl = (major = MAJOR) => `${location.origin}/v${major}/`;

/** The URL of the root, which uses the latest version. */
export const latestVersionUrl = () => `${location.origin}/`;

/** The versions deployed, or undefined if there's no list (e.g. when running locally). */
export async function getDeployedVersions(): Promise<DeployedVersions | undefined> {
  try {
    const response = await fetch('/versions.json', { cache: 'no-cache' });
    return response.ok ? ((await response.json()) as DeployedVersions) : undefined;
  } catch {
    return undefined;
  }
}
