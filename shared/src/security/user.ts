import {
	isPermissionId,
	type Permission,
	type PermissionId,
} from './permission'

export type UserId = string

export interface User {
	id: UserId
	email: string
	firstName: string
	lastName: string
	username: string
	permissions: Permission[]
}

export interface CreateUserInput {
	email: string
	firstName: string
	lastName: string
	username: string
	password: string
	permissionIds: PermissionId[]
}

export type UpdateUserInput = Partial<CreateUserInput>

export const userModel = {
	entityName: 'User',
	tableName: 'users',
	uniqueFields: ['email', 'username'],
} as const

export const userPermissionModel = {
	entityName: 'UserPermission',
	tableName: 'user_permissions',
} as const

export const userSessionModel = {
	entityName: 'UserSession',
	tableName: 'user_sessions',
} as const

export function isUserId(value: string): value is UserId {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	)
}

export function hasValidPermissionIds(
	value: unknown,
): value is PermissionId[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		new Set(value).size === value.length &&
		value.every(
			(permissionId) =>
				typeof permissionId === 'number' &&
				isPermissionId(permissionId),
		)
	)
}
