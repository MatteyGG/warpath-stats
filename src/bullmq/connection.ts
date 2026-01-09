export function bullConnection() {
  const host = process.env.REDIS_HOST ?? "localhost";
  const port = Number(process.env.REDIS_PORT ?? 6379);

  const connection: any = { host, port };

  // Только пароль, без username
  if (process.env.REDIS_PASSWORD) {
    connection.password = process.env.REDIS_PASSWORD;
  }

  return connection;
}