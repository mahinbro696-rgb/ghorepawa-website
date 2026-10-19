import {Pool, neonConfig} from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
let pool;
export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return pool ||= new Pool({connectionString:process.env.DATABASE_URL,max:8,idleTimeoutMillis:10000,connectionTimeoutMillis:15000});
}
export async function transaction(callback) {
  const client = await getPool().connect();
  try { await client.query('BEGIN'); const result=await callback(client); await client.query('COMMIT'); return result; }
  catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
