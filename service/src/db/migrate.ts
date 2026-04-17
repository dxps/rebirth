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

async function seedAccessLevels(
	client: ReturnType<typeof createDatabase>['client'],
): Promise<void> {
	await client`
		INSERT INTO access_levels (id, name, description)
		VALUES
			(1, 'Public', 'Publicly visible'),
			(2, 'Private', 'Private access needed'),
			(3, 'Confidential', 'A more restricted access')
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			description = EXCLUDED.description
	`

	await client`
		SELECT setval(
			pg_get_serial_sequence('access_levels', 'id'),
			GREATEST((SELECT MAX(id) FROM access_levels), 1),
			true
		)
	`
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
		await seedAccessLevels(client)
	} finally {
		await client.end()
	}
}

if (import.meta.main) {
	await runMigrations()
}
