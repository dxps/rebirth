import {
	attributeTemplateModel,
	ValueType,
	valueTypes,
} from '@rebirth/shared'
import { sql } from 'drizzle-orm'
import {
	boolean,
	check,
	foreignKey,
	integer,
	pgEnum,
	pgTable,
	text,
	unique,
	uuid,
} from 'drizzle-orm/pg-core'
import { accessLevels } from './access-levels'

export const attributeTemplateValueType = pgEnum(
	'attribute_template_value_type',
	valueTypes,
)

export const attributeTemplates = pgTable(
	attributeTemplateModel.tableName,
	{
		id: uuid('id').primaryKey(),
		name: text('name').notNull(),
		description: text('description').notNull(),
		valueType: attributeTemplateValueType('value_type')
			.notNull()
			.default(ValueType.Text),
		defaultValue: text('default_value'),
		isRequired: boolean('is_required').notNull().default(false),
		accessLevelId: integer('access_level_id').notNull(),
	},
	(table) => [
		check(
			'attribute_templates_name_trimmed_check',
			sql`${table.name} = btrim(${table.name})`,
		),
		check(
			'attribute_templates_description_trimmed_check',
			sql`${table.description} = btrim(${table.description})`,
		),
		unique('attribute_templates_name_description_unique').on(
			table.name,
			table.description,
		),
		foreignKey({
			columns: [table.accessLevelId],
			foreignColumns: [accessLevels.id],
			name: 'attribute_templates_access_level_id_access_levels_id_fk',
		}),
	],
)
