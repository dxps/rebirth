export type PermissionId = number

export enum PermissionName {
	Admin = 'Admin',
	Editor = 'Editor',
	ManageOwnData = 'Manage Own Data',
	Viewer = 'Viewer',
	Audit = 'Audit',
}

export const permissionNames = [
	PermissionName.Admin,
	PermissionName.Editor,
	PermissionName.ManageOwnData,
	PermissionName.Viewer,
	PermissionName.Audit,
] as const

export interface Permission {
	id: PermissionId
	name: PermissionName
	description: string
}

export const permissionModel = {
	entityName: 'Permission',
	tableName: 'permissions',
	uniqueFields: ['name'],
} as const

export function isPermissionId(value: number): value is PermissionId {
	return Number.isInteger(value) && value > 0
}

export function isPermissionName(value: unknown): value is PermissionName {
	return (
		typeof value === 'string' &&
		(permissionNames as readonly string[]).includes(value)
	)
}
