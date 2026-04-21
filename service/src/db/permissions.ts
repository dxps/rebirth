import { asc } from 'drizzle-orm'

import { createDatabase, getDatabaseUrl } from './client'
import { permissions } from './schema'

export async function listPermissions() {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client, db } = createDatabase(databaseUrl)

	try {
		return await db.select().from(permissions).orderBy(asc(permissions.id))
	} finally {
		await client.end()
	}
}
