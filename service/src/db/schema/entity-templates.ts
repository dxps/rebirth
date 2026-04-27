import {
	entityTemplateAttributeModel,
	entityTemplateLinkModel,
	entityTemplateModel,
} from '@rebirth/shared'
import { sql } from 'drizzle-orm'
import {
	check,
	foreignKey,
	integer,
	pgTable,
	text,
	unique,
	uuid,
} from 'drizzle-orm/pg-core'

import { accessLevels } from './access-levels'
import {
	attributeTemplateValueType,
	attributeTemplates,
} from './attribute-templates'
import { users } from './users'

export const entityTemplates = pgTable(
	entityTemplateModel.tableName,
	{
		id: uuid('id').primaryKey(),
		ownerUserId: uuid('owner_user_id').notNull(),
		name: text('name').notNull(),
		description: text('description').notNull(),
		listingAttributeId: uuid('listing_attribute_id').notNull(),
	},
	(table) => [
		check(
			'entity_tmpls_name_trimmed_check',
			sql`${table.name} = btrim(${table.name})`,
		),
		check(
			'entity_tmpls_desc_trimmed_check',
			sql`${table.description} = btrim(${table.description})`,
		),
		unique('entity_tmpls_name_unique').on(table.name),
		foreignKey({
			columns: [table.ownerUserId],
			foreignColumns: [users.id],
			name: 'entity_templates_owner_user_id_users_id_fk',
		}),
	],
)

export const entityTemplateAttributes = pgTable(
	entityTemplateAttributeModel.tableName,
	{
		id: uuid('id').primaryKey(),
		entityTemplateId: uuid('entity_template_id').notNull(),
		attributeTemplateId: uuid('attribute_template_id'),
		name: text('name').notNull(),
		description: text('description').notNull(),
		valueType: attributeTemplateValueType('value_type').notNull(),
		accessLevelId: integer('access_level_id').notNull(),
		listingIndex: integer('listing_index').notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.entityTemplateId],
			foreignColumns: [entityTemplates.id],
			name: 'entity_tmpl_attrs_entity_tmpl_id_entity_tmpls_id_fk',
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.attributeTemplateId],
			foreignColumns: [attributeTemplates.id],
			name: 'entity_tmpl_attrs_attr_tmpl_id_attribute_tmpls_id_fk',
		}),
		foreignKey({
			columns: [table.accessLevelId],
			foreignColumns: [accessLevels.id],
			name: 'entity_tmpl_attrs_access_level_id_access_levels_id_fk',
		}),
		unique('entity_tmpl_attrs_entity_tmpl_id_listing_idx_unique').on(
			table.entityTemplateId,
			table.listingIndex,
		),
		check(
			'entity_tmpl_attrs_listing_idx_check',
			sql`${table.listingIndex} >= 0`,
		),
		check(
			'entity_tmpl_attrs_name_trimmed_check',
			sql`${table.name} = btrim(${table.name})`,
		),
		check(
			'entity_tmpl_attrs_desc_trimmed_check',
			sql`${table.description} = btrim(${table.description})`,
		),
	],
)

export const entityTemplateLinks = pgTable(
	entityTemplateLinkModel.tableName,
	{
		id: uuid('id').primaryKey(),
		entityTemplateId: uuid('entity_template_id').notNull(),
		targetEntityTemplateId: uuid('target_entity_template_id').notNull(),
		name: text('name').notNull(),
		description: text('description'),
		listingIndex: integer('listing_index').notNull(),
	},
	(table) => [
		unique('entity_tmpl_links_entity_tmpl_id_listing_idx_unique').on(
			table.entityTemplateId,
			table.listingIndex,
		),
		check(
			'entity_tmpl_links_listing_idx_check',
			sql`${table.listingIndex} >= 0`,
		),
		check(
			'entity_tmpl_links_name_trimmed_check',
			sql`${table.name} = btrim(${table.name})`,
		),
		check(
			'entity_tmpl_links_desc_trimmed_check',
			sql`${table.description} IS NULL OR ${table.description} = btrim(${table.description})`,
		),
		unique('entity_tmpl_links_source_target_name_unique').on(
			table.entityTemplateId,
			table.targetEntityTemplateId,
			table.name,
		),
		foreignKey({
			columns: [table.entityTemplateId],
			foreignColumns: [entityTemplates.id],
			name: 'entity_tmpl_links_entity_tmpl_id_entity_tmpls_id_fk',
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.targetEntityTemplateId],
			foreignColumns: [entityTemplates.id],
			name: 'entity_tmpl_links_target_entity_tmpl_id_entity_tmpls_id_fk',
		}),
	],
)
