import type { CreateAuditEventInput } from '@rebirth/shared'
import { desc } from 'drizzle-orm'
import type postgres from 'postgres'

import { createDatabase, getDatabaseUrl } from './client'
import { auditEvents } from './schema'
import { createUuidV7 } from './uuid'

export async function insertAuditEvent(
	sql: postgres.TransactionSql,
	input: CreateAuditEventInput,
): Promise<void> {
	await sql`
		INSERT INTO audit_events (id, name, content)
		VALUES (${createUuidV7()}, ${input.name}, ${input.content})
	`
}

export async function createAuditEvent(
	input: CreateAuditEventInput,
): Promise<void> {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)

	try {
		await client.begin(async (sql) => {
			await insertAuditEvent(sql, input)
		})
	} finally {
		await client.end()
	}
}

export async function listAuditEvents() {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client, db } = createDatabase(databaseUrl)

	try {
		return await db.select().from(auditEvents).orderBy(desc(auditEvents.id))
	} finally {
		await client.end()
	}
}
