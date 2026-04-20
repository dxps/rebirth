import {
	isAttributeTemplateId,
	isValueType,
	type AttributeTemplateId,
	type ValueType,
} from './attribute-template'
import { isAccessLevelId, type AccessLevelId } from '../security/access-level'

export type EntityTemplateId = string
export type EntityTemplateAttributeId = string
export type EntityTemplateLinkId = string

export interface EntityTemplateAttribute {
	id: EntityTemplateAttributeId
	attributeTemplateId: AttributeTemplateId | null
	name: string
	description: string
	valueType: ValueType
	accessLevelId: AccessLevelId
	listingIndex: number
}

export interface CreateEntityTemplateAttributeInput {
	id: EntityTemplateAttributeId
	attributeTemplateId?: AttributeTemplateId | null
	name: string
	description: string
	valueType: ValueType
	accessLevelId: AccessLevelId
	listingIndex: number
}

export interface EntityTemplateLink {
	id: EntityTemplateLinkId
	entityTemplateId: EntityTemplateId
	targetEntityTemplateId: EntityTemplateId
	name: string
	description: string | null
}

export interface EntityTemplate {
	id: EntityTemplateId
	name: string
	description: string
	attributes: EntityTemplateAttribute[]
	listingAttributeId: EntityTemplateAttributeId
	links: EntityTemplateLink[]
}

export interface CreateEntityTemplateLinkInput {
	targetEntityTemplateId: EntityTemplateId
	name: string
	description?: string | null
}

export interface CreateEntityTemplateInput {
	name: string
	description: string
	attributes: CreateEntityTemplateAttributeInput[]
	listingAttributeId: EntityTemplateAttributeId
	links?: CreateEntityTemplateLinkInput[]
}

export type UpdateEntityTemplateInput = Partial<CreateEntityTemplateInput>

export const entityTemplateModel = {
	entityName: 'EntityTemplate',
	tableName: 'entity_templates',
	uniqueFields: ['name'],
} as const

export const entityTemplateAttributeModel = {
	entityName: 'EntityTemplateAttribute',
	tableName: 'entity_template_attributes',
} as const

export const entityTemplateLinkModel = {
	entityName: 'EntityTemplateLink',
	tableName: 'entity_template_links',
} as const

export function isEntityTemplateId(value: string): value is EntityTemplateId {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	)
}

export function isEntityTemplateAttributeId(
	value: string,
): value is EntityTemplateAttributeId {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	)
}

export function hasValidEntityTemplateAttributes(
	attributes: unknown,
	listingAttributeId: unknown,
): attributes is CreateEntityTemplateAttributeInput[] {
	if (
		!Array.isArray(attributes) ||
		attributes.length === 0 ||
		typeof listingAttributeId !== 'string' ||
		!isEntityTemplateAttributeId(listingAttributeId)
	) {
		return false
	}

	const uniqueAttributeIds = new Set(
		attributes.map((attribute) =>
			typeof attribute === 'object' && attribute !== null && 'id' in attribute
				? attribute.id
				: undefined,
		),
	)
	const uniqueListingIndexes = new Set(
		attributes.map((attribute) =>
			typeof attribute === 'object' &&
			attribute !== null &&
			'listingIndex' in attribute
				? attribute.listingIndex
				: undefined,
		),
	)

	return (
		uniqueAttributeIds.size === attributes.length &&
		uniqueListingIndexes.size === attributes.length &&
		attributes.every((attribute) => {
			if (!attribute || typeof attribute !== 'object') {
				return false
			}

			const input = attribute as Record<string, unknown>

			return (
				typeof input.id === 'string' &&
				isEntityTemplateAttributeId(input.id) &&
				(input.attributeTemplateId === undefined ||
					input.attributeTemplateId === null ||
					(typeof input.attributeTemplateId === 'string' &&
						isAttributeTemplateId(input.attributeTemplateId))) &&
				typeof input.name === 'string' &&
				typeof input.description === 'string' &&
				isValueType(input.valueType) &&
				typeof input.accessLevelId === 'number' &&
				isAccessLevelId(input.accessLevelId) &&
				typeof input.listingIndex === 'number' &&
				Number.isInteger(input.listingIndex) &&
				input.listingIndex >= 0
			)
		}) &&
		uniqueAttributeIds.has(listingAttributeId)
	)
}
