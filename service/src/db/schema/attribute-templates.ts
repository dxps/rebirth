import {
	attributeTemplateModel,
	ValueType,
	valueTypes,
} from '@rebirth/shared'
import { sql } from 'drizzle-orm'
import {
	boolean,
	check,
	pgEnum,
	pgTable,
	text,
	unique,
	uuid,
} from 'drizzle-orm/pg-core'

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
	],
)
