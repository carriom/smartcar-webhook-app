import * as schema from './schema'

let dbImpl: ReturnType<any>

if (process.env.POSTGRES_URL) {
  // Vercel Postgres
  const { drizzle } = require('drizzle-orm/vercel-postgres') as typeof import('drizzle-orm/vercel-postgres')
  const { sql } = require('@vercel/postgres') as typeof import('@vercel/postgres')
  dbImpl = drizzle(sql, { schema })
} else if (process.env.DATABASE_URL) {
  // Generic Postgres (e.g., Supabase) via postgres-js
  const { drizzle } = require('drizzle-orm/postgres-js') as typeof import('drizzle-orm/postgres-js')
  const postgres = require('postgres') as typeof import('postgres')
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })
  dbImpl = drizzle(client, { schema })
} else {
  throw new Error('Missing POSTGRES_URL (Vercel Postgres) or DATABASE_URL (generic Postgres)')
}

export const db = dbImpl


