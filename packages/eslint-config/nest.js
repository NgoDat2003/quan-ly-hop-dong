import { base } from './base.js';

// Intentional minimal passthrough — no NestJS-specific rules yet (e.g.
// @typescript-eslint/no-floating-promises for guard/interceptor code).
// Extend here once apps/api grows beyond the current stub scope.
export const nest = [...base];

export default nest;
