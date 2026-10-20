import sql from 'mssql';

export async function connectLegacy(database?: string): Promise<sql.ConnectionPool> {
  const url = process.env.LEGACY_DB_URL;
  if (!url) {
    throw new Error(
      'LEGACY_DB_URL is not set. Copy .env.example to .env at the repo root, or export it, ' +
        'for example Server=localhost,1433;Database=master;User Id=sa;Password=...;TrustServerCertificate=true',
    );
  }

  const config = sql.ConnectionPool.parseConnectionString(url);
  if (database) {
    config.database = database;
  }
  config.requestTimeout = 120_000;

  return new sql.ConnectionPool(config).connect();
}
