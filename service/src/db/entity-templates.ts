import type {
	CreateEntityTemplateInput,
	CreateEntityTemplateAttributeInput,
	CreateEntityTemplateLinkInput,
	EntityTemplate,
	EntityTemplateAttribute,
	EntityTemplateLink,
	ValueType,
	UpdateEntityTemplateInput,
} from '@rebirth/shared'
import type postgres from 'postgres'

import { createDatabase, getDatabaseUrl } from './client'
import { createUuidV7 } from './uuid'

type NormalizedCreateEntityTemplateInput = Omit<
	CreateEntityTemplateInput,
	'attributes'
> & {
	attributes: EntityTemplateAttribute[]
}

interface EntityTemplateRow {
	id: string
	name: string
	description: string
	listing_attribute_id: string
}

interface EntityTemplateAttributeRow {
	id: string
	entity_template_id: string
	attribute_template_id: string | null
	name: string
	description: string
	value_type: ValueType
	access_level_id: number
	listing_index: number
}

interface EntityTemplateLinkRow {
	id: string
	entity_template_id: string
	target_entity_template_id: string
	name: string
	description: string | null
}

function normalizeNullableText(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null
	}

	const trimmedValue = value.trim()

	return trimmedValue.length > 0 ? trimmedValue : null
}

function normalizeLinks(
	links: CreateEntityTemplateLinkInput[] | undefined,
): CreateEntityTemplateLinkInput[] {
	return (links ?? []).map((link) => ({
		description: normalizeNullableText(link.description),
		name: link.name.trim(),
		targetEntityTemplateId: link.targetEntityTemplateId,
	}))
}

function normalizeCreateInput(
	input: CreateEntityTemplateInput,
): NormalizedCreateEntityTemplateInput {
	return {
		...input,
		attributes: normalizeAttributes(input.attributes),
		description: input.description.trim(),
		links: normalizeLinks(input.links),
		name: input.name.trim(),
	}
}

function normalizeAttributes(
	attributes: CreateEntityTemplateAttributeInput[] | EntityTemplateAttribute[],
): EntityTemplateAttribute[] {
	return attributes
		.map((attribute, index) => ({
			id: attribute.id,
			accessLevelId: attribute.accessLevelId,
			attributeTemplateId: attribute.attributeTemplateId ?? null,
			description: attribute.description.trim(),
			listingIndex: attribute.listingIndex ?? index,
			name: attribute.name.trim(),
			valueType: attribute.valueType,
		}))
		.sort((left, right) => left.listingIndex - right.listingIndex)
}

function isListingAttributeIncluded(input: {
	attributes: Array<{ id: string }>
	listingAttributeId: string
}): boolean {
	return input.attributes.some(
		(attribute) => attribute.id === input.listingAttributeId,
	)
}

function toEntityTemplateLink(row: EntityTemplateLinkRow): EntityTemplateLink {
	return {
		description: row.description,
		entityTemplateId: row.entity_template_id,
		id: row.id,
		name: row.name,
		targetEntityTemplateId: row.target_entity_template_id,
	}
}

function toEntityTemplate(
	row: EntityTemplateRow,
	attributeRows: EntityTemplateAttributeRow[],
	linkRows: EntityTemplateLinkRow[],
): EntityTemplate {
	return {
		attributes: attributeRows
			.filter((attributeRow) => attributeRow.entity_template_id === row.id)
			.sort((left, right) => left.listing_index - right.listing_index)
			.map((attributeRow) => ({
				id: attributeRow.id,
				accessLevelId: attributeRow.access_level_id,
				attributeTemplateId: attributeRow.attribute_template_id,
				description: attributeRow.description,
				listingIndex: attributeRow.listing_index,
				name: attributeRow.name,
				valueType: attributeRow.value_type,
			})),
		description: row.description,
		id: row.id,
		links: linkRows
			.filter((linkRow) => linkRow.entity_template_id === row.id)
			.map(toEntityTemplateLink),
		listingAttributeId: row.listing_attribute_id,
		name: row.name,
	}
}

function toEntityTemplates(
	rows: EntityTemplateRow[],
	attributeRows: EntityTemplateAttributeRow[],
	linkRows: EntityTemplateLinkRow[],
): EntityTemplate[] {
	return rows.map((row) => toEntityTemplate(row, attributeRows, linkRows))
}

async function readEntityTemplateRows(
	client: ReturnType<typeof createDatabase>['client'],
	id?: string,
): Promise<EntityTemplate[]> {
	const rows = id
		? await client<EntityTemplateRow[]>`
			SELECT id, name, description, listing_attribute_id
			FROM entity_templates
			WHERE id = ${id}
			ORDER BY name
		`
		: await client<EntityTemplateRow[]>`
			SELECT id, name, description, listing_attribute_id
			FROM entity_templates
			ORDER BY name
		`

	if (rows.length === 0) {
		return []
	}

	const ids = rows.map((row) => row.id)
	const attributeRows = await client<EntityTemplateAttributeRow[]>`
		SELECT id, entity_template_id, attribute_template_id, name, description, value_type, access_level_id, listing_index
		FROM entity_template_attributes
		WHERE entity_template_id = ANY(${ids})
		ORDER BY entity_template_id, listing_index
	`
	const linkRows = await client<EntityTemplateLinkRow[]>`
		SELECT id, entity_template_id, target_entity_template_id, name, description
		FROM entity_template_links
		WHERE entity_template_id = ANY(${ids})
		ORDER BY entity_template_id, name
	`

	return toEntityTemplates(rows, attributeRows, linkRows)
}

async function replaceEntityTemplateAttributes(
	sql: postgres.TransactionSql,
	entityTemplateId: string,
	attributes: EntityTemplateAttribute[],
): Promise<void> {
	await sql`
		DELETE FROM entity_template_attributes
		WHERE entity_template_id = ${entityTemplateId}
	`

	for (const attribute of attributes) {
		await sql`
			INSERT INTO entity_template_attributes (
				id,
				entity_template_id,
				attribute_template_id,
				name,
				description,
				value_type,
				access_level_id,
				listing_index
			)
			VALUES (
				${attribute.id},
				${entityTemplateId},
				${attribute.attributeTemplateId},
				${attribute.name},
				${attribute.description},
				${attribute.valueType},
				${attribute.accessLevelId},
				${attribute.listingIndex}
			)
		`
	}
}

async function replaceEntityTemplateLinks(
	sql: postgres.TransactionSql,
	entityTemplateId: string,
	links: CreateEntityTemplateLinkInput[],
): Promise<void> {
	await sql`
		DELETE FROM entity_template_links
		WHERE entity_template_id = ${entityTemplateId}
	`

	for (const link of links) {
		await sql`
			INSERT INTO entity_template_links (
				id,
				entity_template_id,
				target_entity_template_id,
				name,
				description
			)
			VALUES (
				${createUuidV7()},
				${entityTemplateId},
				${link.targetEntityTemplateId},
				${link.name.trim()},
				${normalizeNullableText(link.description)}
			)
		`
	}
}

export async function listEntityTemplates() {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)

	try {
		return await readEntityTemplateRows(client)
	} finally {
		await client.end()
	}
}

export async function createEntityTemplate(input: CreateEntityTemplateInput) {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const normalizedInput = normalizeCreateInput(input)

	if (!isListingAttributeIncluded(normalizedInput)) {
		throw new Error('Listing attribute must be included in attributes.')
	}

	const { client } = createDatabase(databaseUrl)
	const id = createUuidV7()

	try {
		await client.begin(async (sql) => {
			await sql`
				INSERT INTO entity_templates (
					id,
					name,
					description,
					listing_attribute_id
				)
				VALUES (
					${id},
					${normalizedInput.name},
					${normalizedInput.description},
					${normalizedInput.listingAttributeId}
				)
			`
			await replaceEntityTemplateAttributes(
				sql,
				id,
				normalizedInput.attributes,
			)
			await replaceEntityTemplateLinks(sql, id, normalizedInput.links ?? [])
		})

		const [createdEntityTemplate] = await readEntityTemplateRows(client, id)

		return createdEntityTemplate
	} finally {
		await client.end()
	}
}

export async function updateEntityTemplate(
	id: string,
	input: UpdateEntityTemplateInput,
) {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)

	try {
		const [existingEntityTemplate] = await readEntityTemplateRows(client, id)

		if (!existingEntityTemplate) {
			return undefined
		}

		const nextAttributes = normalizeAttributes(
			input.attributes ?? existingEntityTemplate.attributes,
		)
		const nextListingAttributeTemplateId =
			input.listingAttributeId ??
			existingEntityTemplate.listingAttributeId
		const normalizedLinks =
			input.links === undefined ? undefined : normalizeLinks(input.links)

		if (
			!isListingAttributeIncluded({
				attributes: nextAttributes,
				listingAttributeId: nextListingAttributeTemplateId,
			})
		) {
			throw new Error('Listing attribute must be included in attributes.')
		}

		await client.begin(async (sql) => {
			await sql`
				UPDATE entity_templates
				SET
					name = ${input.name?.trim() ?? existingEntityTemplate.name},
					description = ${input.description?.trim() ?? existingEntityTemplate.description},
					listing_attribute_id = ${nextListingAttributeTemplateId}
				WHERE id = ${id}
			`
			await replaceEntityTemplateAttributes(sql, id, nextAttributes)

			if (normalizedLinks !== undefined) {
				await replaceEntityTemplateLinks(sql, id, normalizedLinks)
			}
		})

		const [updatedEntityTemplate] = await readEntityTemplateRows(client, id)

		return updatedEntityTemplate
	} finally {
		await client.end()
	}
}

export async function deleteEntityTemplate(id: string) {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)

	try {
		const [entityTemplate] = await readEntityTemplateRows(client, id)

		if (!entityTemplate) {
			return undefined
		}

		await client`
			DELETE FROM entity_templates
			WHERE id = ${id}
		`

		return entityTemplate
	} finally {
		await client.end()
	}
}
