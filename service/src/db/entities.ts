import type {
	CreateEntityAttributeInput,
	CreateEntityFromScratchInput,
	CreateEntityInput,
	CreateEntityLinkInput,
	Entity,
	EntityAttribute,
	EntityLink,
	UpdateEntityInput,
	ValueType,
} from '@rebirth/shared'
import type postgres from 'postgres'

import { createDatabase, getDatabaseUrl } from './client'
import { readEntityTemplateRows } from './entity-templates'
import { createUuidV7 } from './uuid'

interface EntityRow {
	id: string
	entity_template_id: string | null
	listing_attribute_id: string
}

interface EntityAttributeRow {
	id: string
	entity_id: string
	entity_template_attribute_id: string | null
	attribute_template_id: string | null
	name: string
	description: string
	value_type: ValueType
	access_level_id: number
	listing_index: number
	value: string
}

interface EntityLinkRow {
	id: string
	entity_id: string
	entity_template_link_id: string | null
	target_entity_template_id: string | null
	target_entity_id: string | null
	name: string
	description: string | null
	listing_index: number
}

interface AttributeTemplateRequirementRow {
	id: string
	is_required: boolean
	name: string
}

export class EntityValidationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'EntityValidationError'
	}
}

function normalizeNullableText(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null
	}

	const trimmedValue = value.trim()

	return trimmedValue.length > 0 ? trimmedValue : null
}

function normalizeAttributes(
	attributes: CreateEntityAttributeInput[],
): EntityAttribute[] {
	return attributes
		.map((attribute, index) => ({
			id: attribute.id,
			accessLevelId: attribute.accessLevelId,
			attributeTemplateId: attribute.attributeTemplateId ?? null,
			description: attribute.description.trim(),
			entityTemplateAttributeId: attribute.entityTemplateAttributeId ?? null,
			listingIndex: attribute.listingIndex ?? index,
			name: attribute.name.trim(),
			value: attribute.value.trim(),
			valueType: attribute.valueType,
		}))
		.sort((left, right) => left.listingIndex - right.listingIndex)
}

function normalizeLinks(
	links: CreateEntityLinkInput[] | undefined,
): CreateEntityLinkInput[] {
	return (links ?? [])
		.map((link, index) => ({
			description: normalizeNullableText(link.description),
			entityTemplateLinkId: link.entityTemplateLinkId ?? null,
			listingIndex: link.listingIndex ?? index,
			name: link.name.trim(),
			targetEntityId: link.targetEntityId ?? null,
			targetEntityTemplateId: link.targetEntityTemplateId ?? null,
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

function toEntityLink(row: EntityLinkRow): EntityLink {
	return {
		description: row.description,
		entityId: row.entity_id,
		entityTemplateLinkId: row.entity_template_link_id,
		id: row.id,
		listingIndex: row.listing_index,
		name: row.name,
		targetEntityId: row.target_entity_id,
		targetEntityTemplateId: row.target_entity_template_id,
	}
}

function toEntity(
	row: EntityRow,
	attributeRows: EntityAttributeRow[],
	linkRows: EntityLinkRow[],
): Entity {
	return {
		attributes: attributeRows
			.filter((attributeRow) => attributeRow.entity_id === row.id)
			.sort((left, right) => left.listing_index - right.listing_index)
			.map((attributeRow) => ({
				id: attributeRow.id,
				accessLevelId: attributeRow.access_level_id,
				attributeTemplateId: attributeRow.attribute_template_id,
				description: attributeRow.description,
				entityTemplateAttributeId:
					attributeRow.entity_template_attribute_id,
				listingIndex: attributeRow.listing_index,
				name: attributeRow.name,
				value: attributeRow.value,
				valueType: attributeRow.value_type,
			})),
		entityTemplateId: row.entity_template_id,
		id: row.id,
		links: linkRows
			.filter((linkRow) => linkRow.entity_id === row.id)
			.sort((left, right) => left.listing_index - right.listing_index)
			.map(toEntityLink),
		listingAttributeId: row.listing_attribute_id,
	}
}

function getListingAttributeValue(entity: Entity): string {
	return (
		entity.attributes.find(
			(attribute) => attribute.id === entity.listingAttributeId,
		)?.value ?? ''
	)
}

function isMissingRequiredAttributeValue(attribute: EntityAttribute): boolean {
	if (attribute.valueType === 'boolean') {
		return false
	}

	return attribute.value.trim().length === 0
}

async function validateRequiredAttributes(
	client: ReturnType<typeof createDatabase>['client'],
	attributes: EntityAttribute[],
): Promise<void> {
	const attributeTemplateIds = [
		...new Set(
			attributes
				.map((attribute) => attribute.attributeTemplateId)
				.filter((attributeTemplateId): attributeTemplateId is string =>
					Boolean(attributeTemplateId),
				),
		),
	]

	if (attributeTemplateIds.length === 0) {
		return
	}

	const templateRows = await client<AttributeTemplateRequirementRow[]>`
		SELECT id, name, is_required
		FROM attribute_templates
		WHERE id = ANY(${attributeTemplateIds})
	`
	const templateById = new Map(
		templateRows.map((row) => [row.id, row]),
	)
	const missingRequiredAttributes = attributes.filter((attribute) => {
		if (!attribute.attributeTemplateId) {
			return false
		}

		const template = templateById.get(attribute.attributeTemplateId)

		return Boolean(template?.is_required) && isMissingRequiredAttributeValue(attribute)
	})

	if (missingRequiredAttributes.length === 0) {
		return
	}

	throw new EntityValidationError(
		`Required attribute values are missing: ${missingRequiredAttributes
			.map((attribute) => attribute.name)
			.join(', ')}.`,
	)
}

async function readEntityRows(
	client: ReturnType<typeof createDatabase>['client'],
	id?: string,
): Promise<Entity[]> {
	const rows = id
		? await client<EntityRow[]>`
			SELECT id, entity_template_id, listing_attribute_id
			FROM entities
			WHERE id = ${id}
		`
		: await client<EntityRow[]>`
			SELECT id, entity_template_id, listing_attribute_id
			FROM entities
		`

	if (rows.length === 0) {
		return []
	}

	const ids = rows.map((row) => row.id)
	const attributeRows = await client<EntityAttributeRow[]>`
		SELECT id, entity_id, entity_template_attribute_id, attribute_template_id, name, description, value_type, access_level_id, listing_index, value
		FROM entity_attributes
		WHERE entity_id = ANY(${ids})
		ORDER BY entity_id, listing_index
	`
	const linkRows = await client<EntityLinkRow[]>`
		SELECT id, entity_id, entity_template_link_id, target_entity_template_id, target_entity_id, name, description, listing_index
		FROM entity_links
		WHERE entity_id = ANY(${ids})
		ORDER BY entity_id, listing_index
	`

	return rows
		.map((row) => toEntity(row, attributeRows, linkRows))
		.sort((left, right) =>
			getListingAttributeValue(left).localeCompare(
				getListingAttributeValue(right),
			),
		)
}

async function insertEntityAttributes(
	sql: postgres.TransactionSql,
	entityId: string,
	attributes: EntityAttribute[],
): Promise<void> {
	for (const attribute of attributes) {
		await sql`
			INSERT INTO entity_attributes (
				id,
				entity_id,
				entity_template_attribute_id,
				attribute_template_id,
				name,
				description,
				value_type,
				access_level_id,
				listing_index,
				value
			)
			VALUES (
				${attribute.id},
				${entityId},
				${attribute.entityTemplateAttributeId},
				${attribute.attributeTemplateId},
				${attribute.name},
				${attribute.description},
				${attribute.valueType},
				${attribute.accessLevelId},
				${attribute.listingIndex},
				${attribute.value}
			)
		`
	}
}

async function insertEntityLinks(
	sql: postgres.TransactionSql,
	entityId: string,
	links: CreateEntityLinkInput[],
): Promise<void> {
	for (const link of links) {
		await sql`
			INSERT INTO entity_links (
				id,
				entity_id,
				entity_template_link_id,
				target_entity_template_id,
				target_entity_id,
				name,
				description,
				listing_index
			)
			VALUES (
				${createUuidV7()},
				${entityId},
				${link.entityTemplateLinkId ?? null},
				${link.targetEntityTemplateId ?? null},
				${link.targetEntityId ?? null},
				${link.name.trim()},
				${normalizeNullableText(link.description)},
				${link.listingIndex}
			)
		`
	}
}

async function replaceEntityAttributes(
	sql: postgres.TransactionSql,
	entityId: string,
	attributes: EntityAttribute[],
): Promise<void> {
	await sql`
		DELETE FROM entity_attributes
		WHERE entity_id = ${entityId}
	`
	await insertEntityAttributes(sql, entityId, attributes)
}

async function replaceEntityLinks(
	sql: postgres.TransactionSql,
	entityId: string,
	links: CreateEntityLinkInput[],
): Promise<void> {
	await sql`
		DELETE FROM entity_links
		WHERE entity_id = ${entityId}
	`
	await insertEntityLinks(sql, entityId, links)
}

async function buildEntityFromTemplate(
	client: ReturnType<typeof createDatabase>['client'],
	input: Extract<CreateEntityInput, { entityTemplateId: string }>,
): Promise<
	| {
			attributes: EntityAttribute[]
			entityTemplateId: string
			links: CreateEntityLinkInput[]
			listingAttributeId: string
	  }
	| undefined
> {
	const [entityTemplate] = await readEntityTemplateRows(
		client,
		input.entityTemplateId,
	)

	if (!entityTemplate) {
		return undefined
	}

	const entityTemplateAttributeIdToEntityAttributeId = new Map<string, string>()
	const attributes = input.attributes
		? input.attributes
				.map((attribute, index) => {
					const id = attribute.id

					if (attribute.entityTemplateAttributeId) {
						entityTemplateAttributeIdToEntityAttributeId.set(
							attribute.entityTemplateAttributeId,
							id,
						)
					}

					return {
						id,
						accessLevelId: attribute.accessLevelId,
						attributeTemplateId: attribute.attributeTemplateId ?? null,
						description: attribute.description,
						entityTemplateAttributeId:
							attribute.entityTemplateAttributeId ?? null,
						listingIndex: attribute.listingIndex ?? index,
						name: attribute.name,
						value: attribute.value,
						valueType: attribute.valueType,
					}
				})
				.sort((left, right) => left.listingIndex - right.listingIndex)
		: entityTemplate.attributes.map((attribute) => {
				const id = createUuidV7()
				entityTemplateAttributeIdToEntityAttributeId.set(attribute.id, id)

				return {
					id,
					accessLevelId: attribute.accessLevelId,
					attributeTemplateId: attribute.attributeTemplateId,
					description: attribute.description,
					entityTemplateAttributeId: attribute.id,
					listingIndex: attribute.listingIndex,
					name: attribute.name,
					value: '',
					valueType: attribute.valueType,
				}
			})

	const listingAttributeId =
		input.listingAttributeId ??
		entityTemplateAttributeIdToEntityAttributeId.get(
			entityTemplate.listingAttributeId,
		)

	if (!listingAttributeId) {
		throw new Error('Template listing attribute is missing.')
	}

	return {
		attributes,
		entityTemplateId: entityTemplate.id,
		links: input.links
			? input.links
			: entityTemplate.links.map((link) => ({
					description: link.description,
					entityTemplateLinkId: link.id,
					listingIndex: link.listingIndex,
					name: link.name,
					targetEntityId: null,
					targetEntityTemplateId: link.targetEntityTemplateId,
				})),
		listingAttributeId,
	}
}

export async function listEntities() {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)

	try {
		return await readEntityRows(client)
	} finally {
		await client.end()
	}
}

export async function getEntity(id: string) {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)

	try {
		const [entity] = await readEntityRows(client, id)

		return entity
	} finally {
		await client.end()
	}
}

export async function createEntity(input: CreateEntityInput) {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)
	const id = createUuidV7()

	try {
		const normalizedInput =
			'entityTemplateId' in input && input.entityTemplateId
				? await buildEntityFromTemplate(client, input)
				: (() => {
						const scratchInput = input as CreateEntityFromScratchInput

						return {
							attributes: normalizeAttributes(
								scratchInput.attributes,
							),
							entityTemplateId: null,
							links: normalizeLinks(scratchInput.links),
							listingAttributeId: scratchInput.listingAttributeId,
						}
					})()

		if (!normalizedInput) {
			return undefined
		}

		if (!isListingAttributeIncluded(normalizedInput)) {
			throw new Error('Listing attribute must be included in attributes.')
		}

		await validateRequiredAttributes(client, normalizedInput.attributes)

		await client.begin(async (sql) => {
			await sql`
				INSERT INTO entities (
					id,
					entity_template_id,
					listing_attribute_id
				)
				VALUES (
					${id},
					${normalizedInput.entityTemplateId},
					${normalizedInput.listingAttributeId}
				)
			`
			await insertEntityAttributes(sql, id, normalizedInput.attributes)
			await insertEntityLinks(sql, id, normalizedInput.links)
		})

		const [createdEntity] = await readEntityRows(client, id)

		return createdEntity
	} finally {
		await client.end()
	}
}

export async function updateEntity(id: string, input: UpdateEntityInput) {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)

	try {
		const [existingEntity] = await readEntityRows(client, id)

		if (!existingEntity) {
			return undefined
		}

		const nextAttributes = normalizeAttributes(input.attributes)
		const nextLinks = normalizeLinks(input.links)
		const nextListingAttributeId = input.listingAttributeId

		if (
			!isListingAttributeIncluded({
				attributes: nextAttributes,
				listingAttributeId: nextListingAttributeId,
			})
		) {
			throw new Error('Listing attribute must be included in attributes.')
		}

		await validateRequiredAttributes(client, nextAttributes)

		await client.begin(async (sql) => {
			await sql`
				UPDATE entities
				SET
					entity_template_id = ${input.entityTemplateId ?? existingEntity.entityTemplateId},
					listing_attribute_id = ${nextListingAttributeId}
				WHERE id = ${id}
			`
			await replaceEntityAttributes(sql, id, nextAttributes)
			await replaceEntityLinks(sql, id, nextLinks)
		})

		const [updatedEntity] = await readEntityRows(client, id)

		return updatedEntity
	} finally {
		await client.end()
	}
}

export async function deleteEntity(id: string) {
	const databaseUrl = getDatabaseUrl()

	if (!databaseUrl) {
		throw new Error('DATABASE_URL is not set.')
	}

	const { client } = createDatabase(databaseUrl)

	try {
		const [existingEntity] = await readEntityRows(client, id)

		if (!existingEntity) {
			return undefined
		}

		const referencingLinks = await client<{ id: string }[]>`
			SELECT id
			FROM entity_links
			WHERE target_entity_id = ${id}
			LIMIT 1
		`

		if (referencingLinks.length > 0) {
			throw new EntityValidationError(
				'Entity cannot be deleted while other entities link to it.',
			)
		}

		await client.begin(async (sql) => {
			await sql`
				DELETE FROM entity_links
				WHERE entity_id = ${id}
			`
			await sql`
				DELETE FROM entity_attributes
				WHERE entity_id = ${id}
			`
			await sql`
				DELETE FROM entities
				WHERE id = ${id}
			`
		})

		return existingEntity
	} finally {
		await client.end()
	}
}
