import {
	booleanEntityAttributeModel,
	dateEntityAttributeModel,
	dateTimeEntityAttributeModel,
	entityLinkModel,
	entityModel,
	numberEntityAttributeModel,
	textEntityAttributeModel,
} from '@rebirth/shared'
import { sql } from 'drizzle-orm'
import {
	boolean,
	check,
	date,
	foreignKey,
	integer,
	numeric,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from 'drizzle-orm/pg-core'

import { accessLevels } from './access-levels'
import { users } from './users'

export const entities = pgTable(
	entityModel.tableName,
	{
		id: uuid('id').primaryKey(),
		ownerUserId: uuid('owner_user_id').notNull(),
		listingAttributeId: uuid('listing_attribute_id').notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.ownerUserId],
			foreignColumns: [users.id],
			name: 'entities_owner_user_id_users_id_fk',
		}),
	],
)

function entityAttributeColumns<TValue>(valueColumn: TValue) {
	return {
		id: uuid('id').primaryKey(),
		entityId: uuid('entity_id').notNull(),
		name: text('name').notNull(),
		description: text('description').notNull(),
		isRequired: boolean('is_required').notNull().default(false),
		accessLevelId: integer('access_level_id').notNull(),
		listingIndex: integer('listing_index').notNull(),
		value: valueColumn,
	}
}

function entityAttributeConstraints(
	prefix: string,
	table: Record<string, any>,
) {
	return [
		foreignKey({
			columns: [table.entityId],
			foreignColumns: [entities.id],
			name: `${prefix}_entity_id_entities_id_fk`,
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.accessLevelId],
			foreignColumns: [accessLevels.id],
			name: `${prefix}_access_level_id_access_levels_id_fk`,
		}),
		unique(`${prefix}_entity_id_listing_idx_unique`).on(
			table.entityId,
			table.listingIndex,
		),
		check(`${prefix}_listing_idx_check`, sql`${table.listingIndex} >= 0`),
		check(
			`${prefix}_name_trimmed_check`,
			sql`${table.name} = btrim(${table.name})`,
		),
		check(
			`${prefix}_desc_trimmed_check`,
			sql`${table.description} = btrim(${table.description})`,
		),
	]
}

export const textEntityAttributes = pgTable(
	textEntityAttributeModel.tableName,
	entityAttributeColumns(text('value').notNull()),
	(table) => entityAttributeConstraints('text_entity_attrs', table),
)

export const numberEntityAttributes = pgTable(
	numberEntityAttributeModel.tableName,
	entityAttributeColumns(numeric('value')),
	(table) => entityAttributeConstraints('number_entity_attrs', table),
)

export const booleanEntityAttributes = pgTable(
	booleanEntityAttributeModel.tableName,
	entityAttributeColumns(boolean('value').notNull()),
	(table) => entityAttributeConstraints('boolean_entity_attrs', table),
)

export const dateEntityAttributes = pgTable(
	dateEntityAttributeModel.tableName,
	entityAttributeColumns(date('value')),
	(table) => entityAttributeConstraints('date_entity_attrs', table),
)

export const dateTimeEntityAttributes = pgTable(
	dateTimeEntityAttributeModel.tableName,
	{
		...entityAttributeColumns(timestamp('value', { mode: 'string' })),
	},
	(table) => entityAttributeConstraints('datetime_entity_attrs', table),
)

export const entityLinks = pgTable(
	entityLinkModel.tableName,
	{
		id: uuid('id').primaryKey(),
		entityId: uuid('entity_id').notNull(),
		targetEntityId: uuid('target_entity_id'),
		name: text('name').notNull(),
		description: text('description'),
		listingIndex: integer('listing_index').notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.entityId],
			foreignColumns: [entities.id],
			name: 'entity_links_entity_id_entities_id_fk',
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.targetEntityId],
			foreignColumns: [entities.id],
			name: 'entity_links_target_entity_id_entities_id_fk',
		}),
		unique('entity_links_entity_id_listing_idx_unique').on(
			table.entityId,
			table.listingIndex,
		),
		check('entity_links_listing_idx_check', sql`${table.listingIndex} >= 0`),
		check(
			'entity_links_name_trimmed_check',
			sql`${table.name} = btrim(${table.name})`,
		),
		check(
			'entity_links_desc_trimmed_check',
			sql`${table.description} IS NULL OR ${table.description} = btrim(${table.description})`,
		),
	],
)
