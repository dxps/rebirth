import {
	userModel,
	userPermissionModel,
	userSessionModel,
} from '@rebirth/shared'
import { sql } from 'drizzle-orm'
import {
	check,
	foreignKey,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid,
} from 'drizzle-orm/pg-core'

import { permissions } from './permissions'

export const users = pgTable(
	userModel.tableName,
	{
		id: uuid('id').primaryKey(),
		email: text('email').notNull(),
		firstName: text('first_name').notNull(),
		lastName: text('last_name').notNull(),
		username: text('username').notNull(),
		passwordHash: text('password_hash').notNull(),
	},
	(table) => [
		unique('users_email_unique').on(table.email),
		unique('users_username_unique').on(table.username),
		check('users_email_trimmed_check', sql`${table.email} = btrim(${table.email})`),
		check('users_first_name_trimmed_check', sql`${table.firstName} = btrim(${table.firstName})`),
		check('users_last_name_trimmed_check', sql`${table.lastName} = btrim(${table.lastName})`),
		check('users_username_trimmed_check', sql`${table.username} = btrim(${table.username})`),
		check('users_email_contains_at_check', sql`position('@' in ${table.email}) > 1`),
	],
)

export const userPermissions = pgTable(
	userPermissionModel.tableName,
	{
		userId: uuid('user_id').notNull(),
		permissionId: integer('permission_id').notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.permissionId],
			name: 'user_permissions_user_id_permission_id_pk',
		}),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'user_permissions_user_id_users_id_fk',
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.permissionId],
			foreignColumns: [permissions.id],
			name: 'user_permissions_permission_id_permissions_id_fk',
		}).onDelete('cascade'),
	],
)

export const userSessions = pgTable(
	userSessionModel.tableName,
	{
		id: uuid('id').primaryKey(),
		userId: uuid('user_id').notNull(),
		sessionKey: text('session_key').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
	},
	(table) => [
		unique('user_sessions_session_key_unique').on(table.sessionKey),
		index('user_sessions_user_id_idx').on(table.userId),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'user_sessions_user_id_users_id_fk',
		}).onDelete('cascade'),
	],
)
