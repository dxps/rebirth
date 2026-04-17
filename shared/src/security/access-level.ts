export type AccessLevelId = number

export interface AccessLevel {
	id: AccessLevelId
	name: string
	description: string
}

export type CreateAccessLevelInput = Omit<AccessLevel, 'id'>

export type UpdateAccessLevelInput = Partial<CreateAccessLevelInput>

export const accessLevelModel = {
	entityName: 'AccessLevel',
	tableName: 'access_levels',
	uniqueFields: ['name'],
} as const

export function isAccessLevelId(value: number): value is AccessLevelId {
	return Number.isInteger(value) && value > 0
}
