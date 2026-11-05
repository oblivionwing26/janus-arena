// Integration tests only ever touch a database whose name ends in _test.
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL_TEST is not set (see .env.example and docker compose up)');
  }
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(
      `Refusing to use ${new URL(url).pathname}: the database name must end in _test`,
    );
  }
  return url;
}
