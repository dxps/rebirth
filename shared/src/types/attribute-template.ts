import { type AccessLevelId } from '../security/access-level'

export type AttributeTemplateId = string

export enum ValueType {
	Text = 'text',
	Number = 'number',
	Boolean = 'boolean',
	Date = 'date',
	DateTime = 'datetime',
}

export const valueTypes = [
	ValueType.Text,
	ValueType.Number,
	ValueType.Boolean,
	ValueType.Date,
	ValueType.DateTime,
] as const

export interface AttributeTemplate {
	id: AttributeTemplateId
	name: string
	description: string
	valueType: ValueType
	defaultValue: string | null
	isRequired: boolean
	accessLevelId: AccessLevelId
}

export type CreateAttributeTemplateInput = Omit<
	AttributeTemplate,
	'defaultValue' | 'id'
> & {
	defaultValue?: string | null
}

export type UpdateAttributeTemplateInput =
	Partial<CreateAttributeTemplateInput>

export const attributeTemplateModel = {
	entityName: 'AttributeTemplate',
	tableName: 'attribute_templates',
	uniqueFields: ['name', 'description'],
} as const

export function isValueType(value: unknown): value is ValueType {
	return (
		typeof value === 'string' &&
		(valueTypes as readonly string[]).includes(value)
	)
}

export function isAttributeTemplateId(
	value: string,
): value is AttributeTemplateId {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	)
}
