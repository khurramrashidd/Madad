import DemoGuide from './DemoGuide.jsx';
import DemoSwitcher from './DemoSwitcher.jsx';

/**
 * Development-only helpers, behind a single entry point.
 *
 * These carry the seeded demo logins. A `return null` guard inside each
 * component is not enough — the component body, and therefore the credentials,
 * still end up in the production bundle. Gathering them here lets App.jsx
 * import this file only inside a `__DEMO_TOOLS__` branch, which Vite
 * replaces with a literal at build time so Rollup drops the whole chunk
 * whenever demo tools are off.
 *
 * Verified by the check in scripts/check-bundle.mjs.
 */
export default function DevTools() {
  return (
    <>
      <DemoGuide />
      <DemoSwitcher />
    </>
  );
}
