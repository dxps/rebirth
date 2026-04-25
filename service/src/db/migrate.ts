import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadEnvFiles } from '../env'
import { createDatabase, getDatabaseUrl } from './client'

function getMigrationsFolder(): string {
	const defaultFolder = fileURLToPath(
		new URL('../../drizzle', import.meta.url),
	)
	const candidates = [
		Bun.env.DRIZZLE_MIGRATIONS_FOLDER,
		defaultFolder,
		resolve(process.cwd(), 'drizzle'),
		resolve(process.cwd(), 'service/drizzle'),
	].filter((candidate): candidate is string => Boolean(candidate))

	return (
		candidates.find((candidate) => existsSync(candidate)) ?? defaultFolder
	)
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

async function seedPermissions(
	client: ReturnType<typeof createDatabase>['client'],
): Promise<void> {
	await client`
		INSERT INTO permissions (id, name, description)
		VALUES
			(1, 'Admin', 'Can manage users, security (access levels, permissions), templates and data.'),
			(2, 'Editor', 'Can create, update, and delete templates and data.'),
			(3, 'Viewer', 'Can view managed data with public access (level).')
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			description = EXCLUDED.description
	`

	await client`
		SELECT setval(
			pg_get_serial_sequence('permissions', 'id'),
			GREATEST((SELECT MAX(id) FROM permissions), 1),
			true
		)
	`
}

async function seedInitialAdminUser(
	client: ReturnType<typeof createDatabase>['client'],
): Promise<void> {
	const initialAdminUserId = '0196626d-7d6f-7a12-9f64-1c4f7a1f7a01'
	const initialAdminPasswordHash = await Bun.password.hash('admin')

	await client`
		INSERT INTO users (
			id,
			email,
			first_name,
			last_name,
			username,
			password_hash
		)
		VALUES (
			${initialAdminUserId},
			'admin@rebirth.localhost',
			'Admin',
			'User',
			'admin',
			${initialAdminPasswordHash}
		)
		ON CONFLICT (username) DO NOTHING
	`

	await client`
		INSERT INTO user_permissions (user_id, permission_id)
		SELECT users.id, 1
		FROM users
		WHERE users.username = 'admin'
		ON CONFLICT (user_id, permission_id) DO NOTHING
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
		await seedPermissions(client)
		await seedInitialAdminUser(client)
	} finally {
		await client.end()
	}
}

if (import.meta.main) {
	await runMigrations()
}
