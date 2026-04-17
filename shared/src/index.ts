import { type AccessLevel } from './security/access-level'

export type ServiceStatus = 'ok' | 'degraded' | 'down'

export interface HealthResponse {
	appName: string
	checkedAt: string
	status: ServiceStatus
}

export interface AccessLevelsResponse {
	data: AccessLevel[]
}

export const appInfo = {
	name: 'Rebirth',
	description: 'An ontology simplified knowledge management system',
} as const

export const apiRoutes = {
	accessLevels: '/access-levels',
	health: '/health',
} as const

export const jsonHeaders = {
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

export { accessLevelModel, isAccessLevelId } from './security/access-level'
export type {
	AccessLevel,
	AccessLevelId,
	CreateAccessLevelInput,
	UpdateAccessLevelInput,
} from './security/access-level'
