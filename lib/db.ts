import { Pool } from "pg";

/**
 * Shared PostgreSQL connection pool for the whole app.
 * Import this everywhere instead of creating new connections.
 */
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
});

export default pool;