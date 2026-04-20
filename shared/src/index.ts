import {
	type AccessLevel,
	type CreateAccessLevelInput,
	type UpdateAccessLevelInput,
} from './security/access-level'

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

export type ApiErrorCode = 'unique_conflict'

export interface ApiErrorResponse {
	error: {
		code: ApiErrorCode
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

export { accessLevelModel, isAccessLevelId } from './security/access-level'
export type {
	AccessLevel,
	AccessLevelId,
	CreateAccessLevelInput,
	UpdateAccessLevelInput,
} from './security/access-level'
