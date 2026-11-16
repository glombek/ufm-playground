/**
 * Custom events for Plausible, whose script is loaded by each page. Never send templates or values:
 * they can be a real site's content.
 */
type Plausible = ((event: string, options?: { props?: Record<string, string> }) => void) & { q?: Array<unknown> };

declare global {
  interface Window {
    plausible?: Plausible;
  }
}

export function track(event: string, props?: Record<string, string | boolean>) {
  // Queues events until Plausible's deferred script loads and replays them
  window.plausible ??= (...args) => void (window.plausible!.q ??= []).push(args);
  const stringProps = props && Object.fromEntries(Object.entries(props).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 'yes' : 'no') : v]));
  window.plausible(event, stringProps ? { props: stringProps } : undefined);
}
