import {
	permissionModel,
	PermissionName,
	permissionNames,
} from '@rebirth/shared'
import { pgEnum, pgTable, serial, text } from 'drizzle-orm/pg-core'

export const permissionName = pgEnum('permission_name', permissionNames)

export const permissions = pgTable(permissionModel.tableName, {
	id: serial('id').primaryKey(),
	name: permissionName('name').notNull().unique(),
	description: text('description').notNull(),
})

export const seededPermissions = [
	{
		id: 1,
		name: PermissionName.Admin,
		description:
			'Can manage users, security (access levels, permissions), templates and data.',
	},
	{
		id: 2,
		name: PermissionName.Editor,
		description: 'Can create, update, and delete templates and data.',
	},
	{
		id: 3,
		name: PermissionName.Viewer,
		description: 'Can view managed data with public access (level).',
	},
] as const
