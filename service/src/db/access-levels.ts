import { asc, eq } from 'drizzle-orm'
import { type UpdateAccessLevelInput } from '@rebirth/shared'

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

export async function updateAccessLevel(
	id: number,
	input: UpdateAccessLevelInput,
) {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client, db } = createDatabase(databaseUrl)

	try {
		const [updatedAccessLevel] = await db
			.update(accessLevels)
			.set(input)
			.where(eq(accessLevels.id, id))
			.returning()

		return updatedAccessLevel
	} finally {
		await client.end()
	}
}

export async function deleteAccessLevel(id: number) {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client, db } = createDatabase(databaseUrl)

	try {
		const [deletedAccessLevel] = await db
			.delete(accessLevels)
			.where(eq(accessLevels.id, id))
			.returning()

		return deletedAccessLevel
	} finally {
		await client.end()
	}
}
