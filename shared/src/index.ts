import {
	isAccessLevelId,
	type AccessLevel,
	type CreateAccessLevelInput,
	type UpdateAccessLevelInput,
} from './security/access-level'
import {
	isValueType,
	type AttributeTemplate,
	type CreateAttributeTemplateInput,
	type UpdateAttributeTemplateInput,
} from './types/attribute-template'
import {
	hasValidEntityTemplateAttributes,
	isEntityTemplateAttributeId,
	isEntityTemplateId,
	type CreateEntityTemplateAttributeInput,
	type CreateEntityTemplateInput,
	type CreateEntityTemplateLinkInput,
	type EntityTemplate,
	type UpdateEntityTemplateInput,
} from './types/entity-template'

export type ServiceStatus = 'ok' | 'degraded' | 'down'

export interface HealthResponse {
	appName: string
	checkedAt: string
	status: ServiceStatus
}

export interface AccessLevelsResponse {
	data: AccessLevel[]
}

export interface AccessLevelResponse {
	data: AccessLevel
}

export interface AttributeTemplatesResponse {
	data: AttributeTemplate[]
}

export interface AttributeTemplateResponse {
	data: AttributeTemplate
}

export interface EntityTemplatesResponse {
	data: EntityTemplate[]
}

export interface EntityTemplateResponse {
	data: EntityTemplate
}

export type ApiErrorCode = 'unique_conflict'

export interface ApiErrorResponse {
	error: {
		code: ApiErrorCode
		details?: string
		message: string
	}
}

export const appInfo = {
	name: 'Rebirth',
	description: 'An ontology simplified knowledge management system',
} as const

export const apiRoutes = {
	accessLevel: (id: number) => `/access-levels/${id}`,
	accessLevels: '/access-levels',
	attributeTemplate: (id: string) => `/attribute-templates/${id}`,
	attributeTemplates: '/attribute-templates',
	entityTemplate: (id: string) => `/entity-templates/${id}`,
	entityTemplates: '/entity-templates',
	health: '/health',
} as const

export const jsonHeaders = {
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Allow-Methods': 'DELETE, GET, PATCH, OPTIONS, POST',
	'Access-Control-Allow-Origin': '*',
	'Content-Type': 'application/json',
} as const

export function createHealthResponse(status: ServiceStatus): HealthResponse {
	return {
		appName: appInfo.name,
		checkedAt: new Date().toISOString(),
		status,
	}
}

export function isUpdateAccessLevelInput(
	value: unknown,
): value is UpdateAccessLevelInput {
	if (!value || typeof value !== 'object') {
		return false
	}

	const input = value as Record<string, unknown>

	return (
		(input.name === undefined || typeof input.name === 'string') &&
		(input.description === undefined ||
			typeof input.description === 'string')
	)
}

export function isCreateAccessLevelInput(
	value: unknown,
): value is CreateAccessLevelInput {
	if (!value || typeof value !== 'object') {
		return false
	}

	const input = value as Record<string, unknown>

	return (
		typeof input.name === 'string' &&
		typeof input.description === 'string'
	)
}

export function isUpdateAttributeTemplateInput(
	value: unknown,
): value is UpdateAttributeTemplateInput {
	if (!value || typeof value !== 'object') {
		return false
	}

	const input = value as Record<string, unknown>

	return (
		(input.name === undefined || typeof input.name === 'string') &&
		(input.description === undefined ||
			typeof input.description === 'string') &&
		(input.valueType === undefined || isValueType(input.valueType)) &&
		(input.defaultValue === undefined ||
			input.defaultValue === null ||
			typeof input.defaultValue === 'string') &&
		(input.isRequired === undefined ||
			typeof input.isRequired === 'boolean') &&
		(input.accessLevelId === undefined ||
			(typeof input.accessLevelId === 'number' &&
				isAccessLevelId(input.accessLevelId)))
	)
}

export function isCreateAttributeTemplateInput(
	value: unknown,
): value is CreateAttributeTemplateInput {
	if (!value || typeof value !== 'object') {
		return false
	}

	const input = value as Record<string, unknown>

	return (
		typeof input.name === 'string' &&
		typeof input.description === 'string' &&
		isValueType(input.valueType) &&
		(input.defaultValue === undefined ||
			input.defaultValue === null ||
			typeof input.defaultValue === 'string') &&
		typeof input.isRequired === 'boolean' &&
		typeof input.accessLevelId === 'number' &&
		isAccessLevelId(input.accessLevelId)
	)
}

function isCreateEntityTemplateLinkInput(
	value: unknown,
): value is CreateEntityTemplateLinkInput {
	if (!value || typeof value !== 'object') {
		return false
	}

	const input = value as Record<string, unknown>

	return (
		typeof input.targetEntityTemplateId === 'string' &&
		isEntityTemplateId(input.targetEntityTemplateId) &&
		typeof input.name === 'string' &&
		(input.description === undefined ||
			input.description === null ||
			typeof input.description === 'string') &&
		typeof input.listingIndex === 'number' &&
		Number.isInteger(input.listingIndex) &&
		input.listingIndex >= 0
	)
}

export function isCreateEntityTemplateInput(
	value: unknown,
): value is CreateEntityTemplateInput {
	if (!value || typeof value !== 'object') {
		return false
	}

	const input = value as Record<string, unknown>

	return (
		typeof input.name === 'string' &&
		typeof input.description === 'string' &&
		hasValidEntityTemplateAttributes(
			input.attributes,
			input.listingAttributeId,
		) &&
		(input.links === undefined ||
			(Array.isArray(input.links) &&
				input.links.every(isCreateEntityTemplateLinkInput)))
	)
}

export function isUpdateEntityTemplateInput(
	value: unknown,
): value is UpdateEntityTemplateInput {
	if (!value || typeof value !== 'object') {
		return false
	}

	const input = value as Record<string, unknown>
	const hasAttributeUpdate =
		input.attributes !== undefined ||
		input.listingAttributeId !== undefined

	return (
		(input.name === undefined || typeof input.name === 'string') &&
		(input.description === undefined ||
			typeof input.description === 'string') &&
		(!hasAttributeUpdate ||
			hasValidEntityTemplateAttributes(
				input.attributes,
				input.listingAttributeId,
			)) &&
		(input.links === undefined ||
			(Array.isArray(input.links) &&
				input.links.every(isCreateEntityTemplateLinkInput)))
	)
}

export { accessLevelModel, isAccessLevelId } from './security/access-level'
export type {
	AccessLevel,
	AccessLevelId,
	CreateAccessLevelInput,
	UpdateAccessLevelInput,
} from './security/access-level'
export {
	attributeTemplateModel,
	isAttributeTemplateId,
	isValueType,
	ValueType,
	valueTypes,
} from './types/attribute-template'
export type {
	AttributeTemplate,
	AttributeTemplateId,
	CreateAttributeTemplateInput,
	UpdateAttributeTemplateInput,
} from './types/attribute-template'
export {
	entityTemplateAttributeModel,
	entityTemplateLinkModel,
	entityTemplateModel,
	hasValidEntityTemplateAttributes,
	isEntityTemplateAttributeId,
	isEntityTemplateId,
} from './types/entity-template'
export type {
	CreateEntityTemplateAttributeInput,
	CreateEntityTemplateInput,
	CreateEntityTemplateLinkInput,
	EntityTemplate,
	EntityTemplateAttribute,
	EntityTemplateAttributeId,
	EntityTemplateId,
	EntityTemplateLink,
	EntityTemplateLinkId,
	UpdateEntityTemplateInput,
} from './types/entity-template'
