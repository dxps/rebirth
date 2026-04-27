import type {
	AccessLevel,
	CreateUserInput,
	Permission,
	PermissionName,
	UpdateUserInput,
	User,
} from '@rebirth/shared'
import type postgres from 'postgres'

import { insertAuditEvent } from './audit-events'
import { createDatabase, getDatabaseUrl } from './client'
import { createUuidV7 } from './uuid'

interface UserRow {
	id: string
	email: string
	first_name: string
	last_name: string
	username: string
}

interface UserWithPasswordRow extends UserRow {
	password_hash: string
}

interface UserPermissionRow {
	user_id: string
	permission_id: number
	permission_name: PermissionName
	permission_description: string
}

interface UserAccessLevelRow {
	user_id: string
	access_level_id: number
	access_level_name: string
	access_level_description: string
}

type AuditChangeValue =
	| {
			from: string | number[]
			to: string | number[]
	  }
	| {
			changed: true
	  }

type AuditChanges = Record<string, AuditChangeValue>

function createSessionKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32))
	let binary = ''

	for (const byte of bytes) {
		binary += String.fromCharCode(byte)
	}

	return btoa(binary)
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '')
}

function normalizeCreateInput(input: CreateUserInput): CreateUserInput {
	return {
		email: input.email.trim().toLowerCase(),
		firstName: input.firstName.trim(),
		lastName: input.lastName.trim(),
		password: input.password,
		accessLevelIds: input.accessLevelIds,
		permissionIds: input.permissionIds,
		username: input.username.trim(),
	}
}

function normalizeUpdateInput(input: UpdateUserInput): UpdateUserInput {
	return {
		email: input.email?.trim().toLowerCase(),
		firstName: input.firstName?.trim(),
		lastName: input.lastName?.trim(),
		password: input.password,
		accessLevelIds: input.accessLevelIds,
		permissionIds: input.permissionIds,
		username: input.username?.trim(),
	}
}

function getSortedIds(ids: number[]): number[] {
	return ids.slice().sort((left, right) => left - right)
}

function haveSameIds(left: number[], right: number[]): boolean {
	const sortedLeft = getSortedIds(left)
	const sortedRight = getSortedIds(right)

	return (
		sortedLeft.length === sortedRight.length &&
		sortedLeft.every((id, index) => id === sortedRight[index])
	)
}

function stringifyAuditContent(content: unknown): string {
	return JSON.stringify(content)
}

function getCreatedUserAuditContent(
	id: string,
	input: CreateUserInput,
): string {
	return stringifyAuditContent({
		user: {
			accessLevelIds: getSortedIds(input.accessLevelIds),
			email: input.email,
			firstName: input.firstName,
			id,
			lastName: input.lastName,
			permissionIds: getSortedIds(input.permissionIds),
			username: input.username,
		},
	})
}

function getUserAuditContent(user: User): string {
	return stringifyAuditContent({
		user: {
			accessLevelIds: getSortedIds(
				user.accessLevels.map((accessLevel) => accessLevel.id),
			),
			email: user.email,
			firstName: user.firstName,
			id: user.id,
			lastName: user.lastName,
			permissionIds: getSortedIds(
				user.permissions.map((permission) => permission.id),
			),
			username: user.username,
		},
	})
}

function getUserUpdateAuditChanges(
	existingUser: User,
	input: UpdateUserInput,
): AuditChanges {
	const changes: AuditChanges = {}

	if (input.email !== undefined && input.email !== existingUser.email) {
		changes.email = { from: existingUser.email, to: input.email }
	}

	if (
		input.firstName !== undefined &&
		input.firstName !== existingUser.firstName
	) {
		changes.firstName = {
			from: existingUser.firstName,
			to: input.firstName,
		}
	}

	if (
		input.lastName !== undefined &&
		input.lastName !== existingUser.lastName
	) {
		changes.lastName = {
			from: existingUser.lastName,
			to: input.lastName,
		}
	}

	if (input.username !== undefined && input.username !== existingUser.username) {
		changes.username = { from: existingUser.username, to: input.username }
	}

	if (input.password !== undefined) {
		changes.password = { changed: true }
	}

	if (input.permissionIds !== undefined) {
		const existingPermissionIds = existingUser.permissions.map(
			(permission) => permission.id,
		)

		if (!haveSameIds(input.permissionIds, existingPermissionIds)) {
			changes.permissionIds = {
				from: getSortedIds(existingPermissionIds),
				to: getSortedIds(input.permissionIds),
			}
		}
	}

	if (input.accessLevelIds !== undefined) {
		const existingAccessLevelIds = existingUser.accessLevels.map(
			(accessLevel) => accessLevel.id,
		)

		if (!haveSameIds(input.accessLevelIds, existingAccessLevelIds)) {
			changes.accessLevelIds = {
				from: getSortedIds(existingAccessLevelIds),
				to: getSortedIds(input.accessLevelIds),
			}
		}
	}

	return changes
}

function getUpdatedUserAuditContent(
	userId: string,
	changes: AuditChanges,
): string {
	return stringifyAuditContent({
		changes,
		userId,
	})
}

function toUser(
	row: UserRow,
	permissionRows: UserPermissionRow[],
	accessLevelRows: UserAccessLevelRow[],
): User {
	return {
		accessLevels: accessLevelRows
			.filter((accessLevelRow) => accessLevelRow.user_id === row.id)
			.map((accessLevelRow): AccessLevel => ({
				description: accessLevelRow.access_level_description,
				id: accessLevelRow.access_level_id,
				name: accessLevelRow.access_level_name,
			})),
		email: row.email,
		firstName: row.first_name,
		id: row.id,
		lastName: row.last_name,
		permissions: permissionRows
			.filter((permissionRow) => permissionRow.user_id === row.id)
			.map((permissionRow): Permission => ({
				description: permissionRow.permission_description,
				id: permissionRow.permission_id,
				name: permissionRow.permission_name,
			})),
		username: row.username,
	}
}

function toUsers(
	rows: UserRow[],
	permissionRows: UserPermissionRow[],
	accessLevelRows: UserAccessLevelRow[],
): User[] {
	return rows.map((row) => toUser(row, permissionRows, accessLevelRows))
}

async function readUserRows(
	client: ReturnType<typeof createDatabase>['client'],
	id?: string,
): Promise<User[]> {
	const rows = id
		? await client<UserRow[]>`
			SELECT id, email, first_name, last_name, username
			FROM users
			WHERE id = ${id}
			ORDER BY username
		`
		: await client<UserRow[]>`
			SELECT id, email, first_name, last_name, username
			FROM users
			ORDER BY username
		`

	if (rows.length === 0) {
		return []
	}

	const ids = rows.map((row) => row.id)
	const permissionRows = await client<UserPermissionRow[]>`
		SELECT
			user_permissions.user_id,
			permissions.id AS permission_id,
			permissions.name AS permission_name,
			permissions.description AS permission_description
		FROM user_permissions
		INNER JOIN permissions ON permissions.id = user_permissions.permission_id
		WHERE user_permissions.user_id = ANY(${ids})
		ORDER BY permissions.id
	`

	const accessLevelRows = await client<UserAccessLevelRow[]>`
		SELECT
			user_access_levels.user_id,
			access_levels.id AS access_level_id,
			access_levels.name AS access_level_name,
			access_levels.description AS access_level_description
		FROM user_access_levels
		INNER JOIN access_levels ON access_levels.id = user_access_levels.access_level_id
		WHERE user_access_levels.user_id = ANY(${ids})
		ORDER BY access_levels.id
	`

	return toUsers(rows, permissionRows, accessLevelRows)
}

async function replaceUserPermissions(
	sql: postgres.TransactionSql,
	userId: string,
	permissionIds: number[],
): Promise<void> {
	await sql`
		DELETE FROM user_permissions
		WHERE user_id = ${userId}
	`

	for (const permissionId of permissionIds) {
		await sql`
			INSERT INTO user_permissions (user_id, permission_id)
			VALUES (${userId}, ${permissionId})
		`
	}
}

async function replaceUserAccessLevels(
	sql: postgres.TransactionSql,
	userId: string,
	accessLevelIds: number[],
): Promise<void> {
	await sql`
		DELETE FROM user_access_levels
		WHERE user_id = ${userId}
	`

	for (const accessLevelId of accessLevelIds) {
		await sql`
			INSERT INTO user_access_levels (user_id, access_level_id)
			VALUES (${userId}, ${accessLevelId})
		`
	}
}

export async function countUsers(): Promise<number> {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)

	try {
		const [row] = await client<Array<{ count: string }>>`
			SELECT COUNT(*) AS count
			FROM users
		`

		return Number.parseInt(row?.count ?? '0', 10)
	} finally {
		await client.end()
	}
}

export async function listUsers(): Promise<User[]> {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)

	try {
		return await readUserRows(client)
	} finally {
		await client.end()
	}
}

export async function createUser(input: CreateUserInput): Promise<User | undefined> {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const normalizedInput = normalizeCreateInput(input)
	const { client } = createDatabase(databaseUrl)
	const id = createUuidV7()
	const passwordHash = await Bun.password.hash(normalizedInput.password)

	try {
		await client.begin(async (sql) => {
			await sql`
				INSERT INTO users (
					id,
					email,
					first_name,
					last_name,
					username,
					password_hash
				)
				VALUES (
					${id},
					${normalizedInput.email},
					${normalizedInput.firstName},
					${normalizedInput.lastName},
					${normalizedInput.username},
					${passwordHash}
				)
			`
			await replaceUserAccessLevels(sql, id, normalizedInput.accessLevelIds)
			await replaceUserPermissions(sql, id, normalizedInput.permissionIds)
			await insertAuditEvent(sql, {
				content: getCreatedUserAuditContent(id, normalizedInput),
				name: 'user.created',
			})
		})

		const [createdUser] = await readUserRows(client, id)

		return createdUser
	} finally {
		await client.end()
	}
}

export async function updateUser(
	id: string,
	input: UpdateUserInput,
): Promise<User | undefined> {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const normalizedInput = normalizeUpdateInput(input)
	const { client } = createDatabase(databaseUrl)

	try {
		const [existingUser] = await readUserRows(client, id)

		if (!existingUser) {
			return undefined
		}

		const auditChanges = getUserUpdateAuditChanges(
			existingUser,
			normalizedInput,
		)
		const passwordHash =
			normalizedInput.password === undefined
				? undefined
				: await Bun.password.hash(normalizedInput.password)

		await client.begin(async (sql) => {
			if (passwordHash === undefined) {
				await sql`
					UPDATE users
					SET
						email = ${normalizedInput.email ?? existingUser.email},
						first_name = ${normalizedInput.firstName ?? existingUser.firstName},
						last_name = ${normalizedInput.lastName ?? existingUser.lastName},
						username = ${normalizedInput.username ?? existingUser.username}
					WHERE id = ${id}
				`
			} else {
				await sql`
					UPDATE users
					SET
						email = ${normalizedInput.email ?? existingUser.email},
						first_name = ${normalizedInput.firstName ?? existingUser.firstName},
						last_name = ${normalizedInput.lastName ?? existingUser.lastName},
						username = ${normalizedInput.username ?? existingUser.username},
						password_hash = ${passwordHash}
					WHERE id = ${id}
				`
			}

			if (normalizedInput.permissionIds !== undefined) {
				await replaceUserPermissions(sql, id, normalizedInput.permissionIds)
			}

			if (normalizedInput.accessLevelIds !== undefined) {
				await replaceUserAccessLevels(sql, id, normalizedInput.accessLevelIds)
			}

			if (Object.keys(auditChanges).length > 0) {
				await insertAuditEvent(sql, {
					content: getUpdatedUserAuditContent(id, auditChanges),
					name: 'user.updated',
				})
			}
		})

		const [updatedUser] = await readUserRows(client, id)

		return updatedUser
	} finally {
		await client.end()
	}
}

export async function getUser(id: string): Promise<User | undefined> {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)

	try {
		const [user] = await readUserRows(client, id)

		return user
	} finally {
		await client.end()
	}
}

export async function updateUserEmail(
	id: string,
	email: string,
	firstName: string,
	lastName: string,
): Promise<User | undefined> {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const normalizedEmail = email.trim().toLowerCase()
	const normalizedFirstName = firstName.trim()
	const normalizedLastName = lastName.trim()
	const { client } = createDatabase(databaseUrl)

	try {
		const [existingUser] = await readUserRows(client, id)

		if (!existingUser) {
			return undefined
		}

		const auditChanges = getUserUpdateAuditChanges(existingUser, {
			email: normalizedEmail,
			firstName: normalizedFirstName,
			lastName: normalizedLastName,
		})

		await client.begin(async (sql) => {
			await sql`
				UPDATE users
				SET
					email = ${normalizedEmail},
					first_name = ${normalizedFirstName},
					last_name = ${normalizedLastName}
				WHERE id = ${id}
			`

			if (Object.keys(auditChanges).length > 0) {
				await insertAuditEvent(sql, {
					content: getUpdatedUserAuditContent(id, auditChanges),
					name: 'user.updated',
				})
			}
		})

		const [updatedUser] = await readUserRows(client, id)

		return updatedUser
	} finally {
		await client.end()
	}
}

export async function updateUserPassword(
	id: string,
	currentPassword: string,
	newPassword: string,
): Promise<'invalid_current_password' | User | undefined> {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)

	try {
		const [row] = await client<Array<{ password_hash: string }>>`
			SELECT password_hash
			FROM users
			WHERE id = ${id}
			LIMIT 1
		`

		if (!row) {
			return undefined
		}

		const isCurrentPasswordValid = await Bun.password.verify(
			currentPassword,
			row.password_hash,
		)

		if (!isCurrentPasswordValid) {
			return 'invalid_current_password'
		}

		const passwordHash = await Bun.password.hash(newPassword)

		await client.begin(async (sql) => {
			await sql`
				UPDATE users
				SET password_hash = ${passwordHash}
				WHERE id = ${id}
			`

			await insertAuditEvent(sql, {
				content: getUpdatedUserAuditContent(id, {
					password: { changed: true },
				}),
				name: 'user.updated',
			})
		})

		const [updatedUser] = await readUserRows(client, id)

		return updatedUser
	} finally {
		await client.end()
	}
}

export async function deleteUser(id: string): Promise<User | undefined> {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)

	try {
		const [user] = await readUserRows(client, id)

		if (!user) {
			return undefined
		}

		await client.begin(async (sql) => {
			await sql`
				DELETE FROM users
				WHERE id = ${id}
			`

			await insertAuditEvent(sql, {
				content: getUserAuditContent(user),
				name: 'user.deleted',
			})
		})

		return user
	} finally {
		await client.end()
	}
}

export async function authenticateUser(
	identifier: string,
	password: string,
): Promise<User | undefined> {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const normalizedIdentifier = identifier.trim().toLowerCase()
	const { client } = createDatabase(databaseUrl)

	try {
		const [row] = await client<UserWithPasswordRow[]>`
			SELECT id, email, first_name, last_name, username, password_hash
			FROM users
			WHERE email = ${normalizedIdentifier}
				OR lower(username) = ${normalizedIdentifier}
			LIMIT 1
		`

		if (!row) {
			return undefined
		}

		const isPasswordValid = await Bun.password.verify(
			password,
			row.password_hash,
		)

		if (!isPasswordValid) {
			return undefined
		}

		const [user] = await readUserRows(client, row.id)

		return user
	} finally {
		await client.end()
	}
}

export async function createUserSession(userId: string): Promise<string> {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)
	const id = createUuidV7()
	const sessionKey = createSessionKey()

	try {
		await client`
			INSERT INTO user_sessions (id, user_id, session_key)
			VALUES (${id}, ${userId}, ${sessionKey})
		`

		return sessionKey
	} finally {
		await client.end()
	}
}

export async function getUserBySessionKey(
	sessionKey: string,
): Promise<User | undefined> {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)

	try {
		const [session] = await client<Array<{ user_id: string }>>`
			SELECT user_id
			FROM user_sessions
			WHERE session_key = ${sessionKey}
				AND revoked_at IS NULL
			LIMIT 1
		`

		if (!session) {
			return undefined
		}

		const [user] = await readUserRows(client, session.user_id)

		return user
	} finally {
		await client.end()
	}
}

export async function revokeUserSession(sessionKey: string): Promise<boolean> {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)

	try {
		const rows = await client<Array<{ id: string }>>`
			UPDATE user_sessions
			SET revoked_at = now()
			WHERE session_key = ${sessionKey}
				AND revoked_at IS NULL
			RETURNING id
		`

		return rows.length > 0
	} finally {
		await client.end()
	}
}
