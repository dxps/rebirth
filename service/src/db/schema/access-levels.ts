import { accessLevelModel } from '@rebirth/shared'
import { pgTable, serial, text } from 'drizzle-orm/pg-core'

export const accessLevels = pgTable(accessLevelModel.tableName, {
	id: serial('id').primaryKey(),
	name: text('name').notNull().unique(),
	description: text('description').notNull(),
})
