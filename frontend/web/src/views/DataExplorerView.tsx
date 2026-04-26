import {
	apiRoutes,
	PermissionName,
	ValueType,
	valueTypes,
	type AccessLevel,
	type AccessLevelsResponse,
	type AttributeTemplate,
	type AttributeTemplatesResponse,
	type CreateEntityInput,
	type EntitiesResponse,
	type Entity,
	type EntityAttribute,
	type EntityLink,
	type EntityResponse,
	type EntityTemplate,
	type EntityTemplatesResponse,
	type UpdateEntityInput,
} from '@rebirth/shared'
import {
	ArrowLeft,
	Clipboard,
	ExternalLink,
	GripVertical,
	Eye,
	EyeOff,
	Info,
	Pencil,
	Plus,
	RefreshCw,
	Save,
	Trash2,
	X,
} from 'lucide-react'
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	type SyntheticEvent,
} from 'react'
import {
	authChangedEventName,
	getStoredAuth,
	hasStoredPermission,
} from '../auth'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9908'
const entityModalHeight = 330
const entityModalMargin = 16
const entityModalMinHeight = 300
const entityModalMinWidth = 400
const entityModalWidth = 520
const entityAttributeReorderThreshold = 0.5

function clampToRange(value: number, min: number, max: number) {
	return Math.max(min, Math.min(value, max))
}

function getAuthHeaders(): Record<string, string> {
	const storedAuth = getStoredAuth()

	return storedAuth
		? {
				Authorization: `Bearer ${storedAuth.sessionKey}`,
			}
		: {}
}

async function getErrorMessageFromResponse(
	response: Response,
	fallback: string,
): Promise<string> {
	try {
		const payload = (await response.json()) as { error?: unknown }

		if (typeof payload.error === 'string' && payload.error.length > 0) {
			return payload.error
		}
	} catch {
		// Ignore invalid error payloads and use the fallback message.
	}

	return fallback
}

function getEntityListingAttribute(entity: Entity) {
	return (
		entity.attributes.find(
			(attribute) => attribute.id === entity.listingAttributeId,
		) ?? null
	)
}

function getEntityListingLabel(entity: Entity): string {
	const listingAttribute = getEntityListingAttribute(entity)

	return listingAttribute
		? `${listingAttribute.name}: ${listingAttribute.value}`
		: entity.id
}

function normalizeEntityAttributeValue(
	value: string,
	valueType: ValueType,
): string {
	if (valueType === ValueType.Number) {
		return normalizeNumberAttributeValue(value)
	}

	if (valueType === ValueType.Boolean) {
		return value === 'true' || value === 'false' ? value : 'false'
	}

	return value
}

function normalizeNumberAttributeValue(value: string): string {
	let hasDecimalSeparator = false

	return value
		.split('')
		.filter((character) => {
			if (character >= '0' && character <= '9') {
				return true
			}

			if (character === '.' && !hasDecimalSeparator) {
				hasDecimalSeparator = true
				return true
			}

			return false
		})
		.join('')
}

function isMissingRequiredEntityAttributeValue(
	value: string,
	valueType: ValueType,
): boolean {
	if (valueType === ValueType.Boolean) {
		return false
	}

	return value.trim().length === 0
}

interface EntityDetailsWindowState {
	entity: Entity | null
	entityId: string
	error: string | null
	id: string
	activeTab: 'attributes' | 'links' | 'inlinks'
	zIndex: number
	initialPosition: {
		x: number
		y: number
	}
	isLoading: boolean
}

interface EntityEditWindowState {
	entity: Entity
	activeTab: 'attributes' | 'links' | 'inlinks'
	id: string
	zIndex: number
	initialPosition: {
		x: number
		y: number
	}
}

interface CreateEntityModalProps {
	accessLevels: AccessLevel[]
	creationMode: 'template' | 'scratch'
	entity?: Entity | null
	entities: Entity[]
	entityTemplates: EntityTemplate[]
	error: string | null
	mode: 'create' | 'edit'
	initialEntityTemplateId?: string
	initialActiveTab?: 'attributes' | 'links' | 'inlinks'
	initialPosition?: {
		x: number
		y: number
	}
	isLoadingOptions: boolean
	isSaving: boolean
	zIndex?: number
	onClose: () => void
	onActivate?: () => void
	onCreate: (input: CreateEntityInput) => Promise<void>
	onBack?: (
		position: { x: number; y: number },
		activeTab: 'attributes' | 'links' | 'inlinks',
	) => void
	onUpdate: (
		id: string,
		input: UpdateEntityInput,
		position?: { x: number; y: number },
		activeTab?: 'attributes' | 'links' | 'inlinks',
	) => Promise<void>
}

interface EntityFormAttribute {
	accessLevelId: number
	attributeTemplateId: string | null
	description: string
	entityTemplateAttributeId: string | null
	id: string
	listingIndex: number
	name: string
	value: string
	valueType: ValueType
}

interface EntityFormLink {
	description: string
	entityTemplateLinkId: string | null
	id: string
	listingIndex: number
	name: string
	targetEntityId: string | null
	targetEntityTemplateId: string | null
}

function CreateEntityModal({
	accessLevels,
	creationMode,
	entity = null,
	entities,
	entityTemplates,
	error,
	mode,
	initialEntityTemplateId = '',
	initialActiveTab = 'attributes',
	initialPosition,
	isLoadingOptions,
	isSaving,
	zIndex = 1,
	onClose,
	onActivate,
	onCreate,
	onBack,
	onUpdate,
}: CreateEntityModalProps) {
	const formId = mode === 'edit' ? 'entity-edit-form' : 'entity-create-form'
	const [selectedEntityTemplateId, setSelectedEntityTemplateId] = useState(
		initialEntityTemplateId,
	)
	const [activeTab, setActiveTab] = useState<
		'attributes' | 'links' | 'inlinks'
	>(initialActiveTab)
	const [includedAttributes, setIncludedAttributes] = useState<
		EntityFormAttribute[]
	>([])
	const [includedLinks, setIncludedLinks] = useState<EntityFormLink[]>([])
	const [attributeTemplates, setAttributeTemplates] = useState<
		AttributeTemplate[]
	>([])
	const [includeAttributeSource, setIncludeAttributeSource] = useState<
		'template' | 'scratch' | null
	>(null)
	const [isIncludeAttributeOpen, setIsIncludeAttributeOpen] = useState(false)
	const [isLoadingAttributeTemplates, setIsLoadingAttributeTemplates] =
		useState(false)
	const [listingAttributeId, setListingAttributeId] = useState('')
	const [selectedAttributeTemplateId, setSelectedAttributeTemplateId] =
		useState('')
	const [isIdPopoverOpen, setIsIdPopoverOpen] = useState(false)
	const idPopoverRef = useRef<HTMLDivElement | null>(null)
	const [position, setPosition] = useState(() => ({
		x:
			initialPosition?.x ??
			Math.max(
				entityModalMargin,
				(window.innerWidth -
					Math.min(
						entityModalWidth,
						window.innerWidth - entityModalMargin * 2,
					)) /
					2,
			),
		y:
			initialPosition?.y ??
			Math.max(entityModalMargin, window.innerHeight * 0.18),
	}))
	const [size, setSize] = useState(() => ({
		height: Math.min(
			entityModalHeight,
			window.innerHeight - entityModalMargin * 2,
		),
		width: Math.min(
			entityModalWidth,
			window.innerWidth - entityModalMargin * 2,
		),
	}))
	const modalTitle = mode === 'edit' ? 'Entity :: Edit' : 'Entity :: New'
	const selectedEntityTemplate =
		entityTemplates.find(
			(entityTemplate) => entityTemplate.id === selectedEntityTemplateId,
		) ?? null
	const selectedListingAttribute =
		includedAttributes.find(
			(attribute) => attribute.id === listingAttributeId,
		) ?? null
	const attributeTemplateById = new Map(
		attributeTemplates.map((attributeTemplate) => [
			attributeTemplate.id,
			attributeTemplate,
		]),
	)
	const missingRequiredAttribute = includedAttributes.find((attribute) => {
		if (!attribute.attributeTemplateId) {
			return false
		}

		const attributeTemplate = attributeTemplateById.get(
			attribute.attributeTemplateId,
		)

		return (
			Boolean(attributeTemplate?.isRequired) &&
			isMissingRequiredEntityAttributeValue(
				attribute.value,
				attribute.valueType,
			)
		)
	})
	const missingLinkTarget = includedLinks.find(
		(link) => link.targetEntityId === null,
	)
	const missingLinkName = includedLinks.find(
		(link) => link.name.trim().length === 0,
	)
	const validationError = missingRequiredAttribute
		? `Attribute '${missingRequiredAttribute.name || ''}' is required.`
		: missingLinkName
			? 'Link name is required.'
			: missingLinkTarget
				? `Link '${missingLinkTarget.name || ''}' requires a target.`
				: null
	const orderedInlinks = entities.flatMap((sourceEntity) =>
		sourceEntity.links
			.slice()
			.sort((left, right) => left.listingIndex - right.listingIndex)
			.filter((link) => link.targetEntityId === entity?.id)
			.map((link) => ({
				link,
				sourceEntity,
			})),
	)
	const getInlinkSourceLabel = (sourceEntity: Entity): string =>
		getEntityListingLabel(sourceEntity)
	const firstListingAttributeId = includedAttributes[0]?.id ?? ''
	const isValid =
		includedAttributes.length > 0 &&
		listingAttributeId.length > 0 &&
		includedAttributes.every(
			(attribute) => attribute.name.trim().length > 0,
		) &&
		validationError === null
	const isCreateDisabled = isSaving || isLoadingOptions || !isValid

	useEffect(() => {
		if (mode !== 'edit' || !entity) {
			return
		}

		const orderedAttributes = entity.attributes
			.slice()
			.sort((left, right) => left.listingIndex - right.listingIndex)
		const orderedLinks = entity.links
			.slice()
			.sort((left, right) => left.listingIndex - right.listingIndex)

		setSelectedEntityTemplateId(entity.entityTemplateId ?? '')
		setIncludedAttributes(
			orderedAttributes.map((attribute, index) => ({
				accessLevelId: attribute.accessLevelId,
				attributeTemplateId: attribute.attributeTemplateId,
				description: attribute.description,
				entityTemplateAttributeId: attribute.entityTemplateAttributeId,
				id: attribute.id,
				listingIndex: index,
				name: attribute.name,
				value: attribute.value,
				valueType: attribute.valueType,
			})),
		)
		setIncludedLinks(
			orderedLinks.map((link, index) => ({
				description: link.description ?? '',
				entityTemplateLinkId: link.entityTemplateLinkId,
				id: link.id,
				listingIndex: index,
				name: link.name,
				targetEntityId: link.targetEntityId,
				targetEntityTemplateId: link.targetEntityTemplateId,
			})),
		)
		setListingAttributeId(entity.listingAttributeId)
		setIncludeAttributeSource(null)
		setIsIncludeAttributeOpen(false)
		setSelectedAttributeTemplateId('')
		setIsIdPopoverOpen(false)
	}, [entity, mode])

	useEffect(() => {
		setActiveTab(
			initialActiveTab === 'inlinks' ? 'attributes' : initialActiveTab,
		)
	}, [initialActiveTab])

	useEffect(() => {
		if (!isIdPopoverOpen) {
			return
		}

		function handlePointerDown(event: PointerEvent): void {
			const target = event.target

			if (
				idPopoverRef.current &&
				target instanceof Node &&
				idPopoverRef.current.contains(target)
			) {
				return
			}

			setIsIdPopoverOpen(false)
		}

		window.addEventListener('pointerdown', handlePointerDown)

		return () => {
			window.removeEventListener('pointerdown', handlePointerDown)
		}
	}, [isIdPopoverOpen])

	useEffect(() => {
		if (mode === 'edit') {
			return
		}

		if (
			initialEntityTemplateId.length > 0 &&
			initialEntityTemplateId !== selectedEntityTemplateId
		) {
			setSelectedEntityTemplateId(initialEntityTemplateId)
		} else if (
			selectedEntityTemplateId.length === 0 &&
			entityTemplates[0]
		) {
			setSelectedEntityTemplateId(entityTemplates[0].id)
		}
	}, [
		entityTemplates,
		initialEntityTemplateId,
		mode,
		selectedEntityTemplateId,
	])

	useEffect(() => {
		if (mode === 'edit') {
			return
		}

		if (creationMode === 'template') {
			if (!selectedEntityTemplate) {
				return
			}

			const entityTemplateAttributeIdToEntityAttributeId = new Map<
				string,
				string
			>()
			const attributes = selectedEntityTemplate.attributes
				.slice()
				.sort((left, right) => left.listingIndex - right.listingIndex)
				.map((attribute, index) => {
					const id = crypto.randomUUID()
					entityTemplateAttributeIdToEntityAttributeId.set(
						attribute.id,
						id,
					)

					return {
						accessLevelId: attribute.accessLevelId,
						attributeTemplateId: attribute.attributeTemplateId,
						description: attribute.description,
						entityTemplateAttributeId: attribute.id,
						id,
						listingIndex: index,
						name: attribute.name,
						value: '',
						valueType: attribute.valueType,
					}
				})

			setIncludedAttributes(attributes)
			setIncludedLinks(
				selectedEntityTemplate.links
					.slice()
					.sort(
						(left, right) => left.listingIndex - right.listingIndex,
					)
					.map((link, index) => ({
						description: link.description ?? '',
						entityTemplateLinkId: link.id,
						id: crypto.randomUUID(),
						listingIndex: index,
						name: link.name,
						targetEntityId: null,
						targetEntityTemplateId: link.targetEntityTemplateId,
					})),
			)
			setListingAttributeId(
				entityTemplateAttributeIdToEntityAttributeId.get(
					selectedEntityTemplate.listingAttributeId,
				) ??
					attributes[0]?.id ??
					'',
			)
			return
		}

		setIncludedAttributes([])
		setIncludedLinks([])
		setListingAttributeId('')
	}, [accessLevels, creationMode, mode, selectedEntityTemplate])

	useEffect(() => {
		if (mode === 'edit') {
			return
		}

		if (
			(listingAttributeId.length === 0 ||
				!includedAttributes.some(
					(attribute) => attribute.id === listingAttributeId,
				)) &&
			firstListingAttributeId.length > 0
		) {
			setListingAttributeId(firstListingAttributeId)
		}
	}, [firstListingAttributeId, includedAttributes, listingAttributeId, mode])

	const dragStart = useRef({
		pointerX: 0,
		pointerY: 0,
		x: position.x,
		y: position.y,
	})
	const resizeStart = useRef({
		height: size.height,
		pointerX: 0,
		pointerY: 0,
		width: size.width,
	})
	const [draggedAttributeId, setDraggedAttributeId] = useState<string | null>(
		null,
	)
	const draggedAttributeIdRef = useRef<string | null>(null)
	const [draggedLinkId, setDraggedLinkId] = useState<string | null>(null)
	const draggedLinkIdRef = useRef<string | null>(null)
	const attributeTemplatesLoadRequestId = useRef(0)

	const startDrag = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			const target = event.target

			if (
				target instanceof HTMLElement &&
				target.closest('[data-no-drag="true"]')
			) {
				return
			}

			event.preventDefault()
			dragStart.current = {
				pointerX: event.clientX,
				pointerY: event.clientY,
				x: position.x,
				y: position.y,
			}

			function move(pointerEvent: PointerEvent): void {
				setPosition({
					x: clampToRange(
						dragStart.current.x +
							pointerEvent.clientX -
							dragStart.current.pointerX,
						entityModalMargin - size.width + 48,
						window.innerWidth - entityModalMargin,
					),
					y: clampToRange(
						dragStart.current.y +
							pointerEvent.clientY -
							dragStart.current.pointerY,
						entityModalMargin,
						window.innerHeight - entityModalMargin,
					),
				})
			}

			function stop(): void {
				window.removeEventListener('pointermove', move)
				window.removeEventListener('pointerup', stop)
			}

			window.addEventListener('pointermove', move)
			window.addEventListener('pointerup', stop)
		},
		[position.x, position.y, size.width],
	)

	const startResize = useCallback(
		(event: ReactPointerEvent<HTMLButtonElement>) => {
			event.preventDefault()
			resizeStart.current = {
				height: size.height,
				pointerX: event.clientX,
				pointerY: event.clientY,
				width: size.width,
			}

			function move(pointerEvent: PointerEvent): void {
				setSize({
					height: clampToRange(
						resizeStart.current.height +
							pointerEvent.clientY -
							resizeStart.current.pointerY,
						entityModalMinHeight,
						window.innerHeight - position.y - entityModalMargin,
					),
					width: clampToRange(
						resizeStart.current.width +
							pointerEvent.clientX -
							resizeStart.current.pointerX,
						entityModalMinWidth,
						window.innerWidth - position.x - entityModalMargin,
					),
				})
			}

			function stop(): void {
				window.removeEventListener('pointermove', move)
				window.removeEventListener('pointerup', stop)
			}

			window.addEventListener('pointermove', move)
			window.addEventListener('pointerup', stop)
		},
		[position.x, position.y, size.height, size.width],
	)

	const loadAttributeTemplates = useCallback(async (): Promise<void> => {
		const requestId = attributeTemplatesLoadRequestId.current + 1
		attributeTemplatesLoadRequestId.current = requestId

		setIsLoadingAttributeTemplates(true)

		try {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.attributeTemplates}`,
				{
					headers: getAuthHeaders(),
				},
			)

			if (!response.ok) {
				throw new Error('Unable to load attribute templates')
			}

			const data = (await response.json()) as AttributeTemplatesResponse

			if (requestId === attributeTemplatesLoadRequestId.current) {
				setAttributeTemplates(data.data)
				setSelectedAttributeTemplateId(
					(current) => current || data.data[0]?.id || '',
				)
			}
		} catch {
			if (requestId === attributeTemplatesLoadRequestId.current) {
				setAttributeTemplates([])
				setSelectedAttributeTemplateId('')
			}
		} finally {
			if (requestId === attributeTemplatesLoadRequestId.current) {
				setIsLoadingAttributeTemplates(false)
			}
		}
	}, [])

	useEffect(() => {
		void loadAttributeTemplates()
	}, [loadAttributeTemplates])

	async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()

		if (isCreateDisabled) {
			return
		}

		if (mode === 'edit') {
			if (!entity) {
				return
			}

			await onUpdate(
				entity.id,
				{
					attributes: includedAttributes.map((attribute, index) => ({
						accessLevelId: attribute.accessLevelId,
						attributeTemplateId: attribute.attributeTemplateId,
						description: attribute.description.trim(),
						entityTemplateAttributeId:
							attribute.entityTemplateAttributeId,
						id: attribute.id,
						listingIndex: index,
						name: attribute.name.trim(),
						value: normalizeEntityAttributeValue(
							attribute.value,
							attribute.valueType,
						),
						valueType: attribute.valueType,
					})),
					entityTemplateId: entity.entityTemplateId,
					listingAttributeId,
					links: includedLinks.map((link, index) => ({
						description: link.description.trim(),
						entityTemplateLinkId: link.entityTemplateLinkId,
						listingIndex: index,
						name: link.name.trim(),
						targetEntityId: link.targetEntityId,
						targetEntityTemplateId: link.targetEntityTemplateId,
					})),
				},
				position,
				activeTab,
			)
			return
		}

		if (creationMode === 'template') {
			if (!selectedEntityTemplate) {
				return
			}

			await onCreate({
				attributes: includedAttributes.map((attribute, index) => ({
					accessLevelId: attribute.accessLevelId,
					attributeTemplateId: attribute.attributeTemplateId,
					description: attribute.description.trim(),
					entityTemplateAttributeId:
						attribute.entityTemplateAttributeId,
					id: attribute.id,
					listingIndex: index,
					name: attribute.name.trim(),
					value: normalizeEntityAttributeValue(
						attribute.value,
						attribute.valueType,
					),
					valueType: attribute.valueType,
				})),
				links: includedLinks.map((link, index) => ({
					description: link.description.trim(),
					entityTemplateLinkId: link.entityTemplateLinkId,
					id: link.id,
					listingIndex: index,
					name: link.name.trim(),
					targetEntityId: link.targetEntityId,
					targetEntityTemplateId: link.targetEntityTemplateId,
				})),
				entityTemplateId: selectedEntityTemplate.id,
				listingAttributeId,
			})
			return
		}

		await onCreate({
			attributes: includedAttributes.map((attribute, index) => ({
				accessLevelId: attribute.accessLevelId,
				attributeTemplateId: attribute.attributeTemplateId,
				description: attribute.description.trim(),
				entityTemplateAttributeId: attribute.entityTemplateAttributeId,
				id: attribute.id,
				listingIndex: index,
				name: attribute.name.trim(),
				value: normalizeEntityAttributeValue(
					attribute.value,
					attribute.valueType,
				),
				valueType: attribute.valueType,
			})),
			entityTemplateId: null,
			listingAttributeId,
			links: includedLinks.map((link, index) => ({
				description: link.description.trim(),
				entityTemplateLinkId: link.entityTemplateLinkId,
				listingIndex: index,
				name: link.name.trim(),
				targetEntityId: link.targetEntityId,
				targetEntityTemplateId: link.targetEntityTemplateId,
			})),
		})
	}

	function addAttribute(): void {
		const id = crypto.randomUUID()

		setIncludedAttributes((current) => [
			...current,
			{
				accessLevelId: accessLevels[0]?.id ?? 1,
				attributeTemplateId: null,
				description: '',
				entityTemplateAttributeId: null,
				id,
				listingIndex: current.length,
				name: '',
				value: '',
				valueType: ValueType.Text,
			},
		])

		if (listingAttributeId.length === 0) {
			setListingAttributeId(id)
		}
	}

	function includeAttributeFromTemplate(): void {
		const attributeTemplate = attributeTemplates.find(
			(candidate) => candidate.id === selectedAttributeTemplateId,
		)

		if (!attributeTemplate) {
			return
		}

		const id = crypto.randomUUID()

		setIncludedAttributes((current) => [
			...current,
			{
				accessLevelId: attributeTemplate.accessLevelId,
				attributeTemplateId: attributeTemplate.id,
				description: attributeTemplate.description,
				entityTemplateAttributeId: null,
				id,
				listingIndex: current.length,
				name: attributeTemplate.name,
				value: attributeTemplate.defaultValue ?? '',
				valueType: attributeTemplate.valueType,
			},
		])

		if (listingAttributeId.length === 0) {
			setListingAttributeId(id)
		}

		setIsIncludeAttributeOpen(false)
	}

	function selectIncludeAttributeSource(
		source: 'template' | 'scratch',
	): void {
		setIncludeAttributeSource(source)

		if (source === 'template') {
			void loadAttributeTemplates()
		}
	}

	function removeAttribute(attributeId: string): void {
		setIncludedAttributes((current) =>
			current
				.filter((attribute) => attribute.id !== attributeId)
				.map((attribute, index) => ({
					...attribute,
					listingIndex: index,
				})),
		)
	}

	function addLink(): void {
		setIncludedLinks((current) => [
			...current,
			{
				description: '',
				entityTemplateLinkId: null,
				id: crypto.randomUUID(),
				listingIndex: current.length,
				name: '',
				targetEntityId: null,
				targetEntityTemplateId: null,
			},
		])
	}

	function updateLink(linkId: string, update: Partial<EntityFormLink>): void {
		setIncludedLinks((current) =>
			current.map((link) =>
				link.id === linkId ? { ...link, ...update } : link,
			),
		)
	}

	function getLinkTargetEntities(link: EntityFormLink): Entity[] {
		if (creationMode !== 'template' || !link.entityTemplateLinkId) {
			return entities
		}

		if (!link.targetEntityTemplateId) {
			return entities
		}

		return entities.filter(
			(candidate) =>
				candidate.entityTemplateId === link.targetEntityTemplateId,
		)
	}

	function removeLink(linkId: string): void {
		setIncludedLinks((current) =>
			current
				.filter((link) => link.id !== linkId)
				.map((link, index) => ({
					...link,
					listingIndex: index,
				})),
		)
	}

	function updateAttribute(
		attributeId: string,
		update: Partial<EntityFormAttribute>,
	): void {
		setIncludedAttributes((current) =>
			current.map((attribute) =>
				attribute.id === attributeId
					? { ...attribute, ...update }
					: attribute,
			),
		)
	}

	function reorderAttribute(
		draggedAttributeId: string,
		targetAttributeId: string,
	): void {
		if (draggedAttributeId === targetAttributeId) {
			return
		}

		setIncludedAttributes((current) => {
			const draggedIndex = current.findIndex(
				(attribute) => attribute.id === draggedAttributeId,
			)
			const targetIndex = current.findIndex(
				(attribute) => attribute.id === targetAttributeId,
			)

			if (draggedIndex < 0 || targetIndex < 0) {
				return current
			}

			const next = current.slice()
			const [draggedAttribute] = next.splice(draggedIndex, 1)
			if (!draggedAttribute) {
				return current
			}

			next.splice(targetIndex, 0, draggedAttribute)

			return next.map((attribute, index) => ({
				...attribute,
				listingIndex: index,
			}))
		})
	}

	function reorderLink(draggedLinkId: string, targetLinkId: string): void {
		if (draggedLinkId === targetLinkId) {
			return
		}

		setIncludedLinks((current) => {
			const draggedIndex = current.findIndex(
				(link) => link.id === draggedLinkId,
			)
			const targetIndex = current.findIndex(
				(link) => link.id === targetLinkId,
			)

			if (draggedIndex < 0 || targetIndex < 0) {
				return current
			}

			const next = current.slice()
			const [draggedLink] = next.splice(draggedIndex, 1)
			if (!draggedLink) {
				return current
			}

			next.splice(targetIndex, 0, draggedLink)

			return next.map((link, index) => ({
				...link,
				listingIndex: index,
			}))
		})
	}

	function setActiveDraggedAttribute(attributeId: string | null): void {
		draggedAttributeIdRef.current = attributeId
		setDraggedAttributeId(attributeId)
	}

	function setActiveDraggedLink(linkId: string | null): void {
		draggedLinkIdRef.current = linkId
		setDraggedLinkId(linkId)
	}

	function getAttributeRowLayoutBounds(row: HTMLTableRowElement): {
		height: number
		top: number
	} {
		const tableTop = row.closest('table')?.getBoundingClientRect().top ?? 0

		return {
			height: row.offsetHeight,
			top: tableTop + row.offsetTop,
		}
	}

	function startAttributePointerDrag(
		event: ReactPointerEvent<HTMLButtonElement>,
		attributeId: string,
	): void {
		event.preventDefault()
		event.stopPropagation()

		const formElement = event.currentTarget.closest('form')
		if (!formElement) {
			return
		}
		const form = formElement as HTMLFormElement

		const handle = event.currentTarget
		const pointerId = event.pointerId

		setActiveDraggedAttribute(attributeId)

		try {
			handle.setPointerCapture(pointerId)
		} catch {
			// Ignore browsers that do not support pointer capture here.
		}

		function move(pointerEvent: PointerEvent): void {
			const rows = Array.from(
				form.querySelectorAll<HTMLTableRowElement>(
					'[data-entity-attribute-id]',
				),
			)
			const draggedId = draggedAttributeIdRef.current
			const draggedIndex = rows.findIndex(
				(row) => row.dataset.entityAttributeId === draggedId,
			)

			if (!draggedId || draggedIndex < 0) {
				return
			}

			const previousRow = rows[draggedIndex - 1]
			const nextRow = rows[draggedIndex + 1]

			if (previousRow) {
				const previousRect = getAttributeRowLayoutBounds(previousRow)
				const previousTriggerY =
					previousRect.top +
					previousRect.height * (1 - entityAttributeReorderThreshold)

				if (pointerEvent.clientY < previousTriggerY) {
					const previousAttributeId =
						previousRow.dataset.entityAttributeId

					if (previousAttributeId) {
						reorderAttribute(draggedId, previousAttributeId)
					}

					return
				}
			}

			if (nextRow) {
				const nextRect = getAttributeRowLayoutBounds(nextRow)
				const nextTriggerY =
					nextRect.top +
					nextRect.height * entityAttributeReorderThreshold

				if (pointerEvent.clientY > nextTriggerY) {
					const nextAttributeId = nextRow.dataset.entityAttributeId

					if (nextAttributeId) {
						reorderAttribute(draggedId, nextAttributeId)
					}
				}
			}
		}

		function stop(): void {
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointerup', stop)
			window.removeEventListener('pointercancel', stop)
			try {
				handle.releasePointerCapture(pointerId)
			} catch {
				// Ignore browsers that do not support pointer capture here.
			}
			setActiveDraggedAttribute(null)
		}

		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', stop)
		window.addEventListener('pointercancel', stop)
	}

	function startLinkPointerDrag(
		event: ReactPointerEvent<HTMLButtonElement>,
		linkId: string,
	): void {
		event.preventDefault()
		event.stopPropagation()

		const formElement = event.currentTarget.closest('form')
		if (!formElement) {
			return
		}
		const form = formElement as HTMLFormElement

		const handle = event.currentTarget
		const pointerId = event.pointerId

		setActiveDraggedLink(linkId)

		try {
			handle.setPointerCapture(pointerId)
		} catch {
			// Ignore browsers that do not support pointer capture here.
		}

		function move(pointerEvent: PointerEvent): void {
			const rows = Array.from(
				form.querySelectorAll<HTMLTableRowElement>(
					'[data-entity-link-id]',
				),
			)
			const draggedId = draggedLinkIdRef.current
			const draggedIndex = rows.findIndex(
				(row) => row.dataset.entityLinkId === draggedId,
			)

			if (!draggedId || draggedIndex < 0) {
				return
			}

			const previousRow = rows[draggedIndex - 1]
			const nextRow = rows[draggedIndex + 1]

			if (previousRow) {
				const previousRect = getAttributeRowLayoutBounds(previousRow)
				const previousTriggerY =
					previousRect.top +
					previousRect.height * (1 - entityAttributeReorderThreshold)

				if (pointerEvent.clientY < previousTriggerY) {
					const previousLinkId = previousRow.dataset.entityLinkId

					if (previousLinkId) {
						reorderLink(draggedId, previousLinkId)
					}

					return
				}
			}

			if (nextRow) {
				const nextRect = getAttributeRowLayoutBounds(nextRow)
				const nextTriggerY =
					nextRect.top +
					nextRect.height * entityAttributeReorderThreshold

				if (pointerEvent.clientY > nextTriggerY) {
					const nextLinkId = nextRow.dataset.entityLinkId

					if (nextLinkId) {
						reorderLink(draggedId, nextLinkId)
					}
				}
			}
		}

		function stop(): void {
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointerup', stop)
			window.removeEventListener('pointercancel', stop)
			try {
				handle.releasePointerCapture(pointerId)
			} catch {
				// Ignore browsers that do not support pointer capture here.
			}
			setActiveDraggedLink(null)
		}

		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', stop)
		window.addEventListener('pointercancel', stop)
	}

	return (
		<div className="draggable-modal-layer" style={{ zIndex }}>
			<div
				aria-label={modalTitle}
				aria-modal="false"
				className="draggable-modal"
				role="dialog"
				onPointerDown={() => onActivate?.()}
				style={{
					height: size.height,
					transform: `translate(${position.x}px, ${position.y}px)`,
					width: size.width,
				}}
			>
				<div className="draggable-modal-body">
					<div
						className="draggable-modal-header"
						onPointerDown={startDrag}
					>
						<h2>{modalTitle}</h2>
						{mode === 'edit' && entity ? (
							<div
								className="draggable-modal-info-action"
								ref={idPopoverRef}
							>
								<button
									aria-expanded={isIdPopoverOpen}
									aria-label="Entity id"
									className="draggable-modal-titlebar-button draggable-modal-info-button"
									data-no-drag="true"
									data-tooltip="Info"
									type="button"
									onPointerDown={(event) =>
										event.stopPropagation()
									}
									onClick={() =>
										setIsIdPopoverOpen(
											(current) => !current,
										)
									}
								>
									<Info aria-hidden="true" />
								</button>
								{isIdPopoverOpen ? (
									<div
										className="include-attribute-popover entity-id-popover"
										data-no-drag="true"
										onPointerDown={(event) =>
											event.stopPropagation()
										}
									>
										<p
											className="entity-id-popover-title"
											data-selectable="true"
										>
											id: {entity.id}
										</p>
									</div>
								) : null}
							</div>
						) : null}
						{mode === 'edit' ? (
							<button
								aria-label="Back to view"
								className="draggable-modal-titlebar-button"
								data-no-drag="true"
								data-tooltip="Back to view"
								type="button"
								onPointerDown={(event) =>
									event.stopPropagation()
								}
								onClick={() => onBack?.(position, activeTab)}
							>
								<ArrowLeft aria-hidden="true" />
							</button>
						) : null}
						<button
							aria-label={`Save ${modalTitle}`}
							className="draggable-modal-titlebar-button"
							data-no-drag="true"
							data-tooltip="Save"
							disabled={isCreateDisabled}
							form={formId}
							type="submit"
							onPointerDown={(event) => event.stopPropagation()}
						>
							<Save aria-hidden="true" />
						</button>
						<button
							aria-label={`Close ${modalTitle}`}
							className="draggable-modal-titlebar-button draggable-modal-close"
							data-no-drag="true"
							data-tooltip="Close"
							type="button"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={onClose}
						>
							<X aria-hidden="true" />
						</button>
					</div>
					<div
						className="draggable-modal-content"
						onPointerDown={startDrag}
					>
						<form
							id={formId}
							className="entity-template-edit-form"
							onSubmit={handleSubmit}
						>
							<div className="entity-view-summary entity-create-summary">
								<table className="data-table entity-create-summary-table">
									<thead>
										<tr>
											<th>listing attribute name</th>
											<th>value</th>
										</tr>
									</thead>
									<tbody>
										<tr>
											<td>
												<span
													className="attribute-template-select-wrap entity-create-summary-select-wrap"
													data-no-drag="true"
												>
													<select
														disabled={
															includedAttributes.length ===
															0
														}
														value={
															listingAttributeId
														}
														onChange={(event) =>
															setListingAttributeId(
																event.target
																	.value,
															)
														}
													>
														{includedAttributes.map(
															(attribute) => (
																<option
																	key={
																		attribute.id
																	}
																	value={
																		attribute.id
																	}
																>
																	{attribute.name ||
																		''}
																</option>
															),
														)}
													</select>
												</span>
											</td>
											<td>
												<span className="entity-create-summary-value">
													{selectedListingAttribute?.value ??
														''}
												</span>
											</td>
										</tr>
									</tbody>
								</table>
							</div>

							<div
								className="entity-template-tabs"
								data-selectable="true"
							>
								<div className="entity-template-tab-row">
									<div
										className="entity-template-tab-list"
										role="tablist"
										aria-label="Entity sections"
									>
										<button
											aria-selected={
												activeTab === 'attributes'
											}
											className="entity-template-tab"
											role="tab"
											type="button"
											onClick={() =>
												setActiveTab('attributes')
											}
										>
											<span>Attributes</span>
											<span className="entity-template-tab-badge">
												{includedAttributes.length}
											</span>
										</button>
										<button
											aria-selected={
												activeTab === 'links'
											}
											className="entity-template-tab"
											data-tooltip="Outbound Links"
											role="tab"
											type="button"
											onClick={() =>
												setActiveTab('links')
											}
										>
											<span>Outlinks</span>
											<span className="entity-template-tab-badge">
												{includedLinks.length}
											</span>
										</button>
									</div>
								</div>

								{activeTab === 'attributes' ? (
									<div role="tabpanel">
										<table className="data-table entity-template-modal-table entity-template-attributes-table entity-attributes-table">
											<colgroup>
												<col className="entity-attribute-name-column" />
												<col className="entity-attribute-value-column" />
												<col className="entity-attribute-value-type-column" />
												<col className="entity-attribute-access-level-column" />
												<col className="entity-attribute-action-column" />
											</colgroup>
											<thead>
												<tr>
													<th>name</th>
													<th>value</th>
													<th>value type</th>
													<th>access level</th>
													<th className="data-table-action-heading">
														<span className="include-attribute-action entity-attribute-header-action">
															<button
																aria-label="Add attribute"
																className="section-action-button"
																data-tooltip="Include an attribute"
																type="button"
																onClick={() =>
																	setIsIncludeAttributeOpen(
																		(
																			current,
																		) =>
																			!current,
																	)
																}
															>
																<Plus aria-hidden="true" />
															</button>
															{isIncludeAttributeOpen ? (
																<div
																	className="include-attribute-popover entity-include-attribute-popover"
																	data-no-drag="true"
																>
																	<button
																		aria-label="Close include attribute popup"
																		className="icon-only-button include-attribute-close-button"
																		type="button"
																		onClick={() =>
																			setIsIncludeAttributeOpen(
																				false,
																			)
																		}
																	>
																		<X aria-hidden="true" />
																	</button>
																	<p className="entity-create-popover-title">
																		Include
																		attribute
																		from:
																	</p>
																	<div className="entity-create-radio-group">
																		<label>
																			<input
																				checked={
																					includeAttributeSource ===
																					'template'
																				}
																				name="entity-include-attribute-source"
																				type="radio"
																				onChange={() =>
																					selectIncludeAttributeSource(
																						'template',
																					)
																				}
																			/>
																			<span>
																				Attribute
																				template
																			</span>
																		</label>
																		<label>
																			<input
																				checked={
																					includeAttributeSource ===
																					'scratch'
																				}
																				name="entity-include-attribute-source"
																				type="radio"
																				onChange={() =>
																					selectIncludeAttributeSource(
																						'scratch',
																					)
																				}
																			/>
																			<span>
																				Scratch
																			</span>
																		</label>
																	</div>
																	{includeAttributeSource ===
																	'template' ? (
																		<div className="entity-create-popover-fields">
																			<label>
																				<span>
																					attribute
																					template
																				</span>
																				<span className="attribute-template-select-wrap">
																					<select
																						disabled={
																							isLoadingAttributeTemplates ||
																							attributeTemplates.length ===
																								0
																						}
																						value={
																							selectedAttributeTemplateId
																						}
																						onChange={(
																							event,
																						) =>
																							setSelectedAttributeTemplateId(
																								event
																									.target
																									.value,
																							)
																						}
																					>
																						{attributeTemplates.map(
																							(
																								attributeTemplate,
																							) => (
																								<option
																									key={
																										attributeTemplate.id
																									}
																									value={
																										attributeTemplate.id
																									}
																								>
																									{
																										attributeTemplate.name
																									}
																								</option>
																							),
																						)}
																					</select>
																				</span>
																			</label>
																			<button
																				aria-label="Include"
																				className="icon-only-button include-attribute-submit-button"
																				data-tooltip="Include"
																				disabled={
																					selectedAttributeTemplateId.length ===
																					0
																				}
																				type="button"
																				onClick={
																					includeAttributeFromTemplate
																				}
																			>
																				<Plus aria-hidden="true" />
																			</button>
																		</div>
																	) : includeAttributeSource ===
																	  'scratch' ? (
																		<button
																			aria-label="Include"
																			className="icon-only-button include-attribute-submit-button entity-create-popover-continue"
																			data-tooltip="Include"
																			type="button"
																			onClick={() => {
																				addAttribute()
																				setIsIncludeAttributeOpen(
																					false,
																				)
																			}}
																		>
																			<Plus aria-hidden="true" />
																		</button>
																	) : null}
																</div>
															) : null}
														</span>
													</th>
												</tr>
											</thead>
											<tbody>
												{includedAttributes.map(
													(attribute) => (
														<tr
															key={attribute.id}
															data-dragging={
																draggedAttributeId ===
																	attribute.id ||
																undefined
															}
															data-entity-attribute-id={
																attribute.id
															}
														>
															<td>
																<input
																	aria-label="Attribute name"
																	className="entity-template-attribute-name-input"
																	data-no-drag="true"
																	type="text"
																	value={
																		attribute.name
																	}
																	onChange={(
																		event,
																	) =>
																		updateAttribute(
																			attribute.id,
																			{
																				name: event
																					.target
																					.value,
																			},
																		)
																	}
																/>
															</td>
															<td>
																{attribute.valueType ===
																ValueType.Number ? (
																	<input
																		aria-label={`${attribute.name || 'Attribute'} value`}
																		className="entity-template-attribute-name-input"
																		data-no-drag="true"
																		inputMode="decimal"
																		pattern="[0-9.]*"
																		type="text"
																		value={
																			attribute.value
																		}
																		onChange={(
																			event,
																		) =>
																			updateAttribute(
																				attribute.id,
																				{
																					value: normalizeNumberAttributeValue(
																						event
																							.target
																							.value,
																					),
																				},
																			)
																		}
																	/>
																) : attribute.valueType ===
																  ValueType.Boolean ? (
																	<span className="attribute-template-select-wrap entity-template-boolean-value-wrap">
																		<select
																			aria-label={`${attribute.name || 'Attribute'} value`}
																			className="entity-template-attribute-name-input"
																			data-no-drag="true"
																			value={
																				attribute.value ===
																				'true'
																					? 'true'
																					: 'false'
																			}
																			onChange={(
																				event,
																			) =>
																				updateAttribute(
																					attribute.id,
																					{
																						value: event
																							.target
																							.value,
																					},
																				)
																			}
																		>
																			<option value="false">
																				false
																			</option>
																			<option value="true">
																				true
																			</option>
																		</select>
																	</span>
																) : (
																	<input
																		aria-label={`${attribute.name || 'Attribute'} value`}
																		className="entity-template-attribute-name-input"
																		data-no-drag="true"
																		type="text"
																		value={
																			attribute.value
																		}
																		onChange={(
																			event,
																		) =>
																			updateAttribute(
																				attribute.id,
																				{
																					value: event
																						.target
																						.value,
																				},
																			)
																		}
																	/>
																)}
															</td>
															<td>
																<span className="attribute-template-select-wrap entity-template-value-type-wrap">
																	<select
																		aria-label={`${attribute.name || 'Attribute'} value type`}
																		data-no-drag="true"
																		value={
																			attribute.valueType
																		}
																		onChange={(
																			event,
																		) => {
																			const valueType =
																				event
																					.target
																					.value as ValueType

																			updateAttribute(
																				attribute.id,
																				{
																					valueType,
																					value: normalizeEntityAttributeValue(
																						attribute.value,
																						valueType,
																					),
																				},
																			)
																		}}
																	>
																		{valueTypes.map(
																			(
																				valueType,
																			) => (
																				<option
																					key={
																						valueType
																					}
																					value={
																						valueType
																					}
																				>
																					{
																						valueType
																					}
																				</option>
																			),
																		)}
																	</select>
																</span>
															</td>
															<td>
																<span className="attribute-template-select-wrap entity-template-access-level-wrap">
																	<select
																		aria-label={`${attribute.name || 'Attribute'} access level`}
																		data-no-drag="true"
																		value={
																			attribute.accessLevelId
																		}
																		onChange={(
																			event,
																		) =>
																			updateAttribute(
																				attribute.id,
																				{
																					accessLevelId:
																						Number(
																							event
																								.target
																								.value,
																						),
																				},
																			)
																		}
																	>
																		{accessLevels.length ===
																		0 ? (
																			<option
																				value={
																					attribute.accessLevelId
																				}
																			>
																				{
																					attribute.accessLevelId
																				}
																			</option>
																		) : (
																			accessLevels.map(
																				(
																					accessLevel,
																				) => (
																					<option
																						key={
																							accessLevel.id
																						}
																						value={
																							accessLevel.id
																						}
																					>
																						{
																							accessLevel.name
																						}
																					</option>
																				),
																			)
																		)}
																	</select>
																</span>
															</td>
															<td className="entity-template-attribute-actions">
																<button
																	aria-label={`Remove ${attribute.name || 'attribute'}`}
																	className="icon-only-button"
																	data-no-drag="true"
																	data-tooltip="Exclude"
																	disabled={
																		includedAttributes.length ===
																		1
																	}
																	type="button"
																	onClick={() =>
																		removeAttribute(
																			attribute.id,
																		)
																	}
																>
																	<Trash2 aria-hidden="true" />
																</button>
																<button
																	aria-label={`Drag ${attribute.name || 'attribute'}`}
																	className="icon-only-button entity-template-drag-handle"
																	data-no-drag="true"
																	data-tooltip={
																		'Drag up or down\nto reorder'
																	}
																	type="button"
																	onPointerDown={(
																		event,
																	) =>
																		startAttributePointerDrag(
																			event,
																			attribute.id,
																		)
																	}
																>
																	<GripVertical aria-hidden="true" />
																</button>
															</td>
														</tr>
													),
												)}
											</tbody>
										</table>
									</div>
								) : activeTab === 'links' ? (
									<div role="tabpanel">
										<table className="data-table entity-template-modal-table entity-template-links-table entity-entity-links-table">
											<colgroup>
												<col className="entity-template-link-name-column" />
												<col className="entity-template-link-description-column" />
												<col className="entity-template-link-target-column" />
												<col className="entity-template-link-action-column" />
											</colgroup>
											<thead>
												<tr>
													<th>name</th>
													<th>description</th>
													<th>target</th>
													<th className="data-table-action-heading">
														<button
															aria-label="Include link"
															className="section-action-button"
															data-tooltip="Include link"
															disabled={
																entities.length ===
																0
															}
															type="button"
															onClick={addLink}
														>
															<Plus aria-hidden="true" />
														</button>
													</th>
												</tr>
											</thead>
											<tbody>
												{includedLinks.length === 0 ? (
													<tr>
														<td
															className="data-table-empty-cell"
															colSpan={4}
														>
															<span>
																There are no
																entries
															</span>
														</td>
													</tr>
												) : (
													includedLinks.map(
														(link) => (
															<tr
																key={link.id}
																data-dragging={
																	draggedLinkId ===
																		link.id ||
																	undefined
																}
																data-entity-link-id={
																	link.id
																}
															>
																<td>
																	<input
																		aria-label="Link name"
																		className="entity-template-link-input"
																		data-no-drag="true"
																		disabled={
																			mode !==
																				'edit' &&
																			creationMode ===
																				'template' &&
																			link.entityTemplateLinkId !==
																				null
																		}
																		type="text"
																		value={
																			link.name
																		}
																		onChange={(
																			event,
																		) =>
																			updateLink(
																				link.id,
																				{
																					name: event
																						.target
																						.value,
																				},
																			)
																		}
																	/>
																</td>
																<td>
																	<span
																		className="entity-template-link-description-value entity-template-link-description-edit-value"
																		data-tooltip={
																			link
																				.description
																				.length >
																			0
																				? link.description
																				: undefined
																		}
																	>
																		<input
																			aria-label="Link description"
																			className="entity-template-link-input"
																			data-no-drag="true"
																			disabled={
																				mode !==
																					'edit' &&
																				creationMode ===
																					'template' &&
																				link.entityTemplateLinkId !==
																					null
																			}
																			type="text"
																			value={
																				link.description
																			}
																			onChange={(
																				event,
																			) =>
																				updateLink(
																					link.id,
																					{
																						description:
																							event
																								.target
																								.value,
																					},
																				)
																			}
																		/>
																	</span>
																</td>
																<td>
																	<span
																		className="attribute-template-select-wrap entity-template-link-target-wrap"
																		data-tooltip={
																			getLinkTargetEntities(
																				link,
																			).find(
																				(
																					target,
																				) =>
																					target.id ===
																					link.targetEntityId,
																			)
																				? getEntityListingLabel(
																						getLinkTargetEntities(
																							link,
																						).find(
																							(
																								target,
																							) =>
																								target.id ===
																								link.targetEntityId,
																						) as Entity,
																					)
																				: undefined
																		}
																	>
																		<select
																			aria-label={`${link.name || 'Link'} target entity`}
																			data-no-drag="true"
																			disabled={
																				entities.length ===
																				0
																			}
																			value={
																				link.targetEntityId ??
																				''
																			}
																			onChange={(
																				event,
																			) => {
																				const targetEntity =
																					getLinkTargetEntities(
																						link,
																					).find(
																						(
																							target,
																						) =>
																							target.id ===
																							event
																								.target
																								.value,
																					)

																				updateLink(
																					link.id,
																					{
																						targetEntityId:
																							event
																								.target
																								.value ||
																							null,
																						targetEntityTemplateId:
																							targetEntity?.entityTemplateId ??
																							null,
																					},
																				)
																			}}
																		>
																			<option value="">
																				Select
																				an
																				entity
																			</option>
																			{getLinkTargetEntities(
																				link,
																			).map(
																				(
																					target,
																				) => (
																					<option
																						key={
																							target.id
																						}
																						value={
																							target.id
																						}
																					>
																						{getEntityListingLabel(
																							target,
																						)}
																					</option>
																				),
																			)}
																		</select>
																	</span>
																</td>
																<td className="entity-template-link-actions">
																	<button
																		aria-label={`Remove ${link.name || 'link'}`}
																		className="icon-only-button"
																		data-no-drag="true"
																		data-tooltip="Exclude"
																		type="button"
																		onClick={() =>
																			removeLink(
																				link.id,
																			)
																		}
																	>
																		<Trash2 aria-hidden="true" />
																	</button>
																	<button
																		aria-label={`Drag ${link.name || 'link'}`}
																		className="icon-only-button entity-template-drag-handle"
																		data-no-drag="true"
																		data-tooltip={
																			'Drag up or down\nto reorder'
																		}
																		type="button"
																		onPointerDown={(
																			event,
																		) =>
																			startLinkPointerDrag(
																				event,
																				link.id,
																			)
																		}
																	>
																		<GripVertical aria-hidden="true" />
																	</button>
																</td>
															</tr>
														),
													)
												)}
											</tbody>
										</table>
									</div>
								) : (
									<div role="tabpanel">
										<table className="data-table entity-template-modal-table entity-template-view-inlinks-table">
											<colgroup>
												<col className="entity-template-inlink-source-column" />
												<col className="entity-template-inlink-name-column" />
												<col className="entity-template-inlink-description-column" />
											</colgroup>
											<thead>
												<tr>
													<th>source</th>
													<th>name</th>
													<th>description</th>
												</tr>
											</thead>
											<tbody>
												{orderedInlinks.length === 0 ? (
													<tr>
														<td
															className="data-table-empty-cell"
															colSpan={3}
														>
															<span>
																There are no
																entries
															</span>
														</td>
													</tr>
												) : (
													orderedInlinks.map(
														({
															link,
															sourceEntity,
														}) => (
															<tr key={link.id}>
																<td>
																	{getInlinkSourceLabel(
																		sourceEntity,
																	)}
																</td>
																<td>
																	{link.name}
																</td>
																<td>
																	<span
																		className="entity-template-link-description-value entity-template-link-description-view-value"
																		data-tooltip={
																			link.description ||
																			undefined
																		}
																	>
																		<span>
																			{link.description ??
																				''}
																		</span>
																	</span>
																</td>
															</tr>
														),
													)
												)}
											</tbody>
										</table>
									</div>
								)}
							</div>

							{validationError || error ? (
								<p className="entity-create-error">
									{validationError ?? error}
								</p>
							) : null}
						</form>
					</div>
					<button
						aria-label={`Resize ${modalTitle}`}
						className="draggable-modal-resize"
						data-no-drag="true"
						type="button"
						onPointerDown={startResize}
					>
						<span />
						<span />
						<span />
						<span />
						<span />
						<span />
					</button>
				</div>
			</div>
		</div>
	)
}

interface EntityDetailsModalProps {
	accessLevels: AccessLevel[]
	entity: Entity | null
	entities: Entity[]
	entityTemplates: EntityTemplate[]
	error: string | null
	isLoading: boolean
	initialPosition?: {
		x: number
		y: number
	}
	initialActiveTab?: 'attributes' | 'links' | 'inlinks'
	windowId: string
	zIndex?: number
	canEdit?: boolean
	onDelete: (entity: Entity) => void
	onOpenEntity: (
		entityId: string,
		pointerPosition?: { x: number; y: number },
	) => void
	onEdit: (
		entity: Entity,
		position: { x: number; y: number },
		windowId: string,
		activeTab: 'attributes' | 'links' | 'inlinks',
	) => void
	onActivate: (windowId: string) => void
	onClose: () => void
}

function EntityDetailsModal({
	accessLevels,
	entity,
	entities,
	entityTemplates,
	error,
	isLoading,
	initialActiveTab = 'attributes',
	initialPosition,
	windowId,
	zIndex = 1,
	canEdit = true,
	onDelete,
	onEdit,
	onActivate,
	onClose,
	onOpenEntity,
}: EntityDetailsModalProps) {
	const modalTitle = 'Entity'
	const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
	const [activeTab, setActiveTab] = useState<
		'attributes' | 'links' | 'inlinks'
	>(initialActiveTab)
	const [revealedAttributeIds, setRevealedAttributeIds] = useState<
		Set<string>
	>(() => new Set())
	const [position, setPosition] = useState(() => ({
		x:
			initialPosition?.x ??
			Math.max(
				entityModalMargin,
				(window.innerWidth -
					Math.min(
						entityModalWidth,
						window.innerWidth - entityModalMargin * 2,
					)) /
					2,
			),
		y:
			initialPosition?.y ??
			Math.max(entityModalMargin, window.innerHeight * 0.18),
	}))
	const [size, setSize] = useState(() => ({
		height: Math.min(
			entityModalHeight,
			window.innerHeight - entityModalMargin * 2,
		),
		width: Math.min(
			entityModalWidth,
			window.innerWidth - entityModalMargin * 2,
		),
	}))
	const [isIdPopoverOpen, setIsIdPopoverOpen] = useState(false)
	const idPopoverRef = useRef<HTMLDivElement | null>(null)
	const dragStart = useRef({
		pointerX: 0,
		pointerY: 0,
		x: position.x,
		y: position.y,
	})
	const resizeStart = useRef({
		height: size.height,
		pointerX: 0,
		pointerY: 0,
		width: size.width,
	})
	const orderedAttributes = (entity?.attributes ?? [])
		.slice()
		.sort((left, right) => left.listingIndex - right.listingIndex)
	const orderedLinks = (entity?.links ?? [])
		.slice()
		.sort((left, right) => left.listingIndex - right.listingIndex)
	const orderedInlinks = entities.flatMap((sourceEntity) =>
		sourceEntity.links
			.slice()
			.sort((left, right) => left.listingIndex - right.listingIndex)
			.filter((link) => link.targetEntityId === entity?.id)
			.map((link) => ({
				link,
				sourceEntity,
			})),
	)
	const listingAttribute = entity ? getEntityListingAttribute(entity) : null
	const getAccessLevelName = (accessLevelId: number): string =>
		accessLevels.find((accessLevel) => accessLevel.id === accessLevelId)
			?.name ?? String(accessLevelId)
	const isPublicAccessLevel = (accessLevelId: number): boolean => {
		const accessLevel = accessLevels.find(
			(candidate) => candidate.id === accessLevelId,
		)

		return accessLevel
			? accessLevel.name.toLowerCase() === 'public'
			: accessLevelId === 1
	}
	const getLinkTargetLabel = (link: EntityLink): string => {
		const targetEntity = getLinkTargetEntity(link)

		if (targetEntity) {
			return getEntityListingLabel(targetEntity)
		}

		if (link.targetEntityTemplateId) {
			return (
				entityTemplates.find(
					(template) => template.id === link.targetEntityTemplateId,
				)?.name ?? link.targetEntityTemplateId
			)
		}

		return link.targetEntityId ?? ''
	}
	const getLinkTargetEntity = (link: EntityLink): Entity | null =>
		entities.find((candidate) => candidate.id === link.targetEntityId) ??
		null
	const getInlinkSourceLabel = (sourceEntity: Entity): string =>
		getEntityListingLabel(sourceEntity)
	const isDeleteBlocked = orderedInlinks.length > 0

	function openReferencedEntity(
		entityId: string,
		event: ReactMouseEvent<HTMLButtonElement>,
	): void {
		event.stopPropagation()
		onOpenEntity(entityId, {
			x: event.clientX,
			y: event.clientY,
		})
	}

	useEffect(() => {
		setActiveTab(initialActiveTab)
	}, [initialActiveTab])

	useEffect(() => {
		setRevealedAttributeIds(new Set())
	}, [entity?.id])

	function toggleAttributeValueVisibility(attributeId: string): void {
		setRevealedAttributeIds((current) => {
			const next = new Set(current)

			if (next.has(attributeId)) {
				next.delete(attributeId)
			} else {
				next.add(attributeId)
			}

			return next
		})
	}

	async function copyAttributeValue(value: string): Promise<void> {
		await navigator.clipboard.writeText(value)
	}

	function renderAttributeValue(
		attribute: EntityAttribute | null,
		className?: string,
	) {
		if (!attribute) {
			return <span className={className ?? undefined} />
		}

		const shouldMask = !isPublicAccessLevel(attribute.accessLevelId)
		const isRevealed = revealedAttributeIds.has(attribute.id)
		const canUseRestrictedValueActions = shouldMask && canEdit
		const visibleValue = shouldMask && !isRevealed ? '******' : attribute.value

		return (
			<span
				className={[
					'entity-attribute-value-view',
					shouldMask ? 'entity-attribute-value-view-sensitive' : '',
					className ?? '',
				]
					.filter(Boolean)
					.join(' ')}
			>
				<span className="entity-attribute-value-text">
					{visibleValue}
				</span>
				{canUseRestrictedValueActions ? (
					<span className="entity-attribute-value-actions">
						<button
							aria-label={`${isRevealed ? 'Hide' : 'Show'} ${attribute.name || 'attribute'} value`}
							className="icon-only-button entity-attribute-value-action"
							data-no-drag="true"
							data-tooltip={isRevealed ? 'Hide' : 'Show'}
							type="button"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={(event) => {
								toggleAttributeValueVisibility(attribute.id)
								event.currentTarget.blur()
							}}
						>
							{isRevealed ? (
								<EyeOff aria-hidden="true" />
							) : (
								<Eye aria-hidden="true" />
							)}
						</button>
						<button
							aria-label={`Copy ${attribute.name || 'attribute'} value`}
							className="icon-only-button entity-attribute-value-action"
							data-no-drag="true"
							data-tooltip="Copy"
							type="button"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={(event) => {
								void copyAttributeValue(attribute.value).catch(
									() => undefined,
								)
								event.currentTarget.blur()
							}}
						>
							<Clipboard aria-hidden="true" />
						</button>
					</span>
				) : null}
			</span>
		)
	}

	const startDrag = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			const target = event.target

			if (
				target instanceof HTMLElement &&
				target.closest('[data-no-drag="true"]')
			) {
				return
			}

			event.preventDefault()
			dragStart.current = {
				pointerX: event.clientX,
				pointerY: event.clientY,
				x: position.x,
				y: position.y,
			}

			function move(pointerEvent: PointerEvent): void {
				setPosition({
					x: clampToRange(
						dragStart.current.x +
							pointerEvent.clientX -
							dragStart.current.pointerX,
						entityModalMargin - size.width + 48,
						window.innerWidth - entityModalMargin,
					),
					y: clampToRange(
						dragStart.current.y +
							pointerEvent.clientY -
							dragStart.current.pointerY,
						entityModalMargin,
						window.innerHeight - entityModalMargin,
					),
				})
			}

			function stop(): void {
				window.removeEventListener('pointermove', move)
				window.removeEventListener('pointerup', stop)
			}

			window.addEventListener('pointermove', move)
			window.addEventListener('pointerup', stop)
		},
		[position.x, position.y, size.width],
	)

	const startResize = useCallback(
		(event: ReactPointerEvent<HTMLButtonElement>) => {
			event.preventDefault()
			resizeStart.current = {
				height: size.height,
				pointerX: event.clientX,
				pointerY: event.clientY,
				width: size.width,
			}

			function move(pointerEvent: PointerEvent): void {
				setSize({
					height: clampToRange(
						resizeStart.current.height +
							pointerEvent.clientY -
							resizeStart.current.pointerY,
						entityModalMinHeight,
						window.innerHeight - position.y - entityModalMargin,
					),
					width: clampToRange(
						resizeStart.current.width +
							pointerEvent.clientX -
							resizeStart.current.pointerX,
						entityModalMinWidth,
						window.innerWidth - position.x - entityModalMargin,
					),
				})
			}

			function stop(): void {
				window.removeEventListener('pointermove', move)
				window.removeEventListener('pointerup', stop)
			}

			window.addEventListener('pointermove', move)
			window.addEventListener('pointerup', stop)
		},
		[position.x, position.y, size.height, size.width],
	)

	return (
		<div className="draggable-modal-layer" style={{ zIndex }}>
			<div
				aria-label={modalTitle}
				aria-modal="false"
				className="draggable-modal"
				role="dialog"
				onPointerDown={() => onActivate(windowId)}
				style={{
					height: size.height,
					transform: `translate(${position.x}px, ${position.y}px)`,
					width: size.width,
				}}
			>
				<div className="draggable-modal-body">
					<div
						className="draggable-modal-header"
						onPointerDown={startDrag}
					>
						<h2>{modalTitle}</h2>
						{entity ? (
							<div
								className="draggable-modal-info-action"
								ref={idPopoverRef}
							>
								<button
									aria-expanded={isIdPopoverOpen}
									aria-label="Entity id"
									className="draggable-modal-titlebar-button draggable-modal-info-button"
									data-no-drag="true"
									data-tooltip="Info"
									type="button"
									onPointerDown={(event) =>
										event.stopPropagation()
									}
									onClick={() =>
										setIsIdPopoverOpen(
											(current) => !current,
										)
									}
								>
									<Info aria-hidden="true" />
								</button>
								{isIdPopoverOpen ? (
									<div
										className="include-attribute-popover entity-id-popover"
										data-no-drag="true"
										onPointerDown={(event) =>
											event.stopPropagation()
										}
									>
										<p
											className="entity-id-popover-title"
											data-selectable="true"
										>
											id: {entity.id}
										</p>
									</div>
								) : null}
							</div>
						) : null}
						{canEdit ? (
							<>
								<div
									className="draggable-modal-delete-action"
									data-no-drag="true"
								>
									<button
										aria-expanded={isDeleteConfirmOpen}
										aria-label={`Delete ${modalTitle}`}
										className="draggable-modal-titlebar-button"
										data-no-drag="true"
										data-tooltip={
											isDeleteBlocked
												? 'Cannot delete while referenced'
												: isDeleteConfirmOpen
													? undefined
													: 'Delete'
										}
										disabled={isDeleteBlocked}
										type="button"
										onPointerDown={(event) =>
											event.stopPropagation()
										}
										onClick={() =>
											setIsDeleteConfirmOpen(true)
										}
									>
										<Trash2 aria-hidden="true" />
									</button>
									{isDeleteConfirmOpen ? (
										<div
											className="delete-confirm-popover"
											data-no-drag="true"
											role="dialog"
											aria-label={`Confirm delete ${modalTitle}`}
											onPointerDown={(event) =>
												event.stopPropagation()
											}
										>
											<p>Delete this entity?</p>
											<div>
												<button
													className="delete-confirm-secondary"
													type="button"
													onClick={() =>
														setIsDeleteConfirmOpen(
															false,
														)
													}
												>
													Cancel
												</button>
												<button
													className="delete-confirm-danger"
													type="button"
													onClick={() => {
														setIsDeleteConfirmOpen(
															false,
														)
														if (entity) {
															onDelete(entity)
														}
													}}
												>
													Delete
												</button>
											</div>
										</div>
									) : null}
								</div>
								<button
									aria-label={`Edit ${modalTitle}`}
									className="draggable-modal-titlebar-button"
									data-no-drag="true"
									data-tooltip="Edit"
									type="button"
									onPointerDown={(event) =>
										event.stopPropagation()
									}
									onClick={() => {
										if (entity) {
											onEdit(
												entity,
												position,
												windowId,
												activeTab,
											)
										}
									}}
								>
									<Pencil aria-hidden="true" />
								</button>
							</>
						) : null}
						<button
							aria-label={`Close ${modalTitle}`}
							className="draggable-modal-titlebar-button draggable-modal-close"
							data-no-drag="true"
							data-tooltip="Close"
							type="button"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={onClose}
						>
							<X aria-hidden="true" />
						</button>
					</div>
					<div
						className="draggable-modal-content"
						onPointerDown={startDrag}
					>
						<div className="entity-template-edit-form entity-template-view-form access-level-details">
							<div className="entity-view-summary entity-create-summary">
								<table className="data-table entity-create-summary-table">
									<thead>
										<tr>
											<th>listing attribute name</th>
											<th>value</th>
										</tr>
									</thead>
									<tbody>
										<tr>
											<td>
												<span className="entity-create-summary-value">
													{listingAttribute?.name ??
														''}
												</span>
											</td>
											<td>
												{renderAttributeValue(
													listingAttribute,
													'entity-create-summary-value',
												)}
											</td>
										</tr>
									</tbody>
								</table>
							</div>
							<div className="entity-template-tabs">
								<div className="entity-template-tab-row">
									<div
										className="entity-template-tab-list"
										role="tablist"
										aria-label="Entity sections"
									>
										<button
											aria-selected={
												activeTab === 'attributes'
											}
											className="entity-template-tab"
											role="tab"
											type="button"
											onClick={() =>
												setActiveTab('attributes')
											}
										>
											<span>Attributes</span>
											<span className="entity-template-tab-badge">
												{orderedAttributes.length}
											</span>
										</button>
										<button
											aria-selected={
												activeTab === 'links'
											}
											className="entity-template-tab"
											data-tooltip="Outgoing links"
											role="tab"
											type="button"
											onClick={() =>
												setActiveTab('links')
											}
										>
											<span>Outlinks</span>
											<span className="entity-template-tab-badge">
												{orderedLinks.length}
											</span>
										</button>
										<button
											aria-selected={
												activeTab === 'inlinks'
											}
											className="entity-template-tab"
											data-tooltip="Incoming links"
											role="tab"
											type="button"
											onClick={() =>
												setActiveTab('inlinks')
											}
										>
											<span>Inlinks</span>
											<span className="entity-template-tab-badge">
												{orderedInlinks.length}
											</span>
										</button>
									</div>
								</div>

								{activeTab === 'attributes' ? (
									<div role="tabpanel">
										<table className="data-table entity-template-modal-table entity-template-attributes-table entity-attributes-table">
											<colgroup>
												<col className="entity-attribute-name-column" />
												<col className="entity-attribute-value-column" />
												<col className="entity-attribute-value-type-column" />
												<col className="entity-attribute-access-level-column" />
											</colgroup>
											<thead>
												<tr>
													<th>name</th>
													<th>value</th>
													<th>value type</th>
													<th>access level</th>
												</tr>
											</thead>
											<tbody>
												{orderedAttributes.length ===
												0 ? (
													<tr>
														<td
															className="data-table-empty-cell"
															colSpan={4}
														>
															<span>
																There are no
																entries
															</span>
														</td>
													</tr>
												) : (
													orderedAttributes.map(
														(attribute) => (
															<tr
																key={
																	attribute.id
																}
															>
																<td>
																	{
																		attribute.name
																	}
																</td>
																<td>
																	{renderAttributeValue(
																		attribute,
																	)}
																</td>
																<td>
																	{
																		attribute.valueType
																	}
																</td>
																<td>
																	{getAccessLevelName(
																		attribute.accessLevelId,
																	)}
																</td>
															</tr>
														),
													)
												)}
											</tbody>
										</table>
									</div>
								) : activeTab === 'links' ? (
									<div role="tabpanel">
										<table className="data-table entity-template-modal-table entity-template-view-links-table">
											<colgroup>
												<col className="entity-template-link-name-column" />
												<col className="entity-template-link-description-column" />
												<col className="entity-template-link-target-column" />
											</colgroup>
											<thead>
												<tr>
													<th>name</th>
													<th>description</th>
													<th>target</th>
												</tr>
											</thead>
											<tbody>
												{orderedLinks.length === 0 ? (
													<tr>
														<td
															className="data-table-empty-cell"
															colSpan={3}
														>
															<span>
																There are no
																entries
															</span>
														</td>
													</tr>
												) : (
													orderedLinks.map((link) => {
														const targetEntity =
															getLinkTargetEntity(
																link,
															)

														return (
															<tr key={link.id}>
																<td>
																	{link.name}
																</td>
																<td>
																	<span
																		className="entity-template-link-description-value entity-template-link-description-view-value"
																		data-tooltip={
																			link.description ||
																			undefined
																		}
																	>
																		<span>
																			{link.description ??
																				''}
																		</span>
																	</span>
																</td>
																<td>
																	{targetEntity ? (
																		<button
																			aria-label={`Open entity ${getEntityListingLabel(targetEntity)}`}
																			className="entity-reference-button"
																			data-no-drag="true"
																			type="button"
																			onClick={(
																				event,
																			) =>
																				openReferencedEntity(
																					targetEntity.id,
																					event,
																				)
																			}
																		>
																			<span>
																				{getEntityListingLabel(
																					targetEntity,
																				)}
																			</span>
																			<ExternalLink aria-hidden="true" />
																		</button>
																	) : (
																		getLinkTargetLabel(
																			link,
																		)
																	)}
																</td>
															</tr>
														)
													})
												)}
											</tbody>
										</table>
									</div>
								) : (
									<div role="tabpanel">
										<table className="data-table entity-template-modal-table entity-template-view-inlinks-table">
											<colgroup>
												<col className="entity-template-inlink-source-column" />
												<col className="entity-template-inlink-name-column" />
												<col className="entity-template-inlink-description-column" />
											</colgroup>
											<thead>
												<tr>
													<th>source</th>
													<th>name</th>
													<th>description</th>
												</tr>
											</thead>
											<tbody>
												{orderedInlinks.length === 0 ? (
													<tr>
														<td
															className="data-table-empty-cell"
															colSpan={3}
														>
															<span>
																There are no
																entries
															</span>
														</td>
													</tr>
												) : (
													orderedInlinks.map(
														({
															link,
															sourceEntity,
														}) => (
															<tr key={link.id}>
																<td>
																	<button
																		aria-label={`Open entity ${getInlinkSourceLabel(sourceEntity)}`}
																		className="entity-reference-button"
																		data-no-drag="true"
																		type="button"
																		onClick={(
																			event,
																		) =>
																			openReferencedEntity(
																				sourceEntity.id,
																				event,
																			)
																		}
																	>
																		<span>
																			{getInlinkSourceLabel(
																				sourceEntity,
																			)}
																		</span>
																		<ExternalLink aria-hidden="true" />
																	</button>
																</td>
																<td>
																	{link.name}
																</td>
																<td>
																	<span
																		className="entity-template-link-description-value entity-template-link-description-view-value"
																		data-tooltip={
																			link.description ||
																			undefined
																		}
																	>
																		<span>
																			{link.description ??
																				''}
																		</span>
																	</span>
																</td>
															</tr>
														),
													)
												)}
											</tbody>
										</table>
									</div>
								)}
							</div>

							{error ? (
								<p className="entity-create-error">{error}</p>
							) : isLoading || !entity ? (
								<p className="entity-create-error">
									Loading entity details
								</p>
							) : null}
						</div>
					</div>
					<button
						aria-label={`Resize ${modalTitle}`}
						className="draggable-modal-resize"
						data-no-drag="true"
						type="button"
						onPointerDown={startResize}
					>
						<span />
						<span />
						<span />
						<span />
						<span />
						<span />
					</button>
				</div>
			</div>
		</div>
	)
}

export function DataExplorerView() {
	const [storedAuth, setStoredAuth] = useState(getStoredAuth)
	const [entities, setEntities] = useState<Entity[]>([])
	const [entityTemplates, setEntityTemplates] = useState<EntityTemplate[]>([])
	const [accessLevels, setAccessLevels] = useState<AccessLevel[]>([])
	const [entitiesError, setEntitiesError] = useState<string | null>(null)
	const [createEntityError, setCreateEntityError] = useState<string | null>(
		null,
	)
	const [isLoadingEntities, setIsLoadingEntities] = useState(true)
	const [isLoadingCreateOptions, setIsLoadingCreateOptions] = useState(false)
	const [isCreateChoiceOpen, setIsCreateChoiceOpen] = useState(false)
	const [createChoicePosition, setCreateChoicePosition] = useState({
		x: 0,
		y: 0,
	})
	const [createChoiceSource, setCreateChoiceSource] = useState<
		'template' | 'scratch' | null
	>(null)
	const [createChoiceEntityTemplateId, setCreateChoiceEntityTemplateId] =
		useState('')
	const [isCreateEntityModalOpen, setIsCreateEntityModalOpen] =
		useState(false)
	const [createEntityModalPosition, setCreateEntityModalPosition] = useState<
		{ x: number; y: number } | undefined
	>(undefined)
	const [createEntityModalZIndex, setCreateEntityModalZIndex] = useState(1)
	const [createEntityMode, setCreateEntityMode] = useState<
		'template' | 'scratch'
	>('template')
	const [entityEditWindows, setEntityEditWindows] = useState<
		EntityEditWindowState[]
	>([])
	const [entityDetailsWindows, setEntityDetailsWindows] = useState<
		EntityDetailsWindowState[]
	>([])
	const [isSavingEntity, setIsSavingEntity] = useState(false)
	const isMountedRef = useRef(false)
	const loadRequestId = useRef(0)
	const createOptionsLoadRequestId = useRef(0)
	const entityDetailsLoadRequestIds = useRef(new Map<string, number>())
	const modalZIndexRef = useRef(1)
	const isAuthenticated = storedAuth !== null
	const canManageData =
		hasStoredPermission(storedAuth, PermissionName.Admin) ||
		hasStoredPermission(storedAuth, PermissionName.Editor)
	const isAuthorized =
		canManageData ||
		hasStoredPermission(storedAuth, PermissionName.Viewer)

	const getEntityDetailsPosition = useCallback(
		(pointerX: number, pointerY: number) => {
			const modalWidth = Math.min(
				entityModalWidth,
				window.innerWidth - entityModalMargin * 2,
			)
			const modalHeight = Math.min(
				entityModalHeight,
				window.innerHeight - entityModalMargin * 2,
			)

			return {
				x: clampToRange(
					pointerX - modalWidth * 0.3,
					entityModalMargin,
					window.innerWidth - modalWidth - entityModalMargin,
				),
				y: clampToRange(
					pointerY - 48,
					entityModalMargin,
					window.innerHeight - modalHeight - entityModalMargin,
				),
			}
		},
		[],
	)

	const getNextModalZIndex = useCallback((): number => {
		modalZIndexRef.current += 1
		return modalZIndexRef.current
	}, [])

	const loadEntities = useCallback(async (): Promise<void> => {
		const requestId = loadRequestId.current + 1
		loadRequestId.current = requestId

		setIsLoadingEntities(true)

		try {
			const response = await fetch(`${apiBaseUrl}${apiRoutes.entities}`, {
				headers: getAuthHeaders(),
			})

			if (!response.ok) {
				throw new Error('Unable to load entities')
			}

			const data = (await response.json()) as EntitiesResponse

			if (isMountedRef.current && requestId === loadRequestId.current) {
				setEntities(data.data)
				setEntitiesError(null)
			}
		} catch {
			if (isMountedRef.current && requestId === loadRequestId.current) {
				setEntitiesError('Data is unavailable')
			}
		} finally {
			if (isMountedRef.current && requestId === loadRequestId.current) {
				setIsLoadingEntities(false)
			}
		}
	}, [])

	const loadEntityTemplates = useCallback(async (): Promise<void> => {
		const requestId = createOptionsLoadRequestId.current + 1
		createOptionsLoadRequestId.current = requestId

		setIsLoadingCreateOptions(true)

		try {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.entityTemplates}`,
				{
					headers: getAuthHeaders(),
				},
			)

			if (!response.ok) {
				throw new Error('Unable to load entity templates')
			}

			const data = (await response.json()) as EntityTemplatesResponse

			if (
				isMountedRef.current &&
				requestId === createOptionsLoadRequestId.current
			) {
				setEntityTemplates(data.data)
				setCreateChoiceEntityTemplateId(
					(current) => current || data.data[0]?.id || '',
				)
				setCreateEntityError(null)
			}
		} catch {
			if (
				isMountedRef.current &&
				requestId === createOptionsLoadRequestId.current
			) {
				setCreateEntityError('Options are unavailable')
			}
		} finally {
			if (
				isMountedRef.current &&
				requestId === createOptionsLoadRequestId.current
			) {
				setIsLoadingCreateOptions(false)
			}
		}
	}, [])

	const loadAccessLevels = useCallback(async (): Promise<void> => {
		try {
			const response = await fetch(`${apiBaseUrl}${apiRoutes.accessLevels}`, {
				headers: getAuthHeaders(),
			})

			if (!response.ok) {
				throw new Error('Unable to load access levels')
			}

			const data = (await response.json()) as AccessLevelsResponse

			if (isMountedRef.current) {
				setAccessLevels(data.data)
			}
		} catch {
			if (isMountedRef.current) {
				setAccessLevels([])
			}
		}
	}, [])

	const openCreateEntityChoice = useCallback(
		(event: ReactMouseEvent<HTMLButtonElement>) => {
			if (!canManageData) {
				return
			}

			const rect = event.currentTarget.getBoundingClientRect()
			const popoverWidth = 176

			setCreateChoicePosition({
				x: Math.min(
					window.innerWidth - popoverWidth - 16,
					Math.max(16, rect.left - popoverWidth - 8),
				),
				y: Math.max(16, rect.top - 12),
			})
			setCreateEntityError(null)
			setIsCreateChoiceOpen((current) => !current)
			setCreateChoiceSource(null)
		},
		[canManageData],
	)

	const selectCreateChoiceSource = useCallback(
		(source: 'template' | 'scratch') => {
			if (!canManageData) {
				return
			}

			setCreateChoiceSource(source)

			if (source === 'template') {
				void loadEntityTemplates()
			}
		},
		[canManageData, loadEntityTemplates],
	)

	const openCreateEntityModal = useCallback(
		(mode: 'template' | 'scratch') => {
			if (!canManageData) {
				return
			}

			setCreateEntityMode(mode)
			setCreateEntityError(null)
			setIsCreateChoiceOpen(false)
			setIsCreateEntityModalOpen(true)
			setCreateEntityModalPosition(undefined)
			setCreateEntityModalZIndex(getNextModalZIndex())
			void loadAccessLevels()

			if (mode === 'template' && entityTemplates.length === 0) {
				void loadEntityTemplates()
			}
		},
		[
			getNextModalZIndex,
			entityTemplates.length,
			loadAccessLevels,
			loadEntityTemplates,
			canManageData,
		],
	)

	const activateCreateEntityModal = useCallback(() => {
		setCreateEntityModalZIndex(getNextModalZIndex())
	}, [getNextModalZIndex])

	const openEntityEditModal = useCallback(
		(
			entity: Entity,
			position: { x: number; y: number },
			windowId: string,
			activeTab: 'attributes' | 'links' | 'inlinks',
		) => {
			if (!canManageData) {
				return
			}

			const zIndex = getNextModalZIndex()

			setCreateEntityError(null)
			setEntityDetailsWindows((current) =>
				current.filter((window) => window.id !== windowId),
			)
			void loadAccessLevels()

			if (entityTemplates.length === 0) {
				void loadEntityTemplates()
			}

			setEntityEditWindows((current) => {
				const existing = current.find(
					(window) => window.entity.id === entity.id,
				)

				if (existing) {
					return current.map((window) =>
						window.id === existing.id
							? {
									...window,
									entity,
									activeTab,
									initialPosition: position,
									zIndex,
								}
							: window,
					)
				}

				return [
					...current,
					{
						entity,
						activeTab,
						id: crypto.randomUUID(),
						initialPosition: position,
						zIndex,
					},
				]
			})
		},
		[
			getNextModalZIndex,
			entityTemplates.length,
			loadAccessLevels,
			loadEntityTemplates,
			canManageData,
		],
	)

	const deleteEntity = useCallback(async (entity: Entity): Promise<void> => {
		if (!canManageData) {
			return
		}

		setEntityDetailsWindows((current) =>
			current.map((window) =>
				window.entityId === entity.id
					? {
							...window,
							error: null,
						}
					: window,
			),
		)

		try {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.entity(entity.id)}`,
				{
					headers: getAuthHeaders(),
					method: 'DELETE',
				},
			)

			if (!response.ok) {
				throw new Error(
					await getErrorMessageFromResponse(
						response,
						'Unable to delete entity',
					),
				)
			}

			if (isMountedRef.current) {
				setEntities((current) =>
					current.filter((candidate) => candidate.id !== entity.id),
				)
				setEntityDetailsWindows((current) =>
					current.filter((window) => window.entityId !== entity.id),
				)
			}
		} catch (error) {
			if (isMountedRef.current) {
				setEntityDetailsWindows((current) =>
					current.map((window) =>
						window.entityId === entity.id
							? {
									...window,
									error:
										error instanceof Error
											? error.message
											: 'Unable to delete entity',
								}
							: window,
					),
				)
			}
		}
	}, [canManageData])

	const loadEntityDetails = useCallback(
		async (windowId: string, entityId: string) => {
			const requestId =
				(entityDetailsLoadRequestIds.current.get(windowId) ?? 0) + 1
			entityDetailsLoadRequestIds.current.set(windowId, requestId)

			setEntityDetailsWindows((current) =>
				current.map((window) =>
					window.id === windowId
						? {
								...window,
								error: null,
								isLoading: true,
							}
						: window,
				),
			)

			try {
				const response = await fetch(
					`${apiBaseUrl}${apiRoutes.entity(entityId)}`,
					{
						headers: getAuthHeaders(),
					},
				)

				if (!response.ok) {
					throw new Error('Unable to load entity')
				}

				const data = (await response.json()) as EntityResponse

				if (
					isMountedRef.current &&
					requestId ===
						entityDetailsLoadRequestIds.current.get(windowId)
				) {
					setEntityDetailsWindows((current) =>
						current.map((window) =>
							window.id === windowId
								? {
										...window,
										entity: data.data,
										error: null,
										isLoading: false,
									}
								: window,
						),
					)
				}
			} catch {
				if (
					isMountedRef.current &&
					requestId ===
						entityDetailsLoadRequestIds.current.get(windowId)
				) {
					setEntityDetailsWindows((current) =>
						current.map((window) =>
							window.id === windowId
								? {
										...window,
										entity: null,
										error: 'Unable to load entity',
										isLoading: false,
									}
								: window,
						),
					)
				}
			} finally {
				if (
					isMountedRef.current &&
					requestId ===
						entityDetailsLoadRequestIds.current.get(windowId)
				) {
					setEntityDetailsWindows((current) =>
						current.map((window) =>
							window.id === windowId
								? {
										...window,
										isLoading: false,
									}
								: window,
						),
					)
				}
			}
		},
		[],
	)

	const openEntityDetails = useCallback(
		(entityId: string, pointerPosition?: { x: number; y: number }) => {
			const existingEditWindow = entityEditWindows.find(
				(window) => window.entity.id === entityId,
			)

			if (existingEditWindow) {
				setEntityEditWindows((current) =>
					current.map((window) =>
						window.id === existingEditWindow.id
							? {
									...window,
									zIndex: getNextModalZIndex(),
								}
							: window,
					),
				)

				return
			}

			const existingWindow = entityDetailsWindows.find(
				(window) => window.entityId === entityId,
			)

			if (existingWindow) {
				setEntityDetailsWindows((current) =>
					current.map((window) =>
						window.id === existingWindow.id
							? {
									...window,
									zIndex: getNextModalZIndex(),
								}
							: window,
					),
				)
				void loadAccessLevels()

				if (entityTemplates.length === 0) {
					void loadEntityTemplates()
				}

				return
			}

			const windowId = crypto.randomUUID()
			const initialPosition = pointerPosition
				? getEntityDetailsPosition(pointerPosition.x, pointerPosition.y)
				: getEntityDetailsPosition(
						window.innerWidth / 2,
						window.innerHeight * 0.18,
					)

			setEntityDetailsWindows((current) => [
				...current,
				{
					entity: null,
					entityId,
					activeTab: 'attributes',
					error: null,
					id: windowId,
					initialPosition,
					zIndex: getNextModalZIndex(),
					isLoading: true,
				},
			])
			void loadAccessLevels()

			if (entityTemplates.length === 0) {
				void loadEntityTemplates()
			}

			void loadEntityDetails(windowId, entityId)
		},
		[
			getNextModalZIndex,
			entityEditWindows,
			entityDetailsWindows,
			getEntityDetailsPosition,
			entityTemplates.length,
			loadAccessLevels,
			loadEntityDetails,
			loadEntityTemplates,
		],
	)

	const closeEntityDetails = useCallback((windowId: string) => {
		entityDetailsLoadRequestIds.current.delete(windowId)
		setEntityDetailsWindows((current) =>
			current.filter((window) => window.id !== windowId),
		)
	}, [])

	const activateEntityDetailsWindow = useCallback(
		(windowId: string) => {
			setEntityDetailsWindows((current) =>
				current.map((window) =>
					window.id === windowId
						? {
								...window,
								zIndex: getNextModalZIndex(),
							}
						: window,
				),
			)
		},
		[getNextModalZIndex],
	)

	const activateEntityEditWindow = useCallback(
		(windowId: string) => {
			setEntityEditWindows((current) =>
				current.map((window) =>
					window.id === windowId
						? {
								...window,
								zIndex: getNextModalZIndex(),
							}
						: window,
				),
			)
		},
		[getNextModalZIndex],
	)

	const createEntity = useCallback(
		async (input: CreateEntityInput): Promise<void> => {
			if (!canManageData) {
				return
			}

			setIsSavingEntity(true)
			setCreateEntityError(null)

			try {
				const response = await fetch(
					`${apiBaseUrl}${apiRoutes.entities}`,
					{
						body: JSON.stringify(input),
						headers: {
							...getAuthHeaders(),
							'Content-Type': 'application/json',
						},
						method: 'POST',
					},
				)

				if (!response.ok) {
					throw new Error(
						await getErrorMessageFromResponse(
							response,
							'Unable to create entity',
						),
					)
				}

				const data = (await response.json()) as EntityResponse

				if (isMountedRef.current) {
					setEntities((current) => [...current, data.data])
					setIsCreateEntityModalOpen(false)
				}
			} catch (error) {
				if (isMountedRef.current) {
					setCreateEntityError(
						error instanceof Error
							? error.message
							: 'Unable to create entity',
					)
				}
			} finally {
				if (isMountedRef.current) {
					setIsSavingEntity(false)
				}
			}
		},
		[canManageData],
	)

	const updateEntityRecord = useCallback(
		async (
			id: string,
			input: UpdateEntityInput,
			editWindowPosition?: { x: number; y: number },
			editWindowActiveTab?: 'attributes' | 'links' | 'inlinks',
			editWindowId?: string,
		): Promise<void> => {
			if (!canManageData) {
				return
			}

			setIsSavingEntity(true)
			setCreateEntityError(null)

			try {
				const response = await fetch(
					`${apiBaseUrl}${apiRoutes.entity(id)}`,
					{
						body: JSON.stringify(input),
						headers: {
							...getAuthHeaders(),
							'Content-Type': 'application/json',
						},
						method: 'PUT',
					},
				)

				if (!response.ok) {
					throw new Error(
						await getErrorMessageFromResponse(
							response,
							'Unable to update entity',
						),
					)
				}

				const data = (await response.json()) as EntityResponse

				if (isMountedRef.current) {
					setEntities((current) =>
						current.map((candidate) =>
							candidate.id === id ? data.data : candidate,
						),
					)
					if (editWindowId) {
						setEntityEditWindows((current) =>
							current.filter(
								(window) => window.id !== editWindowId,
							),
						)
						setEntityDetailsWindows((current) => [
							...current.filter(
								(window) => window.entityId !== id,
							),
							{
								entity: data.data,
								entityId: id,
								activeTab: editWindowActiveTab ?? 'attributes',
								error: null,
								id: crypto.randomUUID(),
								initialPosition: editWindowPosition ?? {
									x: Math.max(
										entityModalMargin,
										(window.innerWidth -
											Math.min(
												entityModalWidth,
												window.innerWidth -
													entityModalMargin * 2,
											)) /
											2,
									),
									y: Math.max(
										entityModalMargin,
										window.innerHeight * 0.18,
									),
								},
								zIndex: getNextModalZIndex(),
								isLoading: false,
							},
						])
					} else {
						setIsCreateEntityModalOpen(false)
					}
				}
			} catch (error) {
				if (isMountedRef.current) {
					setCreateEntityError(
						error instanceof Error
							? error.message
							: 'Unable to update entity',
					)
				}
			} finally {
				if (isMountedRef.current) {
					setIsSavingEntity(false)
				}
			}
		},
		[canManageData, getNextModalZIndex],
	)

	useEffect(() => {
		isMountedRef.current = true

		function syncAuthState(): void {
			setStoredAuth(getStoredAuth())
		}

		window.addEventListener(authChangedEventName, syncAuthState)
		window.addEventListener('storage', syncAuthState)

		return () => {
			isMountedRef.current = false
			window.removeEventListener(authChangedEventName, syncAuthState)
			window.removeEventListener('storage', syncAuthState)
		}
	}, [])

	useEffect(() => {
		if (isAuthorized) {
			void loadEntities()
		}
	}, [isAuthorized, loadEntities])

	if (!isAuthorized) {
		return (
			<section className="page-label">
				<p>
					{isAuthenticated
						? 'You are not authorized to access this section.'
						: 'You must be authenticated to access this section.'}
				</p>
			</section>
		)
	}

	return (
		<section className="types-mgmt-view data-explorer-view">
			<div className="types-mgmt-section">
				<div className="section-heading">
					<p>Entities</p>
				</div>

				{entitiesError ? (
					<div className="access-level-unavailable" role="status">
						<p>{entitiesError}</p>
						<button
							aria-label="Refresh entities"
							className="access-level-refresh-button"
							data-tooltip="Try again"
							type="button"
							onClick={() => void loadEntities()}
						>
							<RefreshCw aria-hidden="true" />
						</button>
					</div>
				) : (
					<div className="data-table-wrap templates-table-wrap">
						<table className="data-table entities-table">
							<colgroup>
								<col className="entity-listing-name-column" />
								<col className="entity-listing-value-column" />
							</colgroup>
							<thead>
								<tr>
									<th
										className="data-table-action-heading"
										colSpan={2}
									>
										{canManageData ? (
											<span className="entity-create-action">
												<button
													aria-expanded={
														isCreateChoiceOpen
													}
													aria-label="Create entity"
													className="section-action-button"
													data-tooltip="Add an entity"
													type="button"
													onClick={
														openCreateEntityChoice
													}
												>
													<Plus aria-hidden="true" />
												</button>
											</span>
										) : null}
									</th>
								</tr>
							</thead>
							<tbody>
								{isLoadingEntities ? (
									<tr>
										<td>Loading entities</td>
									</tr>
								) : entities.length === 0 ? (
									<tr>
										<td className="data-table-empty-cell">
											<span>There are no entries</span>
										</td>
									</tr>
								) : (
									entities.map((entity) => {
										const listingAttribute =
											getEntityListingAttribute(entity)

										return (
											<tr
												key={entity.id}
												className="data-table-row"
												tabIndex={0}
												role="button"
												aria-label={`Open entity ${listingAttribute?.value ?? entity.id}`}
												onClick={(event) =>
													openEntityDetails(
														entity.id,
														{
															x: event.clientX,
															y: event.clientY,
														},
													)
												}
												onKeyDown={(event) => {
													if (
														event.key === 'Enter' ||
														event.key === ' '
													) {
														event.preventDefault()
														const rect =
															event.currentTarget.getBoundingClientRect()
														openEntityDetails(
															entity.id,
															{
																x:
																	rect.left +
																	rect.width /
																		2,
																y:
																	rect.top +
																	rect.height /
																		2,
															},
														)
													}
												}}
											>
												<td className="entity-listing-name-cell">
													<span>
														{listingAttribute?.name ??
															''}
													</span>
												</td>
												<td className="entity-listing-value-cell">
													<strong>
														{listingAttribute?.value ??
															''}
													</strong>
												</td>
											</tr>
										)
									})
								)}
							</tbody>
						</table>
					</div>
				)}
			</div>
			{canManageData && isCreateChoiceOpen ? (
				<div
					className="include-attribute-popover entity-create-popover"
					style={{
						left: createChoicePosition.x,
						top: createChoicePosition.y,
					}}
				>
					<button
						aria-label="Close create entity popup"
						className="icon-only-button include-attribute-close-button"
						type="button"
						onClick={() => setIsCreateChoiceOpen(false)}
					>
						<X aria-hidden="true" />
					</button>
					<p className="entity-create-popover-title">
						Create an entity from:
					</p>
					<div className="entity-create-radio-group">
						<label>
							<input
								checked={createChoiceSource === 'template'}
								name="entity-create-source"
								type="radio"
								onChange={() =>
									selectCreateChoiceSource('template')
								}
							/>
							<span>Template</span>
						</label>
						<label>
							<input
								checked={createChoiceSource === 'scratch'}
								name="entity-create-source"
								type="radio"
								onChange={() =>
									selectCreateChoiceSource('scratch')
								}
							/>
							<span>Scratch</span>
						</label>
					</div>
					{createChoiceSource === 'template' ? (
						<div className="entity-create-popover-fields">
							<label>
								<span>entity template</span>
								<span className="attribute-template-select-wrap">
									<select
										disabled={
											isLoadingCreateOptions ||
											entityTemplates.length === 0
										}
										value={createChoiceEntityTemplateId}
										onChange={(event) =>
											setCreateChoiceEntityTemplateId(
												event.target.value,
											)
										}
									>
										{entityTemplates.map(
											(entityTemplate) => (
												<option
													key={entityTemplate.id}
													value={entityTemplate.id}
												>
													{entityTemplate.name}
												</option>
											),
										)}
									</select>
								</span>
							</label>
							<button
								aria-label="Continue"
								className="icon-only-button include-attribute-submit-button"
								data-tooltip="Continue"
								disabled={
									createChoiceEntityTemplateId.length === 0
								}
								type="button"
								onClick={() =>
									openCreateEntityModal('template')
								}
							>
								<Plus aria-hidden="true" />
							</button>
						</div>
					) : createChoiceSource === 'scratch' ? (
						<button
							aria-label="Continue"
							className="icon-only-button include-attribute-submit-button entity-create-popover-continue"
							data-tooltip="Continue"
							type="button"
							onClick={() => openCreateEntityModal('scratch')}
						>
							<Plus aria-hidden="true" />
						</button>
					) : null}
				</div>
			) : null}
			{canManageData && isCreateEntityModalOpen ? (
				<CreateEntityModal
					accessLevels={accessLevels}
					creationMode={createEntityMode}
					entities={entities}
					entityTemplates={entityTemplates}
					error={createEntityError}
					initialEntityTemplateId={createChoiceEntityTemplateId}
					initialPosition={createEntityModalPosition}
					isLoadingOptions={isLoadingCreateOptions}
					isSaving={isSavingEntity}
					onActivate={activateCreateEntityModal}
					mode="create"
					onClose={() => {
						setIsCreateEntityModalOpen(false)
						setCreateEntityModalPosition(undefined)
					}}
					onCreate={createEntity}
					onUpdate={updateEntityRecord}
					zIndex={createEntityModalZIndex}
				/>
			) : null}
			{canManageData && entityEditWindows.map((window) => (
				<CreateEntityModal
					key={window.id}
					accessLevels={accessLevels}
					creationMode={
						window.entity.entityTemplateId ? 'template' : 'scratch'
					}
					entity={window.entity}
					entities={entities}
					entityTemplates={entityTemplates}
					error={createEntityError}
					initialEntityTemplateId={
						window.entity.entityTemplateId ?? ''
					}
					initialActiveTab={window.activeTab}
					initialPosition={window.initialPosition}
					isLoadingOptions={isLoadingCreateOptions}
					isSaving={isSavingEntity}
					onActivate={() => activateEntityEditWindow(window.id)}
					mode="edit"
					onClose={() =>
						setEntityEditWindows((current) =>
							current.filter((item) => item.id !== window.id),
						)
					}
					onBack={(position, activeTab) => {
						setEntityEditWindows((current) =>
							current.filter((item) => item.id !== window.id),
						)
						setEntityDetailsWindows((current) => [
							...current.filter(
								(item) => item.entityId !== window.entity.id,
							),
							{
								entity: window.entity,
								entityId: window.entity.id,
								activeTab,
								error: null,
								id: crypto.randomUUID(),
								initialPosition: position,
								zIndex: getNextModalZIndex(),
								isLoading: false,
							},
						])
					}}
					onCreate={createEntity}
					onUpdate={(id, input, position, activeTab) =>
						updateEntityRecord(
							id,
							input,
							position ?? window.initialPosition,
							activeTab ?? window.activeTab,
							window.id,
						)
					}
					zIndex={window.zIndex}
				/>
			))}
			{entityDetailsWindows.map((window) => (
				<EntityDetailsModal
					key={window.id}
					accessLevels={accessLevels}
					entity={window.entity}
					entities={entities}
					entityTemplates={entityTemplates}
					error={window.error}
					initialActiveTab={window.activeTab}
					initialPosition={window.initialPosition}
					isLoading={window.isLoading}
					onActivate={activateEntityDetailsWindow}
					onDelete={deleteEntity}
					onEdit={openEntityEditModal}
					canEdit={canManageData}
					onOpenEntity={openEntityDetails}
					onClose={() => closeEntityDetails(window.id)}
					windowId={window.id}
					zIndex={window.zIndex}
				/>
			))}
		</section>
	)
}
