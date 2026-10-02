/** `pnpm db:migrate` — apply pending migrations to DATABASE_URL. */

import { createDatabase, databaseConfigFromEnv } from './client';
import { migrate } from './migrator';

const db = createDatabase(databaseConfigFromEnv());

try {
  const { applied, skipped } = await migrate(db);
  console.log(
    applied.length === 0
      ? `No pending migrations (${skipped.length} already applied).`
      : `Applied ${applied.length}: ${applied.join(', ')}`,
  );
} catch (error) {
  console.error('Migration failed:', error);
  process.exitCode = 1;
} finally {
  await db.close();
}
