import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createDatabase, getDatabaseUrl } from './client'
import { loadEnvFiles } from '../env'

function getMigrationsFolder(): string {
	const defaultFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
	const candidates = [
		Bun.env.DRIZZLE_MIGRATIONS_FOLDER,
		defaultFolder,
		resolve(process.cwd(), 'drizzle'),
		resolve(process.cwd(), 'service/drizzle'),
	].filter((candidate): candidate is string => Boolean(candidate))

	return candidates.find((candidate) => existsSync(candidate)) ?? defaultFolder
}

export async function runMigrations(): Promise<void> {
	loadEnvFiles()

	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		console.warn('DATABASE_URL is not set; skipping database migrations.')
		return
	}

	const { client, db } = createDatabase(databaseUrl)

	try {
		await migrate(db, { migrationsFolder: getMigrationsFolder() })
	} finally {
		await client.end()
	}
}

if (import.meta.main) {
	await runMigrations()
}
