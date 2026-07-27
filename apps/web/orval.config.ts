import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: { target: '../api/openapi.json' },
    output: {
      mode: 'tags-split',
      target: 'lib/api/generated',
      schemas: 'lib/api/generated/model',
      client: 'react-query',
      override: {
        mutator: { path: './lib/api/http-client.ts', name: 'customFetch' },
        query: { signal: true },
      },
    },
  },
});
