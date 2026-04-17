import { asc } from 'drizzle-orm'

import { createDatabase, getDatabaseUrl } from './client'
import { accessLevels } from './schema'

export async function listAccessLevels() {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client, db } = createDatabase(databaseUrl)

	try {
		return await db.select().from(accessLevels).orderBy(asc(accessLevels.id))
	} finally {
		await client.end()
	}
}
