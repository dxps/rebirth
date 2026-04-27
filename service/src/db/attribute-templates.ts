import { asc, eq } from 'drizzle-orm'
import {
	type CreateAttributeTemplateInput,
	type UpdateAttributeTemplateInput,
} from '@rebirth/shared'

import { createDatabase, getDatabaseUrl } from './client'
import { attributeTemplates } from './schema'
import { createUuidV7 } from './uuid'

function normalizeCreateInput(
	input: CreateAttributeTemplateInput,
): CreateAttributeTemplateInput {
	return {
		...input,
		defaultValue:
			input.defaultValue && input.defaultValue.trim().length > 0
				? input.defaultValue.trim()
				: null,
		description: input.description.trim(),
		name: input.name.trim(),
	}
}

function normalizeUpdateInput(
	input: UpdateAttributeTemplateInput,
): UpdateAttributeTemplateInput {
	return {
		...input,
		defaultValue:
			input.defaultValue === undefined
				? undefined
				: input.defaultValue && input.defaultValue.trim().length > 0
					? input.defaultValue.trim()
					: null,
		description: input.description?.trim(),
		name: input.name?.trim(),
	}
}

export async function listAttributeTemplates() {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client, db } = createDatabase(databaseUrl)

	try {
		return await db
			.select()
			.from(attributeTemplates)
			.orderBy(asc(attributeTemplates.name))
	} finally {
		await client.end()
	}
}

export async function createAttributeTemplate(
	ownerUserId: string,
	input: CreateAttributeTemplateInput,
) {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client, db } = createDatabase(databaseUrl)

	try {
		const [createdAttributeTemplate] = await db
			.insert(attributeTemplates)
			.values({
				...normalizeCreateInput(input),
				id: createUuidV7(),
				ownerUserId,
			})
			.returning()

		return createdAttributeTemplate
	} finally {
		await client.end()
	}
}

export async function updateAttributeTemplate(
	id: string,
	input: UpdateAttributeTemplateInput,
) {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client, db } = createDatabase(databaseUrl)

	try {
		const [updatedAttributeTemplate] = await db
			.update(attributeTemplates)
			.set(normalizeUpdateInput(input))
			.where(eq(attributeTemplates.id, id))
			.returning()

		return updatedAttributeTemplate
	} finally {
		await client.end()
	}
}

export async function deleteAttributeTemplate(id: string) {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client, db } = createDatabase(databaseUrl)

	try {
		const [deletedAttributeTemplate] = await db
			.delete(attributeTemplates)
			.where(eq(attributeTemplates.id, id))
			.returning()

		return deletedAttributeTemplate
	} finally {
		await client.end()
	}
}
