import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

function isExpectedMigrationNotice(notice: postgres.Notice): boolean {
	return (
		(notice.code === '42P06' &&
			notice.message === 'schema "drizzle" already exists, skipping') ||
		(notice.code === '42P07' &&
			notice.message === 'relation "__drizzle_migrations" already exists, skipping')
	)
}

export function getDatabaseUrl(): string | undefined {
	return Bun.env.DATABASE_URL
}

export function createPostgresClient(databaseUrl: string) {
	return postgres(databaseUrl, {
		max: 1,
		onnotice(notice) {
			if (!isExpectedMigrationNotice(notice)) {
				console.log(notice)
			}
		},
	})
}

export function createDatabase(databaseUrl: string) {
	const client = createPostgresClient(databaseUrl)

	return {
		client,
		db: drizzle(client, { schema }),
	}
}
