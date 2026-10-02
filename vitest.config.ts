import { defineConfig } from 'vitest/config';

const src = (path: string): string => new URL(`./packages/${path}`, import.meta.url).pathname;

/**
 * Two kinds of test, split by whether they need a database.
 *
 * Unit tests run anywhere. Integration tests require a real PostgreSQL — they are **skipped,
 * loudly, when `DATABASE_URL` is unset**, never silently passed. A green run that quietly
 * tested nothing is worse than a red one.
 */
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tests/**/*.test.ts'],
    // Integration tests share one database; parallel files would race on table state.
    fileParallelism: false,
    hookTimeout: 20_000,
    testTimeout: 20_000,
  },
  resolve: {
    // Anchored regexes, so `@joby/identity` does not swallow `@joby/identity/runtime`. The
    // subpaths mirror the package's `exports` map — tests reach the boundary the same way
    // application code does.
    alias: [
      { find: /^@joby\/social$/, replacement: src('social/src/index.ts') },
      { find: /^@joby\/events$/, replacement: src('events/src/index.ts') },
      { find: /^@joby\/database$/, replacement: src('database/src/index.ts') },
      { find: /^@joby\/identity$/, replacement: src('identity/src/index.ts') },
      { find: /^@joby\/opportunity$/, replacement: src('opportunity/src/index.ts') },
      { find: /^@joby\/router$/, replacement: src('router/src/index.ts') },
      { find: /^@joby\/pci$/, replacement: src('pci/src/index.ts') },
      { find: /^@joby\/application$/, replacement: src('application/src/index.ts') },
      { find: /^@joby\/opportunity\/runtime$/, replacement: src('opportunity/src/runtime.ts') },
      {
        find: /^@joby\/identity\/representation$/,
        replacement: src('identity/src/representation/index.ts'),
      },
      {
        find: /^@joby\/identity\/representation\/runtime$/,
        replacement: src('identity/src/representation/runtime.ts'),
      },
      { find: /^@joby\/identity\/runtime$/, replacement: src('identity/src/runtime.ts') },
      { find: /^@joby\/identity\/testing$/, replacement: src('identity/src/testing.ts') },

      // Translation's three internal modules. Each is reached only through its own entry point;
      // the boundary itself deliberately has no root export to be a facade over them.
      {
        find: /^@joby\/translation\/adaptation$/,
        replacement: src('translation/src/adaptation/index.ts'),
      },
      {
        find: /^@joby\/translation\/execution$/,
        replacement: src('translation/src/execution/index.ts'),
      },
      {
        find: /^@joby\/translation\/interview$/,
        replacement: src('translation/src/interview/index.ts'),
      },
      { find: /^@joby\/translation\/testing$/, replacement: src('translation/src/testing.ts') },
    ],
  },
});
