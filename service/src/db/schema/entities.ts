import {
	entityAttributeModel,
	entityLinkModel,
	entityModel,
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
import {
	entityTemplateAttributes,
	entityTemplateLinks,
	entityTemplates,
} from './entity-templates'

export const entities = pgTable(
	entityModel.tableName,
	{
		id: uuid('id').primaryKey(),
		entityTemplateId: uuid('entity_template_id'),
		listingAttributeId: uuid('listing_attribute_id').notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.entityTemplateId],
			foreignColumns: [entityTemplates.id],
			name: 'entities_entity_tmpl_id_entity_tmpls_id_fk',
		}),
	],
)

export const entityAttributes = pgTable(
	entityAttributeModel.tableName,
	{
		id: uuid('id').primaryKey(),
		entityId: uuid('entity_id').notNull(),
		entityTemplateAttributeId: uuid('entity_template_attribute_id'),
		attributeTemplateId: uuid('attribute_template_id'),
		name: text('name').notNull(),
		description: text('description').notNull(),
		valueType: attributeTemplateValueType('value_type').notNull(),
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
			columns: [table.entityTemplateAttributeId],
			foreignColumns: [entityTemplateAttributes.id],
			name: 'entity_attrs_entity_tmpl_attr_id_entity_tmpl_attrs_id_fk',
		}),
		foreignKey({
			columns: [table.attributeTemplateId],
			foreignColumns: [attributeTemplates.id],
			name: 'entity_attrs_attr_tmpl_id_attribute_tmpls_id_fk',
		}),
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
		entityTemplateLinkId: uuid('entity_template_link_id'),
		targetEntityTemplateId: uuid('target_entity_template_id'),
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
			columns: [table.entityTemplateLinkId],
			foreignColumns: [entityTemplateLinks.id],
			name: 'entity_links_entity_tmpl_link_id_entity_tmpl_links_id_fk',
		}),
		foreignKey({
			columns: [table.targetEntityTemplateId],
			foreignColumns: [entityTemplates.id],
			name: 'entity_links_target_entity_tmpl_id_entity_tmpls_id_fk',
		}),
		foreignKey({
			columns: [table.targetEntityId],
			foreignColumns: [entities.id],
			name: 'entity_links_target_entity_id_entities_id_fk',
		}).onDelete('set null'),
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
