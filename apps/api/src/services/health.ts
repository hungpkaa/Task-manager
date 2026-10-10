export interface DatabaseHealth {
  checkConnection(): Promise<void>;
}

export async function checkReadiness(database: DatabaseHealth) {
  try {
    await database.checkConnection();
    return { status: 'ok', database: 'connected' } as const;
  } catch {
    // Do not expose connection strings or database errors in public responses.
    return { status: 'degraded', database: 'unavailable' } as const;
  }
}
