import { auditEventModel } from '@rebirth/shared'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const auditEvents = pgTable(auditEventModel.tableName, {
	id: uuid('id').primaryKey(),
	name: text('name').notNull(),
	content: text('content').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true })
		.notNull()
		.defaultNow(),
})
