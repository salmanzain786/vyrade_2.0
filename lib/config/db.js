import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema.js';

// Reuse the pool across hot-reloads in dev. Next.js re-executes this module on
// every HMR update, so a plain module-level variable would create a NEW pool
// each time and quickly exhaust MySQL's max_connections ("Too many
// connections"). Caching on globalThis survives module re-execution.
function getPool() {
  if (!globalThis.__vyradePool) {
    globalThis.__vyradePool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return globalThis.__vyradePool;
}

export const pool = getPool();

// Drizzle ORM handle — the single entry point for all application queries.
export const db = drizzle(pool, { schema, mode: 'default' });

export default db;
