import {
	entityAttributeModel,
	entityLinkModel,
	entityModel,
} from '@rebirth/shared'
import { sql } from 'drizzle-orm'
import {
	boolean,
	check,
	foreignKey,
	integer,
	pgTable,
	text,
	unique,
	uuid,
} from 'drizzle-orm/pg-core'

import { accessLevels } from './access-levels'
import { attributeTemplateValueType } from './attribute-templates'
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

export const entityAttributes = pgTable(
	entityAttributeModel.tableName,
	{
		id: uuid('id').primaryKey(),
		entityId: uuid('entity_id').notNull(),
		name: text('name').notNull(),
		description: text('description').notNull(),
		valueType: attributeTemplateValueType('value_type').notNull(),
		isRequired: boolean('is_required').notNull().default(false),
		accessLevelId: integer('access_level_id').notNull(),
		listingIndex: integer('listing_index').notNull(),
		value: text('value').notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.entityId],
			foreignColumns: [entities.id],
			name: 'entity_attrs_entity_id_entities_id_fk',
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.accessLevelId],
			foreignColumns: [accessLevels.id],
			name: 'entity_attrs_access_level_id_access_levels_id_fk',
		}),
		unique('entity_attrs_entity_id_listing_idx_unique').on(
			table.entityId,
			table.listingIndex,
		),
		check('entity_attrs_listing_idx_check', sql`${table.listingIndex} >= 0`),
		check(
			'entity_attrs_name_trimmed_check',
			sql`${table.name} = btrim(${table.name})`,
		),
		check(
			'entity_attrs_desc_trimmed_check',
			sql`${table.description} = btrim(${table.description})`,
		),
	],
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
