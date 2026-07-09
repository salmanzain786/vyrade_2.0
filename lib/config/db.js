import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema.js';

let _pool;

// Reuse the pool across hot-reloads in dev (Next.js re-executes modules often)
function getPool() {
  if (!_pool) {
    _pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return _pool;
}

export const pool = getPool();

// Drizzle ORM handle — the single entry point for all application queries.
export const db = drizzle(pool, { schema, mode: 'default' });

export default db;
