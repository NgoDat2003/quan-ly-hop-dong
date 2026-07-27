import { base } from './base.js';

// Intentional minimal passthrough — eslint-config-next is installed in
// apps/web/package.json but not wired in here. Extend this file to
// consume it once apps/web has more than one route.
export const next = [...base];

export default next;
