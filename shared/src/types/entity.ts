import {
	isValueType,
	ValueType,
} from './attribute-template'
import { isAccessLevelId, type AccessLevelId } from '../security/access-level'
import { isUserId, type UserId } from '../security/user'
import {
	isEntityTemplateAttributeId,
	isEntityTemplateId,
	isEntityTemplateLinkId,
	type EntityTemplateAttributeId,
	type EntityTemplateId,
	type EntityTemplateLinkId,
} from './entity-template'

export type EntityId = string
export type EntityAttributeId = string
export type EntityLinkId = string

interface BaseEntityAttribute {
	id: EntityAttributeId
	name: string
	description: string
	isRequired: boolean
	accessLevelId: AccessLevelId
	listingIndex: number
	value: string
}

export interface TextEntityAttribute extends BaseEntityAttribute {
	valueType: ValueType.Text
}

export interface NumberEntityAttribute extends BaseEntityAttribute {
	valueType: ValueType.Number
}

export interface BooleanEntityAttribute extends BaseEntityAttribute {
	valueType: ValueType.Boolean
}

export interface DateEntityAttribute extends BaseEntityAttribute {
	valueType: ValueType.Date
}

export interface DateTimeEntityAttribute extends BaseEntityAttribute {
	valueType: ValueType.DateTime
}

export type EntityAttribute =
	| TextEntityAttribute
	| NumberEntityAttribute
	| BooleanEntityAttribute
	| DateEntityAttribute
	| DateTimeEntityAttribute

interface BaseCreateEntityAttributeInput {
	id: EntityAttributeId
	name: string
	description: string
	isRequired: boolean
	accessLevelId: AccessLevelId
	listingIndex: number
	value: string
}

export type CreateEntityAttributeInput =
	| (BaseCreateEntityAttributeInput & { valueType: ValueType.Text })
	| (BaseCreateEntityAttributeInput & { valueType: ValueType.Number })
	| (BaseCreateEntityAttributeInput & { valueType: ValueType.Boolean })
	| (BaseCreateEntityAttributeInput & { valueType: ValueType.Date })
	| (BaseCreateEntityAttributeInput & { valueType: ValueType.DateTime })

export interface EntityLink {
	id: EntityLinkId
	entityId: EntityId
	targetEntityId: EntityId | null
	targetEntityLabel?: string | null
	name: string
	description: string | null
	listingIndex: number
}

export interface EntityIncomingLink {
	id: EntityLinkId
	description: string | null
	listingIndex: number
	name: string
	sourceEntityId: EntityId
	sourceEntityLabel: string
}

export interface CreateEntityLinkInput {
	targetEntityId?: EntityId | null
	name: string
	description?: string | null
	listingIndex: number
}

export interface EntityTemplateAttributeValueInput {
	entityTemplateAttributeId: EntityTemplateAttributeId
	value: string
}

export interface EntityTemplateLinkTargetInput {
	entityTemplateLinkId: EntityTemplateLinkId
	targetEntityId?: EntityId | null
}

export interface CreateEntityFromTemplateInput {
	entityTemplateId: EntityTemplateId
	ownerUserId?: UserId
	attributes?: CreateEntityAttributeInput[]
	attributeValues?: EntityTemplateAttributeValueInput[]
	listingAttributeId?: EntityAttributeId
	links?: CreateEntityLinkInput[]
	linkTargets?: EntityTemplateLinkTargetInput[]
}

export interface CreateEntityFromScratchInput {
	entityTemplateId?: null
	ownerUserId?: UserId
	attributes: CreateEntityAttributeInput[]
	listingAttributeId: EntityAttributeId
	links?: CreateEntityLinkInput[]
}

export interface UpdateEntityInput {
	ownerUserId?: UserId
	attributes: CreateEntityAttributeInput[]
	listingAttributeId: EntityAttributeId
	links?: CreateEntityLinkInput[]
}

export type CreateEntityInput =
	| CreateEntityFromTemplateInput
	| CreateEntityFromScratchInput

export interface Entity {
	id: EntityId
	ownerUserId: UserId
	attributes: EntityAttribute[]
	listingAttributeId: EntityAttributeId
	links: EntityLink[]
	incomingLinks?: EntityIncomingLink[]
	incomingLinksCount?: number
	outgoingLinksCount?: number
}

export const entityModel = {
	entityName: 'Entity',
	tableName: 'entities',
} as const

export const entityAttributeModel = {
	entityName: 'EntityAttribute',
	tableNames: [
		'text_entity_attributes',
		'number_entity_attributes',
		'boolean_entity_attributes',
		'date_entity_attributes',
		'datetime_entity_attributes',
	],
} as const

export const textEntityAttributeModel = {
	entityName: 'TextEntityAttribute',
	tableName: 'text_entity_attributes',
	valueType: ValueType.Text,
} as const

export const numberEntityAttributeModel = {
	entityName: 'NumberEntityAttribute',
	tableName: 'number_entity_attributes',
	valueType: ValueType.Number,
} as const

export const booleanEntityAttributeModel = {
	entityName: 'BooleanEntityAttribute',
	tableName: 'boolean_entity_attributes',
	valueType: ValueType.Boolean,
} as const

export const dateEntityAttributeModel = {
	entityName: 'DateEntityAttribute',
	tableName: 'date_entity_attributes',
	valueType: ValueType.Date,
} as const

export const dateTimeEntityAttributeModel = {
	entityName: 'DateTimeEntityAttribute',
	tableName: 'datetime_entity_attributes',
	valueType: ValueType.DateTime,
} as const

export const entityLinkModel = {
	entityName: 'EntityLink',
	tableName: 'entity_links',
} as const

export function isEntityId(value: string): value is EntityId {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	)
}

export function isEntityAttributeId(
	value: string,
): value is EntityAttributeId {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	)
}

export function isEntityLinkId(value: string): value is EntityLinkId {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	)
}

function hasValidEntityAttributes(
	attributes: unknown,
	listingAttributeId: unknown,
): attributes is CreateEntityAttributeInput[] {
	if (
		!Array.isArray(attributes) ||
		attributes.length === 0 ||
		typeof listingAttributeId !== 'string' ||
		!isEntityAttributeId(listingAttributeId)
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
				isEntityAttributeId(input.id) &&
				typeof input.name === 'string' &&
				typeof input.description === 'string' &&
				isValueType(input.valueType) &&
				typeof input.isRequired === 'boolean' &&
				typeof input.accessLevelId === 'number' &&
				isAccessLevelId(input.accessLevelId) &&
				typeof input.listingIndex === 'number' &&
				Number.isInteger(input.listingIndex) &&
				input.listingIndex >= 0 &&
				typeof input.value === 'string'
			)
		}) &&
		uniqueAttributeIds.has(listingAttributeId)
	)
}

function isCreateEntityLinkInput(value: unknown): value is CreateEntityLinkInput {
	if (!value || typeof value !== 'object') {
		return false
	}

	const input = value as Record<string, unknown>

	return (
		(input.targetEntityId === undefined ||
			input.targetEntityId === null ||
			(typeof input.targetEntityId === 'string' &&
				isEntityId(input.targetEntityId))) &&
		typeof input.name === 'string' &&
		(input.description === undefined ||
			input.description === null ||
			typeof input.description === 'string') &&
		typeof input.listingIndex === 'number' &&
		Number.isInteger(input.listingIndex) &&
		input.listingIndex >= 0
	)
}

function isEntityTemplateAttributeValueInput(
	value: unknown,
): value is EntityTemplateAttributeValueInput {
	if (!value || typeof value !== 'object') {
		return false
	}

	const input = value as Record<string, unknown>

	return (
		typeof input.entityTemplateAttributeId === 'string' &&
		isEntityTemplateAttributeId(input.entityTemplateAttributeId) &&
		typeof input.value === 'string'
	)
}

function isEntityTemplateLinkTargetInput(
	value: unknown,
): value is EntityTemplateLinkTargetInput {
	if (!value || typeof value !== 'object') {
		return false
	}

	const input = value as Record<string, unknown>

	return (
		typeof input.entityTemplateLinkId === 'string' &&
		isEntityTemplateLinkId(input.entityTemplateLinkId) &&
		(input.targetEntityId === undefined ||
			input.targetEntityId === null ||
			(typeof input.targetEntityId === 'string' &&
				isEntityId(input.targetEntityId)))
	)
}

export function isCreateEntityInput(
	input: unknown,
): input is CreateEntityInput {
	if (!input || typeof input !== 'object') {
		return false
	}

	const value = input as Record<string, unknown>
	const hasValidOwnerUserId =
		value.ownerUserId === undefined ||
		(typeof value.ownerUserId === 'string' && isUserId(value.ownerUserId))

	if (typeof value.entityTemplateId === 'string') {
		const hasExplicitAttributes = value.attributes !== undefined

		return (
			hasValidOwnerUserId &&
			isEntityTemplateId(value.entityTemplateId) &&
			(hasExplicitAttributes
				? Array.isArray(value.attributes) &&
					value.attributes.length > 0 &&
					hasValidEntityAttributes(
						value.attributes,
						value.listingAttributeId,
					)
				: value.attributeValues === undefined ||
					(Array.isArray(value.attributeValues) &&
						value.attributeValues.every(
							isEntityTemplateAttributeValueInput,
						))) &&
			((value.links === undefined && value.linkTargets === undefined) ||
				(Array.isArray(value.links) &&
					value.links.every(isCreateEntityLinkInput)) ||
				(Array.isArray(value.linkTargets) &&
					value.linkTargets.every(isEntityTemplateLinkTargetInput)))
		)
	}

	return (
		hasValidOwnerUserId &&
		(value.entityTemplateId === undefined || value.entityTemplateId === null) &&
		hasValidEntityAttributes(value.attributes, value.listingAttributeId) &&
		(value.links === undefined ||
			(Array.isArray(value.links) &&
				value.links.every(isCreateEntityLinkInput)))
	)
}

export function isUpdateEntityInput(
	input: unknown,
): input is UpdateEntityInput {
	if (!input || typeof input !== 'object') {
		return false
	}

	const value = input as Record<string, unknown>

	return (
		(value.ownerUserId === undefined ||
			(typeof value.ownerUserId === 'string' && isUserId(value.ownerUserId))) &&
		hasValidEntityAttributes(value.attributes, value.listingAttributeId) &&
		(value.links === undefined ||
			(Array.isArray(value.links) &&
				value.links.every(isCreateEntityLinkInput)))
	)
}
