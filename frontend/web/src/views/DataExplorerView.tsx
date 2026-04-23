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
	type EntityResponse,
	type EntityTemplate,
	type EntityTemplatesResponse,
	type UpdateEntityInput,
} from '@rebirth/shared'
import {
	GripVertical,
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
	type FormEvent,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
} from 'react'
import {
	authChangedEventName,
	getStoredAuth,
	hasStoredPermission,
} from '../auth'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9908'
const entityModalHeight = 440
const entityModalMargin = 16
const entityModalMinHeight = 300
const entityModalMinWidth = 320
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

function getEntityListingAttribute(entity: Entity) {
	return (
		entity.attributes.find(
			(attribute) => attribute.id === entity.listingAttributeId,
		) ?? null
	)
}

interface CreateEntityModalProps {
	accessLevels: AccessLevel[]
	creationMode: 'template' | 'scratch'
	entity?: Entity | null
	entityTemplates: EntityTemplate[]
	error: string | null
	mode: 'create' | 'edit'
	initialEntityTemplateId?: string
	isLoadingOptions: boolean
	isSaving: boolean
	onClose: () => void
	onCreate: (input: CreateEntityInput) => Promise<void>
	onUpdate: (id: string, input: UpdateEntityInput) => Promise<void>
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
	entityTemplates,
	error,
	mode,
	initialEntityTemplateId = '',
	isLoadingOptions,
	isSaving,
	onClose,
	onCreate,
	onUpdate,
}: CreateEntityModalProps) {
	const formId = mode === 'edit' ? 'entity-edit-form' : 'entity-create-form'
	const [selectedEntityTemplateId, setSelectedEntityTemplateId] = useState(
		initialEntityTemplateId,
	)
	const [activeTab, setActiveTab] = useState<'attributes' | 'links'>(
		'attributes',
	)
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
	const [position, setPosition] = useState(() => ({
		x: Math.max(
			entityModalMargin,
			(window.innerWidth -
				Math.min(
					entityModalWidth,
					window.innerWidth - entityModalMargin * 2,
				)) /
				2,
		),
		y: Math.max(entityModalMargin, window.innerHeight * 0.18),
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
	const firstListingAttributeId = includedAttributes[0]?.id ?? ''
	const isValid =
		includedAttributes.length > 0 &&
		listingAttributeId.length > 0 &&
		includedAttributes.every(
			(attribute) => attribute.name.trim().length > 0,
		)
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
	}, [entity, mode])

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

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()

		if (isCreateDisabled) {
			return
		}

		if (mode === 'edit') {
			if (!entity) {
				return
			}

			await onUpdate(entity.id, {
				attributes: includedAttributes.map((attribute, index) => ({
					accessLevelId: attribute.accessLevelId,
					attributeTemplateId: attribute.attributeTemplateId,
					description: attribute.description.trim(),
					entityTemplateAttributeId:
						attribute.entityTemplateAttributeId,
					id: attribute.id,
					listingIndex: index,
					name: attribute.name.trim(),
					value: attribute.value,
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
			})
			return
		}

		if (creationMode === 'template') {
			if (!selectedEntityTemplate) {
				return
			}

			await onCreate({
				attributeValues: includedAttributes
					.filter(
						(attribute) =>
							attribute.entityTemplateAttributeId !== null,
					)
					.map((attribute) => ({
						entityTemplateAttributeId:
							attribute.entityTemplateAttributeId ?? '',
						value: attribute.value,
					})),
				entityTemplateId: selectedEntityTemplate.id,
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
				value: attribute.value,
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

	function setActiveDraggedAttribute(attributeId: string | null): void {
		draggedAttributeIdRef.current = attributeId
		setDraggedAttributeId(attributeId)
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

	return (
		<div className="draggable-modal-layer">
			<div
				aria-label={modalTitle}
				aria-modal="false"
				className="draggable-modal"
				role="dialog"
				style={{
					height: size.height,
					transform: `translate(${position.x}px, ${position.y}px)`,
					width: size.width,
					zIndex: 1,
				}}
			>
				<div className="draggable-modal-body">
					<div
						className="draggable-modal-header"
						onPointerDown={startDrag}
					>
						<h2>{modalTitle}</h2>
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
					<div className="draggable-modal-content">
						<form
							id={formId}
							className="entity-template-edit-form"
							onSubmit={handleSubmit}
						>
							<div className="entity-template-fields">
								<label data-selectable="true">
									<span>listing attribute</span>
									<span className="attribute-template-select-wrap">
										<select
											disabled={
												includedAttributes.length === 0
											}
											value={listingAttributeId}
											onChange={(event) =>
												setListingAttributeId(
													event.target.value,
												)
											}
										>
											{includedAttributes.map(
												(attribute) => (
													<option
														key={attribute.id}
														value={attribute.id}
													>
														{attribute.name || ''}
													</option>
												),
											)}
										</select>
									</span>
								</label>
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
									{activeTab === 'links' ? (
										<span className="include-link-action">
											<button
												aria-label="Include link"
												className="section-action-button"
												data-tooltip="Include link"
												disabled
												type="button"
											>
												<Plus aria-hidden="true" />
											</button>
										</span>
									) : null}
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
																disabled={
																	mode !==
																		'edit' &&
																	creationMode ===
																		'template'
																}
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
																	readOnly={
																		mode !==
																			'edit' &&
																		creationMode ===
																			'template'
																	}
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
															</td>
															<td>
																<span className="attribute-template-select-wrap entity-template-value-type-wrap">
																	<select
																		aria-label={`${attribute.name || 'Attribute'} value type`}
																		data-no-drag="true"
																		disabled={
																			mode !==
																				'edit' &&
																			creationMode ===
																				'template'
																		}
																		value={
																			attribute.valueType
																		}
																		onChange={(
																			event,
																		) =>
																			updateAttribute(
																				attribute.id,
																				{
																					valueType:
																						event
																							.target
																							.value as ValueType,
																				},
																			)
																		}
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
																		disabled={
																			mode !==
																				'edit' &&
																			creationMode ===
																				'template'
																		}
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
																		(mode !==
																			'edit' &&
																			creationMode ===
																				'template') ||
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
								) : (
									<div role="tabpanel">
										<table className="data-table entity-template-modal-table entity-template-links-table">
											<tbody>
												{includedLinks.length === 0 ? (
													<tr>
														<td className="data-table-empty-cell">
															<span>
																There are no
																entries
															</span>
														</td>
													</tr>
												) : (
													includedLinks.map(
														(link) => (
															<tr key={link.id}>
																<td>
																	{link.name}
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
	entityTemplates: EntityTemplate[]
	error: string | null
	isLoading: boolean
	onDelete: (entity: Entity) => void
	onEdit: (entity: Entity) => void
	onClose: () => void
}

function EntityDetailsModal({
	accessLevels,
	entity,
	entityTemplates,
	error,
	isLoading,
	onDelete,
	onEdit,
	onClose,
}: EntityDetailsModalProps) {
	const modalTitle = 'Entity'
	const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
	const [activeTab, setActiveTab] = useState<'attributes' | 'links'>(
		'attributes',
	)
	const [position, setPosition] = useState(() => ({
		x: Math.max(
			entityModalMargin,
			(window.innerWidth -
				Math.min(
					entityModalWidth,
					window.innerWidth - entityModalMargin * 2,
				)) /
				2,
		),
		y: Math.max(entityModalMargin, window.innerHeight * 0.18),
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
	const listingAttribute = entity ? getEntityListingAttribute(entity) : null
	const getAccessLevelName = (accessLevelId: number): string =>
		accessLevels.find((accessLevel) => accessLevel.id === accessLevelId)
			?.name ?? String(accessLevelId)

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
		<div className="draggable-modal-layer">
			<div
				aria-label={modalTitle}
				aria-modal="false"
				className="draggable-modal"
				role="dialog"
				style={{
					height: size.height,
					transform: `translate(${position.x}px, ${position.y}px)`,
					width: size.width,
					zIndex: 1,
				}}
			>
				<div className="draggable-modal-body">
					<div
						className="draggable-modal-header"
						onPointerDown={startDrag}
					>
						<h2>{modalTitle}</h2>
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
									isDeleteConfirmOpen ? undefined : 'Delete'
								}
								type="button"
								onPointerDown={(event) =>
									event.stopPropagation()
								}
								onClick={() => setIsDeleteConfirmOpen(true)}
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
												setIsDeleteConfirmOpen(false)
											}
										>
											Cancel
										</button>
										<button
											className="delete-confirm-danger"
											type="button"
											onClick={() => {
												setIsDeleteConfirmOpen(false)
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
							onPointerDown={(event) => event.stopPropagation()}
							onClick={() => {
								if (entity) {
									onEdit(entity)
								}
							}}
						>
							<Pencil aria-hidden="true" />
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
					<div className="draggable-modal-content">
						<div className="entity-template-edit-form entity-template-view-form access-level-details">
							<div className="attribute-template-id-row">
								<p>id</p>
								<strong className="attribute-template-id-value">
									{entity?.id ?? ''}
								</strong>
							</div>
							<div className="entity-template-fields">
								<label>
									<span>listing attribute</span>
									<span className="attribute-template-select-wrap">
										<select
											disabled
											value={listingAttribute?.id ?? ''}
										>
											{orderedAttributes.map(
												(attribute) => (
													<option
														key={attribute.id}
														value={attribute.id}
													>
														{attribute.name}
													</option>
												),
											)}
										</select>
									</span>
								</label>
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
													<th className="data-table-action-heading" />
												</tr>
											</thead>
											<tbody>
												{orderedAttributes.length ===
												0 ? (
													<tr>
														<td
															className="data-table-empty-cell"
															colSpan={5}
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
																	<input
																		aria-label="Attribute name"
																		className="entity-template-attribute-name-input"
																		readOnly
																		type="text"
																		value={
																			attribute.name
																		}
																	/>
																</td>
																<td>
																	<input
																		aria-label={`${attribute.name || 'Attribute'} value`}
																		className="entity-template-attribute-name-input"
																		readOnly
																		type="text"
																		value={
																			attribute.value
																		}
																	/>
																</td>
																<td>
																	<span className="attribute-template-select-wrap entity-template-value-type-wrap">
																		<select
																			aria-label={`${attribute.name || 'Attribute'} value type`}
																			disabled
																			value={
																				attribute.valueType
																			}
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
																			disabled
																			value={
																				attribute.accessLevelId
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
																<td className="entity-template-attribute-actions" />
															</tr>
														),
													)
												)}
											</tbody>
										</table>
									</div>
								) : (
									<div role="tabpanel">
										<table className="data-table entity-template-modal-table entity-template-links-table">
											<tbody>
												{orderedLinks.length === 0 ? (
													<tr>
														<td className="data-table-empty-cell">
															<span>
																There are no
																entries
															</span>
														</td>
													</tr>
												) : (
													orderedLinks.map((link) => (
														<tr key={link.id}>
															<td>{link.name}</td>
															<td>
																{link.targetEntityId ??
																	link.targetEntityTemplateId ??
																	''}
															</td>
														</tr>
													))
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
	const [createEntityMode, setCreateEntityMode] = useState<
		'template' | 'scratch'
	>('template')
	const [entityFormMode, setEntityFormMode] = useState<'create' | 'edit'>(
		'create',
	)
	const [entityFormEntity, setEntityFormEntity] = useState<Entity | null>(
		null,
	)
	const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
	const [isEntityDetailsModalOpen, setIsEntityDetailsModalOpen] =
		useState(false)
	const [entityDetailsError, setEntityDetailsError] = useState<string | null>(
		null,
	)
	const [isLoadingEntityDetails, setIsLoadingEntityDetails] = useState(false)
	const [isSavingEntity, setIsSavingEntity] = useState(false)
	const isMountedRef = useRef(false)
	const loadRequestId = useRef(0)
	const createOptionsLoadRequestId = useRef(0)
	const entityDetailsLoadRequestId = useRef(0)
	const isAuthenticated = storedAuth !== null
	const isAuthorized =
		hasStoredPermission(storedAuth, PermissionName.Admin) ||
		hasStoredPermission(storedAuth, PermissionName.Manager)

	const loadEntities = useCallback(async (): Promise<void> => {
		const requestId = loadRequestId.current + 1
		loadRequestId.current = requestId

		setIsLoadingEntities(true)

		try {
			const response = await fetch(`${apiBaseUrl}${apiRoutes.entities}`)

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
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.accessLevels}`,
			)

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
		[],
	)

	const selectCreateChoiceSource = useCallback(
		(source: 'template' | 'scratch') => {
			setCreateChoiceSource(source)

			if (source === 'template') {
				void loadEntityTemplates()
			}
		},
		[loadEntityTemplates],
	)

	const openCreateEntityModal = useCallback(
		(mode: 'template' | 'scratch') => {
			setEntityFormMode('create')
			setEntityFormEntity(null)
			setCreateEntityMode(mode)
			setCreateEntityError(null)
			setIsCreateChoiceOpen(false)
			setIsCreateEntityModalOpen(true)
			void loadAccessLevels()

			if (mode === 'template' && entityTemplates.length === 0) {
				void loadEntityTemplates()
			}
		},
		[entityTemplates.length, loadAccessLevels, loadEntityTemplates],
	)

	const openEntityEditModal = useCallback(
		(entity: Entity) => {
			setEntityFormMode('edit')
			setEntityFormEntity(entity)
			setCreateEntityMode(
				entity.entityTemplateId ? 'template' : 'scratch',
			)
			setCreateEntityError(null)
			setIsEntityDetailsModalOpen(false)
			setIsCreateEntityModalOpen(true)
			void loadAccessLevels()

			if (entityTemplates.length === 0) {
				void loadEntityTemplates()
			}
		},
		[entityTemplates.length, loadAccessLevels, loadEntityTemplates],
	)

	const deleteEntity = useCallback(async (entity: Entity): Promise<void> => {
		setEntityDetailsError(null)

		try {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.entity(entity.id)}`,
				{
					headers: getAuthHeaders(),
					method: 'DELETE',
				},
			)

			if (!response.ok) {
				throw new Error('Unable to delete entity')
			}

			if (isMountedRef.current) {
				setEntities((current) =>
					current.filter((candidate) => candidate.id !== entity.id),
				)
				setSelectedEntity(null)
				setIsEntityDetailsModalOpen(false)
			}
		} catch {
			if (isMountedRef.current) {
				setEntityDetailsError('Unable to delete entity')
			}
		}
	}, [])

	const loadEntityDetails = useCallback(async (entityId: string) => {
		const requestId = entityDetailsLoadRequestId.current + 1
		entityDetailsLoadRequestId.current = requestId

		setIsLoadingEntityDetails(true)

		try {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.entity(entityId)}`,
			)

			if (!response.ok) {
				throw new Error('Unable to load entity')
			}

			const data = (await response.json()) as EntityResponse

			if (
				isMountedRef.current &&
				requestId === entityDetailsLoadRequestId.current
			) {
				setSelectedEntity(data.data)
				setEntityDetailsError(null)
			}
		} catch {
			if (
				isMountedRef.current &&
				requestId === entityDetailsLoadRequestId.current
			) {
				setSelectedEntity(null)
				setEntityDetailsError('Unable to load entity')
			}
		} finally {
			if (
				isMountedRef.current &&
				requestId === entityDetailsLoadRequestId.current
			) {
				setIsLoadingEntityDetails(false)
			}
		}
	}, [])

	const openEntityDetails = useCallback(
		(entityId: string) => {
			setSelectedEntity(null)
			setEntityDetailsError(null)
			setIsEntityDetailsModalOpen(true)
			void loadAccessLevels()

			if (entityTemplates.length === 0) {
				void loadEntityTemplates()
			}

			void loadEntityDetails(entityId)
		},
		[
			entityTemplates.length,
			loadAccessLevels,
			loadEntityDetails,
			loadEntityTemplates,
		],
	)

	const closeEntityDetails = useCallback(() => {
		setIsEntityDetailsModalOpen(false)
		setSelectedEntity(null)
		setEntityDetailsError(null)
		setIsLoadingEntityDetails(false)
	}, [])

	const createEntity = useCallback(
		async (input: CreateEntityInput): Promise<void> => {
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
					throw new Error('Unable to create entity')
				}

				const data = (await response.json()) as EntityResponse

				if (isMountedRef.current) {
					setEntities((current) => [...current, data.data])
					setIsCreateEntityModalOpen(false)
					setEntityFormMode('create')
					setEntityFormEntity(null)
				}
			} catch {
				if (isMountedRef.current) {
					setCreateEntityError('Unable to create entity')
				}
			} finally {
				if (isMountedRef.current) {
					setIsSavingEntity(false)
				}
			}
		},
		[],
	)

	const updateEntityRecord = useCallback(
		async (id: string, input: UpdateEntityInput): Promise<void> => {
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
					throw new Error('Unable to update entity')
				}

				const data = (await response.json()) as EntityResponse

				if (isMountedRef.current) {
					setEntities((current) =>
						current.map((candidate) =>
							candidate.id === id ? data.data : candidate,
						),
					)
					setSelectedEntity(data.data)
					setIsCreateEntityModalOpen(false)
					setIsEntityDetailsModalOpen(true)
					setEntityFormMode('create')
					setEntityFormEntity(null)
				}
			} catch {
				if (isMountedRef.current) {
					setCreateEntityError('Unable to update entity')
				}
			} finally {
				if (isMountedRef.current) {
					setIsSavingEntity(false)
				}
			}
		},
		[],
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
							<thead>
								<tr>
									<th className="data-table-action-heading">
										<span className="entity-create-action">
											<button
												aria-expanded={
													isCreateChoiceOpen
												}
												aria-label="Create entity"
												className="section-action-button"
												data-tooltip="Add an entity"
												type="button"
												onClick={openCreateEntityChoice}
											>
												<Plus aria-hidden="true" />
											</button>
										</span>
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
												onClick={() =>
													openEntityDetails(entity.id)
												}
												onKeyDown={(event) => {
													if (
														event.key === 'Enter' ||
														event.key === ' '
													) {
														event.preventDefault()
														openEntityDetails(
															entity.id,
														)
													}
												}}
											>
												<td className="entity-listing-cell">
													<span>
														{listingAttribute?.name ??
															''}
													</span>
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
			{isCreateChoiceOpen ? (
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
			{isCreateEntityModalOpen ? (
				<CreateEntityModal
					accessLevels={accessLevels}
					creationMode={createEntityMode}
					entity={entityFormMode === 'edit' ? entityFormEntity : null}
					entityTemplates={entityTemplates}
					error={createEntityError}
					initialEntityTemplateId={createChoiceEntityTemplateId}
					isLoadingOptions={isLoadingCreateOptions}
					isSaving={isSavingEntity}
					mode={entityFormMode}
					onClose={() => {
						setIsCreateEntityModalOpen(false)
						setEntityFormMode('create')
						setEntityFormEntity(null)
					}}
					onCreate={createEntity}
					onUpdate={updateEntityRecord}
				/>
			) : null}
			{isEntityDetailsModalOpen ? (
				<EntityDetailsModal
					accessLevels={accessLevels}
					entity={selectedEntity}
					entityTemplates={entityTemplates}
					error={entityDetailsError}
					isLoading={isLoadingEntityDetails}
					onDelete={deleteEntity}
					onEdit={openEntityEditModal}
					onClose={closeEntityDetails}
				/>
			) : null}
		</section>
	)
}
