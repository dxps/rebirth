import {
	apiRoutes,
	type AccessLevel,
	type AccessLevelsResponse,
	type ApiErrorResponse,
	type AttributeTemplate,
	type AttributeTemplateResponse,
	type AttributeTemplatesResponse,
	type CreateAttributeTemplateInput,
	type CreateEntityTemplateInput,
	type EntityTemplate,
	type EntityTemplateResponse,
	type EntityTemplatesResponse,
	type UpdateAttributeTemplateInput,
	ValueType,
	valueTypes,
} from '@rebirth/shared'
import { ArrowLeft, GripVertical, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'
import {
	type FormEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
} from 'react'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9908'
const draggableModalHeight = 372
const draggableModalMargin = 16
const draggableModalMinHeights: Record<OpenTemplateModal['mode'], number> = {
	create: 372,
	details: 300,
	edit: 372,
}
const draggableModalMinWidth = 320
const draggableModalDefaultWidth = 360
const entityTemplateModalHeight = 480
const entityTemplateModalWidth = 520

async function getResponseErrorMessage(
	response: Response,
	fallback: string,
): Promise<FormErrorState> {
	try {
		const data = (await response.json()) as Partial<ApiErrorResponse> & {
			error?: ApiErrorResponse['error'] | string
		}

		if (
			typeof data.error === 'object' &&
			data.error !== null &&
			typeof data.error.message === 'string' &&
			data.error.message.length > 0
		) {
			return {
				details:
					typeof data.error.details === 'string' &&
					data.error.details.length > 0
						? data.error.details
						: undefined,
				message: data.error.message,
			}
		}

		if (typeof data.error === 'string' && data.error.length > 0) {
			return { message: data.error }
		}
	} catch {
		return { message: fallback }
	}

	return { message: fallback }
}

interface FormErrorState {
	details?: string
	message: string
}

class FormResponseError extends Error {
	readonly details?: string

	constructor(error: FormErrorState) {
		super(error.message)
		this.details = error.details
	}
}

interface OpenTemplateModal {
	attributeTemplate: AttributeTemplate | null
	entityTemplate: EntityTemplate | null
	initialPosition: {
		x: number
		y: number
	}
	key: string
	mode: 'create' | 'details' | 'edit'
	templateType: 'attribute' | 'entity'
	zIndex: number
}

interface DraggableModalProps {
	children: ReactNode
	id: string
	initialHeight?: number
	initialPosition: {
		x: number
		y: number
	}
	isSaveDisabled?: boolean
	minHeight?: number
	mode: OpenTemplateModal['mode']
	onActivate: (id: string) => void
	onBack: (id: string) => void
	onClose: (id: string) => void
	onDelete: (id: string) => void
	onEdit: (id: string) => void
	saveDisabledTooltip?: string
	title: string
	zIndex: number
}

function clampToRange(value: number, min: number, max: number) {
	return Math.max(min, Math.min(value, max))
}

function getAttributeTemplateModalTitle(mode: OpenTemplateModal['mode']) {
	if (mode === 'create') {
		return 'Attribute Template :: New'
	}

	if (mode === 'edit') {
		return 'Attribute Template :: Edit'
	}

	return 'Attribute Template'
}

function getEntityTemplateModalTitle(mode: OpenTemplateModal['mode']) {
	if (mode === 'create') {
		return 'Entity Template :: New'
	}

	if (mode === 'edit') {
		return 'Entity Template :: Edit'
	}

	return 'Entity Template'
}

function DraggableModal({
	children,
	id,
	initialHeight = draggableModalHeight,
	initialPosition,
	isSaveDisabled = false,
	minHeight: minHeightOverride,
	mode,
	onActivate,
	onBack,
	onClose,
	onDelete,
	onEdit,
	saveDisabledTooltip = 'A template must have a name',
	title,
	zIndex,
}: DraggableModalProps) {
	const [position, setPosition] = useState(initialPosition)
	const [size, setSize] = useState({
		height: initialHeight,
		width: Math.min(
			id.startsWith('entity-template')
				? entityTemplateModalWidth
				: draggableModalDefaultWidth,
			Math.max(draggableModalMinWidth, window.innerWidth * 0.86),
		),
	})
	const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
	const minHeight = minHeightOverride ?? draggableModalMinHeights[mode]
	const confirmDeleteButtonRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		setSize((current) => ({
			...current,
			height: Math.max(current.height, minHeight),
		}))
	}, [minHeight])

	useEffect(() => {
		if (isDeleteConfirmOpen) {
			confirmDeleteButtonRef.current?.focus()
		}
	}, [isDeleteConfirmOpen])

	useEffect(() => {
		setIsDeleteConfirmOpen(false)
	}, [mode])

	const dragStart = useRef({
		pointerX: 0,
		pointerY: 0,
		x: initialPosition.x,
		y: initialPosition.y,
	})
	const resizeStart = useRef({
		height: size.height,
		pointerX: 0,
		pointerY: 0,
		width: size.width,
	})

	const startDrag = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			const target = event.target

			if (
				target instanceof HTMLElement &&
				(target.closest('[data-no-drag="true"]') ||
					target.closest('[data-selectable="true"]'))
			) {
				return
			}

			event.preventDefault()
			onActivate(id)
			dragStart.current = {
				pointerX: event.clientX,
				pointerY: event.clientY,
				x: position.x,
				y: position.y,
			}

			function move(pointerEvent: PointerEvent): void {
				setPosition({
					x: dragStart.current.x + pointerEvent.clientX - dragStart.current.pointerX,
					y: dragStart.current.y + pointerEvent.clientY - dragStart.current.pointerY,
				})
			}

			function stop(): void {
				window.removeEventListener('pointermove', move)
				window.removeEventListener('pointerup', stop)
			}

			window.addEventListener('pointermove', move)
			window.addEventListener('pointerup', stop)
		},
		[id, onActivate, position.x, position.y],
	)

	const startResize = useCallback(
		(event: ReactPointerEvent<HTMLButtonElement>) => {
			event.preventDefault()
			onActivate(id)
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
						minHeight,
						window.innerHeight - position.y - draggableModalMargin,
					),
					width: clampToRange(
						resizeStart.current.width +
							pointerEvent.clientX -
							resizeStart.current.pointerX,
						draggableModalMinWidth,
						window.innerWidth - position.x - draggableModalMargin,
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
		[id, minHeight, onActivate, position.x, position.y, size.height, size.width],
	)

	const saveTooltip = isSaveDisabled ? saveDisabledTooltip : 'Save'
	const deleteButton = (
		<div
			className="draggable-modal-delete-action"
			data-no-drag="true"
		>
			<button
				aria-expanded={isDeleteConfirmOpen}
				aria-label={`Delete ${title}`}
				className="draggable-modal-titlebar-button"
				data-no-drag="true"
				data-tooltip={isDeleteConfirmOpen ? undefined : 'Delete'}
				type="button"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={() => setIsDeleteConfirmOpen(true)}
			>
				<Trash2 aria-hidden="true" />
			</button>
			{isDeleteConfirmOpen ? (
				<div
					className="delete-confirm-popover"
					data-no-drag="true"
					role="dialog"
					aria-label={`Confirm delete ${title}`}
					onPointerDown={(event) => event.stopPropagation()}
				>
					<p>Delete this attribute template?</p>
					<div>
						<button
							className="delete-confirm-secondary"
							type="button"
							onClick={() => setIsDeleteConfirmOpen(false)}
						>
							Cancel
						</button>
						<button
							ref={confirmDeleteButtonRef}
							className="delete-confirm-danger"
							type="button"
							onClick={() => {
								setIsDeleteConfirmOpen(false)
								onDelete(id)
							}}
						>
							Delete
						</button>
					</div>
				</div>
			) : null}
		</div>
	)

	return (
		<div
			className="draggable-modal"
			role="dialog"
			aria-modal="false"
			aria-label={title}
			style={{
				height: size.height,
				transform: `translate(${position.x}px, ${position.y}px)`,
				width: size.width,
				zIndex,
			}}
			onPointerDown={() => onActivate(id)}
		>
			<div
				className="draggable-modal-body"
				onPointerDown={startDrag}
			>
				<div className="draggable-modal-header">
					<h2>{title}</h2>
					{mode === 'details' ? (
						<>
							{deleteButton}
							<button
								aria-label={`Edit ${title}`}
								className="draggable-modal-titlebar-button"
								data-no-drag="true"
								data-tooltip="Edit"
								type="button"
								onPointerDown={(event) => event.stopPropagation()}
								onClick={() => onEdit(id)}
							>
								<Pencil aria-hidden="true" />
							</button>
						</>
					) : (
						<>
							{mode === 'edit' ? deleteButton : null}
							<button
								aria-label={`Back to ${title} details`}
								className="draggable-modal-titlebar-button"
								data-no-drag="true"
								data-tooltip="Back"
								type="button"
								onPointerDown={(event) => event.stopPropagation()}
								onClick={() => onBack(id)}
							>
								<ArrowLeft aria-hidden="true" />
							</button>
							<button
								aria-label={`Save ${title}`}
								className="draggable-modal-titlebar-button"
								data-no-drag="true"
								data-tooltip={saveTooltip}
								data-tooltip-multiline={
									isSaveDisabled && saveTooltip.includes('\n')
										? 'true'
										: undefined
								}
								disabled={isSaveDisabled}
								form={`${id}-edit-form`}
								type="submit"
								onPointerDown={(event) => event.stopPropagation()}
							>
								<Save aria-hidden="true" />
							</button>
						</>
					)}
					<button
						aria-label={`Close ${title}`}
						className="draggable-modal-titlebar-button draggable-modal-close"
						data-no-drag="true"
						data-tooltip="Close"
						type="button"
						onPointerDown={(event) => event.stopPropagation()}
						onClick={() => onClose(id)}
					>
						<X aria-hidden="true" />
					</button>
				</div>
				<div className="draggable-modal-content">{children}</div>
				<button
					aria-label={`Resize ${title}`}
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
	)
}

interface AttributeTemplateEditFormProps {
	attributeTemplate?: AttributeTemplate
	autoFocusName?: boolean
	formId: string
	modalKey: string
	onSave: (
		input: CreateAttributeTemplateInput | UpdateAttributeTemplateInput,
	) => Promise<void | AttributeTemplate>
	onValidityChange: (key: string, isValid: boolean) => void
}

function AttributeTemplateEditForm({
	attributeTemplate,
	autoFocusName = false,
	formId,
	modalKey,
	onSave,
	onValidityChange,
}: AttributeTemplateEditFormProps) {
	const [defaultValue, setDefaultValue] = useState(
		attributeTemplate?.defaultValue ?? '',
	)
	const [description, setDescription] = useState(
		attributeTemplate?.description ?? '',
	)
	const [error, setError] = useState<FormErrorState | null>(null)
	const [isRequired, setIsRequired] = useState(
		attributeTemplate?.isRequired ?? false,
	)
	const [isSaving, setIsSaving] = useState(false)
	const [name, setName] = useState(attributeTemplate?.name ?? '')
	const [valueType, setValueType] = useState<ValueType>(
		attributeTemplate?.valueType ?? ValueType.Text,
	)
	const nameInputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		onValidityChange(modalKey, name.trim().length > 0)
	}, [modalKey, name, onValidityChange])

	useEffect(() => {
		if (autoFocusName) {
			nameInputRef.current?.focus()
		}
	}, [autoFocusName])

	async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()

		if (name.trim().length === 0) {
			setError({ message: 'Name is required' })
			return
		}

		setError(null)
		setIsSaving(true)

		try {
			await onSave({
				defaultValue: defaultValue.trim().length > 0 ? defaultValue : null,
				description,
				isRequired,
				name,
				valueType,
			})
		} catch (error) {
			setError({
				details:
					error instanceof FormResponseError ? error.details : undefined,
				message:
					error instanceof Error
						? error.message
						: 'Unable to save attribute template',
			})
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<form
			className="access-level-edit-form"
			id={formId}
			onSubmit={(event) => void submit(event)}
		>
			<label data-selectable="true">
				<span>name</span>
				<input
					ref={nameInputRef}
					type="text"
					value={name}
					onChange={(event) => setName(event.target.value)}
				/>
			</label>
			<label data-selectable="true">
				<span>description</span>
				<textarea
					rows={2}
					value={description}
					onChange={(event) => setDescription(event.target.value)}
				/>
			</label>
			<label data-selectable="true">
				<span>value type</span>
				<span className="attribute-template-select-wrap">
					<select
						value={valueType}
						onChange={(event) => setValueType(event.target.value as ValueType)}
					>
						{valueTypes.map((type) => (
							<option
								key={type}
								value={type}
							>
								{type}
							</option>
						))}
					</select>
				</span>
			</label>
			<label data-selectable="true">
				<span>default value</span>
				<input
					type="text"
					value={defaultValue}
					onChange={(event) => setDefaultValue(event.target.value)}
				/>
			</label>
			<label
				className="attribute-template-checkbox-label"
				data-selectable="true"
			>
				<input
					checked={isRequired}
					type="checkbox"
					onChange={(event) => setIsRequired(event.target.checked)}
				/>
				<span>required</span>
			</label>
			{error ? (
				<p
					className="form-error"
					data-tooltip={error.details}
				>
					{error.message}
				</p>
			) : null}
			{isSaving ? <p className="form-status">Saving</p> : null}
		</form>
	)
}

interface EntityTemplateEditFormProps {
	accessLevels: AccessLevel[]
	attributeTemplates: AttributeTemplate[]
	autoFocusName?: boolean
	entityTemplate?: EntityTemplate
	formId: string
	modalKey: string
	onCreateAttributeTemplate: (
		input: CreateAttributeTemplateInput,
	) => Promise<AttributeTemplate>
	onSave: (input: CreateEntityTemplateInput) => Promise<void>
	onValidityChange: (key: string, isValid: boolean) => void
}

interface IncludedEntityAttribute {
	id: string
	accessLevelId: number
	attributeTemplateId: string | null
	description: string
	listingIndex: number
	name: string
	valueType: ValueType
}

function EntityTemplateEditForm({
	accessLevels,
	attributeTemplates,
	autoFocusName = false,
	entityTemplate,
	formId,
	modalKey,
	onCreateAttributeTemplate,
	onSave,
	onValidityChange,
}: EntityTemplateEditFormProps) {
	const [activeTab, setActiveTab] = useState<'attributes' | 'links'>('attributes')
	const defaultAccessLevelId = accessLevels[0]?.id ?? 1
	const [description, setDescription] = useState(entityTemplate?.description ?? '')
	const [draggedAttributeId, setDraggedAttributeId] = useState<
		string | null
	>(null)
	const [error, setError] = useState<FormErrorState | null>(null)
	const [includedAttributes, setIncludedAttributes] = useState<
		IncludedEntityAttribute[]
	>(() =>
		entityTemplate
			? entityTemplate.attributes
					.slice()
					.sort((left, right) => left.listingIndex - right.listingIndex)
					.map((attribute, index) => ({
						id: attribute.id,
						accessLevelId: attribute.accessLevelId,
						attributeTemplateId: attribute.attributeTemplateId,
						description: attribute.description,
						listingIndex: index,
						name: attribute.name,
						valueType: attribute.valueType,
					}))
			: [],
	)
	const availableAttributeTemplates = attributeTemplates.filter(
		(attributeTemplate) =>
			!includedAttributes.some(
				(attribute) => attribute.attributeTemplateId === attributeTemplate.id,
			),
	)
	const [includeAttributeMode, setIncludeAttributeMode] = useState<
		'existing' | 'new'
	>('existing')
	const [isIncludeAttributeOpen, setIsIncludeAttributeOpen] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [newAttributeDescription, setNewAttributeDescription] = useState('')
	const [newAttributeName, setNewAttributeName] = useState('')
	const [newAttributeSaveAsTemplate, setNewAttributeSaveAsTemplate] =
		useState(false)
	const [newAttributeValueType, setNewAttributeValueType] = useState<ValueType>(
		ValueType.Text,
	)
	const firstListingAttributeId = includedAttributes[0]?.id ?? ''
	const [selectedAttributeTemplateId, setSelectedAttributeTemplateId] = useState(
		availableAttributeTemplates[0]?.id ?? '',
	)
	const [listingAttributeId, setListingAttributeId] = useState(
		entityTemplate?.listingAttributeId ?? firstListingAttributeId,
	)
	const [name, setName] = useState(entityTemplate?.name ?? '')
	const nameInputRef = useRef<HTMLInputElement>(null)
	const newAttributeNameInputRef = useRef<HTMLInputElement>(null)
	const isValid =
		name.trim().length > 0 &&
		includedAttributes.length > 0 &&
		listingAttributeId.length > 0

	useEffect(() => {
		onValidityChange(modalKey, isValid)
	}, [isValid, modalKey, onValidityChange])

	useEffect(() => {
		if (autoFocusName) {
			nameInputRef.current?.focus()
		}
	}, [autoFocusName])

	useEffect(() => {
		if (isIncludeAttributeOpen && includeAttributeMode === 'new') {
			newAttributeNameInputRef.current?.focus()
		}
	}, [includeAttributeMode, isIncludeAttributeOpen])

	useEffect(() => {
		function blurAccessLevelSelect(event: PointerEvent): void {
			const activeElement = document.activeElement
			const target = event.target

			if (
				activeElement instanceof HTMLSelectElement &&
				activeElement.closest('.entity-template-access-level-wrap') &&
				target instanceof Node &&
				!activeElement.closest('.entity-template-access-level-wrap')?.contains(target)
			) {
				activeElement.blur()
			}
		}

		document.addEventListener('pointerdown', blurAccessLevelSelect, true)

		return () => {
			document.removeEventListener('pointerdown', blurAccessLevelSelect, true)
		}
	}, [])

	useEffect(() => {
		if (
			(listingAttributeId.length === 0 ||
				!includedAttributes.some(
					(attribute) => attribute.id === listingAttributeId,
				)) &&
			firstListingAttributeId.length > 0
		) {
			setListingAttributeId(firstListingAttributeId)
		}
	}, [
		firstListingAttributeId,
		includedAttributes,
		listingAttributeId,
	])

	useEffect(() => {
		if (
			selectedAttributeTemplateId.length === 0 ||
			!availableAttributeTemplates.some(
				(attributeTemplate) => attributeTemplate.id === selectedAttributeTemplateId,
			)
		) {
			setSelectedAttributeTemplateId(availableAttributeTemplates[0]?.id ?? '')
		}
	}, [availableAttributeTemplates, selectedAttributeTemplateId])

	function includeExistingAttribute(): void {
		const attributeTemplate = availableAttributeTemplates.find(
			(candidate) => candidate.id === selectedAttributeTemplateId,
		)

		if (!attributeTemplate) {
			return
		}

		setIncludedAttributes((current) => [
			...current,
			{
				id: crypto.randomUUID(),
				accessLevelId: defaultAccessLevelId,
				attributeTemplateId: attributeTemplate.id,
				description: attributeTemplate.description,
				listingIndex: current.length,
				name: attributeTemplate.name,
				valueType: attributeTemplate.valueType,
			},
		])
		setIsIncludeAttributeOpen(false)
	}

	async function includeNewAttribute(): Promise<void> {
		if (newAttributeName.trim().length === 0) {
			setError({ message: 'Attribute name is required' })
			return
		}

		setError(null)

		try {
			const savedAttributeTemplate = newAttributeSaveAsTemplate
				? await onCreateAttributeTemplate({
						defaultValue: null,
						description: newAttributeDescription.trim(),
						isRequired: false,
						name: newAttributeName.trim(),
						valueType: newAttributeValueType,
					})
				: null

			setIncludedAttributes((current) => [
				...current,
				{
					id: crypto.randomUUID(),
					accessLevelId: defaultAccessLevelId,
					attributeTemplateId: savedAttributeTemplate?.id ?? null,
					description:
						savedAttributeTemplate?.description ??
						newAttributeDescription.trim(),
					listingIndex: current.length,
					name: savedAttributeTemplate?.name ?? newAttributeName.trim(),
					valueType:
						savedAttributeTemplate?.valueType ?? newAttributeValueType,
				},
			])
			setIsIncludeAttributeOpen(false)
			setNewAttributeDescription('')
			setNewAttributeName('')
			setNewAttributeValueType(ValueType.Text)
			setNewAttributeSaveAsTemplate(false)
		} catch (error) {
			setError({
				details:
					error instanceof FormResponseError ? error.details : undefined,
				message:
					error instanceof Error
						? error.message
						: 'Unable to include attribute',
			})
		}
	}

	function removeAttribute(attributeId: string): void {
		setIncludedAttributes((current) =>
			current
				.filter((attribute) => attribute.id !== attributeId)
				.map((attribute, index) => ({ ...attribute, listingIndex: index })),
		)
	}

	function updateAttributeAccessLevel(
		attributeId: string,
		accessLevelId: number,
	): void {
		setIncludedAttributes((current) =>
			current.map((attribute) =>
				attribute.id === attributeId
					? { ...attribute, accessLevelId }
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

	async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()

		if (!isValid) {
			setError({
				message:
					includedAttributes.length === 0
						? 'Include at least one attribute'
						: 'Name is required',
			})
			return
		}

		setError(null)
		setIsSaving(true)

		try {
			await onSave({
				attributes: includedAttributes.map((attribute, index) => ({
					id: attribute.id,
					accessLevelId: attribute.accessLevelId,
					attributeTemplateId: attribute.attributeTemplateId,
					description: attribute.description,
					listingIndex: index,
					name: attribute.name,
					valueType: attribute.valueType,
				})),
				description,
				links: [],
				listingAttributeId,
				name,
			})
		} catch (error) {
			setError({
				details:
					error instanceof FormResponseError ? error.details : undefined,
				message:
					error instanceof Error
						? error.message
						: 'Unable to save entity template',
			})
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<form
			className="entity-template-edit-form"
			id={formId}
			onSubmit={(event) => void submit(event)}
		>
			<div className="entity-template-fields">
				<label data-selectable="true">
					<span>name</span>
					<input
						ref={nameInputRef}
						type="text"
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
				</label>
				<label data-selectable="true">
					<span>description</span>
					<textarea
						rows={2}
						value={description}
						onChange={(event) => setDescription(event.target.value)}
					/>
				</label>
				<label data-selectable="true">
					<span>listing attribute</span>
					<span className="attribute-template-select-wrap">
						<select
							disabled={includedAttributes.length === 0}
							value={listingAttributeId}
							onChange={(event) =>
								setListingAttributeId(event.target.value)
							}
						>
							{includedAttributes.map((attribute) => (
								<option
									key={attribute.id}
									value={attribute.id}
								>
									{attribute.name}
								</option>
							))}
						</select>
					</span>
				</label>
			</div>

			<div
				className="entity-template-tabs"
				data-selectable="true"
			>
				<div
					className="entity-template-tab-list"
					role="tablist"
					aria-label="Entity template sections"
				>
					<button
						aria-selected={activeTab === 'attributes'}
						className="entity-template-tab"
						role="tab"
						type="button"
						onClick={() => setActiveTab('attributes')}
					>
						Attributes
					</button>
					<button
						aria-selected={activeTab === 'links'}
						className="entity-template-tab"
						role="tab"
						type="button"
						onClick={() => setActiveTab('links')}
					>
						Links
					</button>
				</div>

				{activeTab === 'attributes' ? (
					<div role="tabpanel">
						<table className="data-table entity-template-modal-table entity-template-attributes-table">
							<colgroup>
								<col className="entity-template-attribute-name-column" />
								<col className="entity-template-attribute-value-type-column" />
								<col className="entity-template-attribute-access-level-column" />
								<col className="entity-template-attribute-action-column" />
							</colgroup>
							<thead>
								<tr>
									<th colSpan={3} />
									<th className="data-table-action-heading">
										<span className="include-attribute-action">
											<button
												aria-expanded={isIncludeAttributeOpen}
												aria-label="Add attribute"
												className="section-action-button"
												data-tooltip="Include an attribute"
												type="button"
												onClick={() =>
													setIsIncludeAttributeOpen((current) => !current)
												}
											>
												<Plus aria-hidden="true" />
											</button>
											{isIncludeAttributeOpen ? (
												<div
													className="include-attribute-popover"
													data-no-drag="true"
												>
													<button
														aria-label="Close include attribute popup"
														className="icon-only-button include-attribute-close-button"
														type="button"
														onClick={() => setIsIncludeAttributeOpen(false)}
													>
														<X aria-hidden="true" />
													</button>
													<div className="include-attribute-mode-tabs">
														<button
															aria-selected={
																includeAttributeMode === 'existing'
															}
															type="button"
															onClick={() =>
																setIncludeAttributeMode('existing')
															}
														>
															Existing
														</button>
														<button
															aria-selected={includeAttributeMode === 'new'}
															type="button"
															onClick={() => setIncludeAttributeMode('new')}
														>
															New
														</button>
													</div>
													{includeAttributeMode === 'existing' ? (
														<div className="include-attribute-fields">
															<label>
																<span>attribute template</span>
																<span className="attribute-template-select-wrap">
																	<select
																		disabled={
																			availableAttributeTemplates.length === 0
																		}
																		value={selectedAttributeTemplateId}
																		onChange={(event) =>
																			setSelectedAttributeTemplateId(
																				event.target.value,
																			)
																		}
																	>
																		{availableAttributeTemplates.map(
																			(attributeTemplate) => (
																				<option
																					key={attributeTemplate.id}
																					value={attributeTemplate.id}
																				>
																					{attributeTemplate.name}
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
																	availableAttributeTemplates.length === 0
																}
																type="button"
																onClick={includeExistingAttribute}
															>
																<Plus aria-hidden="true" />
															</button>
														</div>
													) : (
														<div className="include-attribute-fields">
															<label>
																<span>name</span>
																<input
																	ref={newAttributeNameInputRef}
																	type="text"
																	value={newAttributeName}
																	onChange={(event) =>
																		setNewAttributeName(event.target.value)
																	}
																/>
															</label>
															<label>
																<span>description</span>
																<textarea
																	rows={2}
																	value={newAttributeDescription}
																	onChange={(event) =>
																		setNewAttributeDescription(
																			event.target.value,
																		)
																	}
																/>
															</label>
															<label>
																<span>value type</span>
																<span className="attribute-template-select-wrap">
																	<select
																		value={newAttributeValueType}
																		onChange={(event) =>
																			setNewAttributeValueType(
																				event.target.value as ValueType,
																			)
																		}
																	>
																		{valueTypes.map((valueType) => (
																			<option
																				key={valueType}
																				value={valueType}
																			>
																				{valueType}
																			</option>
																		))}
																	</select>
																</span>
															</label>
															<label className="include-attribute-checkbox">
																<input
																	checked={newAttributeSaveAsTemplate}
																	type="checkbox"
																	onChange={(event) =>
																		setNewAttributeSaveAsTemplate(
																			event.target.checked,
																		)
																	}
																/>
																<span>save it as attribute template</span>
															</label>
															<button
																aria-label="Include"
																className="icon-only-button include-attribute-submit-button"
																data-tooltip="Include"
																disabled={newAttributeName.trim().length === 0}
																type="button"
																onClick={() => void includeNewAttribute()}
															>
																<Plus aria-hidden="true" />
															</button>
														</div>
													)}
												</div>
											) : null}
										</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{includedAttributes.length === 0 ? (
									<tr>
										<td
											className="data-table-empty-cell"
											colSpan={4}
										>
											<span>No attributes included</span>
										</td>
									</tr>
								) : (
									includedAttributes.map((includedAttribute) => (
											<tr
												key={includedAttribute.id}
												onDragOver={(event) => event.preventDefault()}
												onDrop={() => {
													if (draggedAttributeId) {
														reorderAttribute(
															draggedAttributeId,
															includedAttribute.id,
														)
													}
													setDraggedAttributeId(null)
												}}
											>
												<td
													className="entity-template-attribute-name"
													data-tooltip={
														includedAttribute.description || undefined
													}
												>
													{includedAttribute.name}
												</td>
												<td
													className="entity-template-value-type-cell"
													data-tooltip="Value type"
												>
													{includedAttribute.valueType}
												</td>
												<td>
													<span
														className="attribute-template-select-wrap entity-template-access-level-wrap"
														data-tooltip="Access level"
													>
														<select
															aria-label={`${includedAttribute.name} access level`}
															data-no-drag="true"
															value={includedAttribute.accessLevelId}
															onChange={(event) =>
																updateAttributeAccessLevel(
																	includedAttribute.id,
																	Number(event.target.value),
																)
															}
														>
															{accessLevels.length === 0 ? (
																<option value={includedAttribute.accessLevelId}>
																	{includedAttribute.accessLevelId}
																</option>
															) : (
																accessLevels.map((accessLevel) => (
																	<option
																		key={accessLevel.id}
																		value={accessLevel.id}
																	>
																		{accessLevel.name}
																	</option>
																))
															)}
														</select>
													</span>
												</td>
												<td className="entity-template-attribute-actions">
													<button
														aria-label={`Remove ${includedAttribute.name}`}
														className="icon-only-button"
														data-no-drag="true"
														data-tooltip="Exclude"
														type="button"
														onClick={() => removeAttribute(includedAttribute.id)}
													>
														<Trash2 aria-hidden="true" />
													</button>
													<button
														aria-label={`Drag ${includedAttribute.name}`}
														className="icon-only-button entity-template-drag-handle"
														data-no-drag="true"
														data-tooltip={'Drag up or down\nto reorder'}
														draggable
														type="button"
														onDragStart={() =>
															setDraggedAttributeId(includedAttribute.id)
														}
														onMouseDown={() =>
															setDraggedAttributeId(includedAttribute.id)
														}
													>
														<GripVertical aria-hidden="true" />
													</button>
												</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				) : (
					<div
						className="entity-template-empty-panel"
						role="tabpanel"
					>
						No entries found
					</div>
				)}
			</div>

			{error ? (
				<p
					className="form-error"
					data-tooltip={error.details}
				>
					{error.message}
				</p>
			) : null}
			{isSaving ? <p className="form-status">Saving</p> : null}
		</form>
	)
}

export function TemplatesView() {
	const [accessLevels, setAccessLevels] = useState<AccessLevel[]>([])
	const [attributeTemplates, setAttributeTemplates] = useState<
		AttributeTemplate[]
	>([])
	const [entityTemplates, setEntityTemplates] = useState<EntityTemplate[]>([])
	const [entityTemplatesError, setEntityTemplatesError] = useState<string | null>(
		null,
	)
	const [isLoadingEntityTemplates, setIsLoadingEntityTemplates] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [openModals, setOpenModals] = useState<OpenTemplateModal[]>([])
	const [validFormModalIds, setValidFormModalIds] = useState<Set<string>>(
		() => new Set(),
	)
	const isMountedRef = useRef(false)
	const entityTemplatesLoadRequestId = useRef(0)
	const accessLevelsLoadRequestId = useRef(0)
	const loadRequestId = useRef(0)
	const nextZIndex = useRef(1)

	const loadAccessLevels = useCallback(async (): Promise<void> => {
		const requestId = accessLevelsLoadRequestId.current + 1
		accessLevelsLoadRequestId.current = requestId

		try {
			const response = await fetch(`${apiBaseUrl}${apiRoutes.accessLevels}`)

			if (!response.ok) {
				throw new Error('Unable to load access levels')
			}

			const data = (await response.json()) as AccessLevelsResponse

			if (
				isMountedRef.current &&
				requestId === accessLevelsLoadRequestId.current
			) {
				setAccessLevels(data.data)
			}
		} catch {
			if (
				isMountedRef.current &&
				requestId === accessLevelsLoadRequestId.current
			) {
				setAccessLevels([])
			}
		}
	}, [])

	const loadAttributeTemplates = useCallback(async (): Promise<void> => {
		const requestId = loadRequestId.current + 1
		loadRequestId.current = requestId

		setIsLoading(true)

		try {
			const response = await fetch(`${apiBaseUrl}${apiRoutes.attributeTemplates}`)

			if (!response.ok) {
				throw new Error('Unable to load attribute templates')
			}

			const data = (await response.json()) as AttributeTemplatesResponse

			if (isMountedRef.current && requestId === loadRequestId.current) {
				setAttributeTemplates(data.data)
				setError(null)
			}
		} catch {
			if (isMountedRef.current && requestId === loadRequestId.current) {
				setError('Data is unavailable')
			}
		} finally {
			if (isMountedRef.current && requestId === loadRequestId.current) {
				setIsLoading(false)
			}
		}
	}, [])

	const loadEntityTemplates = useCallback(async (): Promise<void> => {
		const requestId = entityTemplatesLoadRequestId.current + 1
		entityTemplatesLoadRequestId.current = requestId

		setIsLoadingEntityTemplates(true)

		try {
			const response = await fetch(`${apiBaseUrl}${apiRoutes.entityTemplates}`)

			if (!response.ok) {
				throw new Error('Unable to load entity templates')
			}

			const data = (await response.json()) as EntityTemplatesResponse

			if (
				isMountedRef.current &&
				requestId === entityTemplatesLoadRequestId.current
			) {
				setEntityTemplates(data.data)
				setEntityTemplatesError(null)
			}
		} catch {
			if (
				isMountedRef.current &&
				requestId === entityTemplatesLoadRequestId.current
			) {
				setEntityTemplatesError('Data is unavailable')
			}
		} finally {
			if (
				isMountedRef.current &&
				requestId === entityTemplatesLoadRequestId.current
			) {
				setIsLoadingEntityTemplates(false)
			}
		}
	}, [])

	useEffect(() => {
		isMountedRef.current = true

		void loadAccessLevels()
		void loadAttributeTemplates()
		void loadEntityTemplates()

		return () => {
			isMountedRef.current = false
		}
	}, [loadAccessLevels, loadAttributeTemplates, loadEntityTemplates])

	const bringToFront = useCallback((key: string) => {
		nextZIndex.current += 1
		setOpenModals((current) =>
			current.map((modal) =>
				modal.key === key
					? { ...modal, zIndex: nextZIndex.current }
					: modal,
			),
		)
	}, [])

	const closeModal = useCallback((key: string) => {
		setOpenModals((current) => current.filter((modal) => modal.key !== key))
	}, [])

	const setModalMode = useCallback(
		(key: string, mode: OpenTemplateModal['mode']) => {
			setOpenModals((current) =>
				current.map((modal) =>
					modal.key === key ? { ...modal, mode } : modal,
				),
			)
		},
		[],
	)

	const setModalFormValidity = useCallback((key: string, isValid: boolean) => {
		setValidFormModalIds((current) => {
			if (current.has(key) === isValid) {
				return current
			}

			const next = new Set(current)

			if (isValid) {
				next.add(key)
			} else {
				next.delete(key)
			}

			return next
		})
	}, [])

	const updateAttributeTemplateInState = useCallback(
		(attributeTemplate: AttributeTemplate) => {
			setAttributeTemplates((current) =>
				current.map((item) =>
					item.id === attributeTemplate.id ? attributeTemplate : item,
				),
			)
			setOpenModals((current) =>
				current.filter((modal) =>
					modal.attributeTemplate?.id === attributeTemplate.id
						? false
						: true,
				),
			)
		},
		[],
	)

	const saveAttributeTemplate = useCallback(
		async (id: string, input: UpdateAttributeTemplateInput) => {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.attributeTemplate(id)}`,
				{
					body: JSON.stringify(input),
					headers: {
						'Content-Type': 'application/json',
					},
					method: 'PATCH',
				},
			)

			if (!response.ok) {
				throw new FormResponseError(
					await getResponseErrorMessage(
						response,
						'Unable to save attribute template',
					),
				)
			}

			const data = (await response.json()) as AttributeTemplateResponse
			updateAttributeTemplateInState(data.data)
		},
		[updateAttributeTemplateInState],
	)

	const createAttributeTemplate = useCallback(
		async (
			input: CreateAttributeTemplateInput | UpdateAttributeTemplateInput,
		) => {
			const response = await fetch(`${apiBaseUrl}${apiRoutes.attributeTemplates}`, {
				body: JSON.stringify(input),
				headers: {
					'Content-Type': 'application/json',
				},
				method: 'POST',
			})

			if (!response.ok) {
				throw new FormResponseError(
					await getResponseErrorMessage(
						response,
						'Unable to create attribute template',
					),
				)
			}

			const data = (await response.json()) as AttributeTemplateResponse
			setAttributeTemplates((current) => [...current, data.data])
			setOpenModals((current) =>
				current.filter((modal) => modal.key !== 'attribute-template-create'),
			)
			return data.data
		},
		[],
	)

	const createEntityTemplate = useCallback(
		async (input: CreateEntityTemplateInput) => {
			const response = await fetch(`${apiBaseUrl}${apiRoutes.entityTemplates}`, {
				body: JSON.stringify(input),
				headers: {
					'Content-Type': 'application/json',
				},
				method: 'POST',
			})

			if (!response.ok) {
				throw new FormResponseError(
					await getResponseErrorMessage(
						response,
						'Unable to create entity template',
					),
				)
			}

			const data = (await response.json()) as EntityTemplateResponse
			setEntityTemplates((current) => [...current, data.data])
			setOpenModals((current) =>
				current.filter((modal) => modal.key !== 'entity-template-create'),
			)
		},
		[],
	)

	const deleteAttributeTemplate = useCallback(
		async (attributeTemplate: AttributeTemplate) => {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.attributeTemplate(attributeTemplate.id)}`,
				{
					method: 'DELETE',
				},
			)

			if (!response.ok) {
				throw new Error('Unable to delete attribute template')
			}

			setAttributeTemplates((current) =>
				current.filter((item) => item.id !== attributeTemplate.id),
			)
			setOpenModals((current) =>
				current.filter(
					(modal) => modal.attributeTemplate?.id !== attributeTemplate.id,
				),
			)
		},
		[],
	)

	const openAttributeTemplate = useCallback(
		(
			attributeTemplate: AttributeTemplate,
			point: { clientX: number; clientY: number },
		) => {
			nextZIndex.current += 1
			setOpenModals((current) => {
				const existing = current.find(
					(modal) => modal.attributeTemplate?.id === attributeTemplate.id,
				)

				if (existing) {
					return current.map((modal) =>
						modal.key === existing.key
							? { ...modal, zIndex: nextZIndex.current }
							: modal,
					)
				}

				const modalWidth = Math.min(
					draggableModalDefaultWidth,
					Math.max(draggableModalMinWidth, window.innerWidth * 0.86),
				)
				const pointerOffset = 10
				const x = clampToRange(
					point.clientX + pointerOffset,
					draggableModalMargin,
					window.innerWidth - modalWidth - draggableModalMargin,
				)
				const y = clampToRange(
					point.clientY + pointerOffset,
					draggableModalMargin,
					window.innerHeight - draggableModalHeight - draggableModalMargin,
				)

				return [
					...current,
					{
						attributeTemplate,
						entityTemplate: null,
						initialPosition: { x, y },
						key: `attribute-template-${attributeTemplate.id}`,
						mode: 'details',
						templateType: 'attribute',
						zIndex: nextZIndex.current,
					},
				]
			})
		},
		[],
	)

	const openCreateAttributeTemplate = useCallback(
		(point: { clientX: number; clientY: number }) => {
			nextZIndex.current += 1
			setOpenModals((current) => {
				const existing = current.find(
					(modal) => modal.key === 'attribute-template-create',
				)

				if (existing) {
					return current.map((modal) =>
						modal.key === existing.key
							? { ...modal, zIndex: nextZIndex.current }
							: modal,
					)
				}

				return [
					...current,
					{
						attributeTemplate: null,
						entityTemplate: null,
						initialPosition: {
							x: clampToRange(
								point.clientX - draggableModalDefaultWidth - 10,
								draggableModalMargin,
								window.innerWidth -
									draggableModalDefaultWidth -
									draggableModalMargin,
							),
							y: clampToRange(
								point.clientY + 10,
								draggableModalMargin,
								window.innerHeight - draggableModalHeight - draggableModalMargin,
							),
						},
						key: 'attribute-template-create',
						mode: 'create',
						templateType: 'attribute',
						zIndex: nextZIndex.current,
					},
				]
			})
		},
		[],
	)

	const openCreateEntityTemplate = useCallback((point: { clientX: number; clientY: number }) => {
		nextZIndex.current += 1
		setOpenModals((current) => {
			const existing = current.find(
				(modal) => modal.key === 'entity-template-create',
			)

			if (existing) {
				return current.map((modal) =>
					modal.key === existing.key
						? { ...modal, zIndex: nextZIndex.current }
						: modal,
				)
			}

			return [
				...current,
				{
					attributeTemplate: null,
					entityTemplate: null,
					initialPosition: {
						x: clampToRange(
							point.clientX - entityTemplateModalWidth - 10,
							draggableModalMargin,
							window.innerWidth - entityTemplateModalWidth - draggableModalMargin,
						),
						y: clampToRange(
							point.clientY + 10,
							draggableModalMargin,
							window.innerHeight - entityTemplateModalHeight - draggableModalMargin,
						),
					},
					key: 'entity-template-create',
					mode: 'create',
					templateType: 'entity',
					zIndex: nextZIndex.current,
				},
			]
		})
	}, [])

	return (
		<section className="types-mgmt-view">
			<div className="types-mgmt-section">
				<div className="section-heading">
					<p>Entity Templates</p>
				</div>

				{entityTemplatesError ? (
					<div className="access-level-unavailable" role="status">
						<p>{entityTemplatesError}</p>
						<button
							aria-label="Refresh entity templates"
							className="access-level-refresh-button"
							data-tooltip="Try again"
							type="button"
							onClick={() => void loadEntityTemplates()}
						>
							<RefreshCw aria-hidden="true" />
						</button>
					</div>
				) : (
					<div className="data-table-wrap">
						<table className="data-table entity-templates-table">
								<thead>
									<tr>
										<th>name</th>
										<th>description</th>
										<th className="data-table-action-heading">
											<button
												aria-label="Create entity template"
												className="section-action-button"
												data-tooltip="Add an entity template"
												type="button"
												onClick={(event) => openCreateEntityTemplate(event)}
											>
												<Plus aria-hidden="true" />
											</button>
										</th>
									</tr>
								</thead>
								<tbody>
									{isLoadingEntityTemplates ? (
										<tr>
											<td colSpan={3}>Loading entity templates</td>
										</tr>
								) : entityTemplates.length === 0 ? (
									<tr>
										<td
											className="data-table-empty-cell"
											colSpan={3}
										>
											<span>No entries found</span>
										</td>
									</tr>
								) : (
									entityTemplates.map((entityTemplate) => (
										<tr key={entityTemplate.id}>
											<td>{entityTemplate.name}</td>
											<td>
												<span className="empty-value-space">
													{entityTemplate.description}
												</span>
											</td>
											<td aria-hidden="true" />
											</tr>
										))
								)}
							</tbody>
						</table>
					</div>
				)}
			</div>

			<div className="types-mgmt-section">
				<div className="section-heading">
					<p>Attribute Templates</p>
				</div>

				{error ? (
					<div className="access-level-unavailable" role="status">
						<p>{error}</p>
						<button
							aria-label="Refresh attribute templates"
							className="access-level-refresh-button"
							data-tooltip="Try again"
							type="button"
							onClick={() => void loadAttributeTemplates()}
						>
							<RefreshCw aria-hidden="true" />
						</button>
					</div>
				) : (
					<div className="data-table-wrap">
						<table className="data-table attribute-templates-table">
							<thead>
								<tr>
									<th>name</th>
									<th>value type</th>
									<th>description</th>
									<th className="data-table-action-heading">
										<button
											aria-label="Create attribute template"
											className="section-action-button"
											data-tooltip="Add an attribute template"
											type="button"
											onClick={(event) => openCreateAttributeTemplate(event)}
										>
											<Plus aria-hidden="true" />
										</button>
									</th>
								</tr>
							</thead>
							<tbody>
								{isLoading ? (
									<tr>
										<td colSpan={4}>Loading attribute templates</td>
									</tr>
									) : attributeTemplates.length === 0 ? (
										<tr>
											<td
												className="data-table-empty-cell"
												colSpan={4}
											>
												<span>No entries found</span>
											</td>
										</tr>
								) : (
									attributeTemplates.map((attributeTemplate) => (
										<tr
											key={attributeTemplate.id}
											className="data-table-row"
											tabIndex={0}
											onClick={(event: ReactMouseEvent<HTMLTableRowElement>) =>
												openAttributeTemplate(attributeTemplate, event)
											}
											onKeyDown={(event) => {
												if (event.key === 'Enter' || event.key === ' ') {
													event.preventDefault()
													const rect = event.currentTarget.getBoundingClientRect()
													openAttributeTemplate(attributeTemplate, {
														clientX: rect.left,
														clientY: rect.top,
													})
												}
											}}
										>
											<td>{attributeTemplate.name}</td>
											<td>{attributeTemplate.valueType}</td>
											<td>
												<span className="empty-value-space">
													{attributeTemplate.description}
												</span>
											</td>
											<td aria-hidden="true" />
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				)}
			</div>
			<div className="draggable-modal-layer">
				{openModals.map((modal) => (
					<DraggableModal
							key={modal.key}
							id={modal.key}
							initialHeight={
								modal.templateType === 'entity'
									? entityTemplateModalHeight
									: undefined
							}
							initialPosition={modal.initialPosition}
							isSaveDisabled={
								(modal.mode === 'create' || modal.mode === 'edit') &&
								!validFormModalIds.has(modal.key)
							}
							minHeight={
								modal.templateType === 'entity'
									? entityTemplateModalHeight
									: undefined
							}
							mode={modal.mode}
						onActivate={bringToFront}
						onBack={(key) => {
							const modal = openModals.find((item) => item.key === key)

							if (modal?.mode === 'create') {
								closeModal(key)
								return
							}

							setModalMode(key, 'details')
						}}
						onClose={closeModal}
						onDelete={() => {
							if (modal.attributeTemplate) {
								void deleteAttributeTemplate(modal.attributeTemplate)
							}
						}}
							onEdit={(key) => setModalMode(key, 'edit')}
							saveDisabledTooltip={
								modal.templateType === 'entity'
									? 'An entity template must have a name\nand include at least one attribute'
									: 'An attribute template must have a name'
							}
							title={
								modal.templateType === 'entity'
									? getEntityTemplateModalTitle(modal.mode)
									: getAttributeTemplateModalTitle(modal.mode)
							}
							zIndex={modal.zIndex}
						>
							{modal.templateType === 'entity' && modal.mode === 'create' ? (
								<EntityTemplateEditForm
									accessLevels={accessLevels}
									attributeTemplates={attributeTemplates}
									autoFocusName
									formId={`${modal.key}-edit-form`}
									modalKey={modal.key}
									onCreateAttributeTemplate={createAttributeTemplate}
									onSave={createEntityTemplate}
									onValidityChange={setModalFormValidity}
								/>
							) : modal.mode === 'create' ? (
								<AttributeTemplateEditForm
								autoFocusName
								formId={`${modal.key}-edit-form`}
								modalKey={modal.key}
								onSave={createAttributeTemplate}
								onValidityChange={setModalFormValidity}
							/>
						) : modal.mode === 'edit' && modal.attributeTemplate ? (
							<AttributeTemplateEditForm
								attributeTemplate={modal.attributeTemplate}
								autoFocusName
								formId={`${modal.key}-edit-form`}
								modalKey={modal.key}
								onSave={(input) => {
									const attributeTemplate = modal.attributeTemplate

									if (!attributeTemplate) {
										return Promise.resolve()
									}

									return saveAttributeTemplate(attributeTemplate.id, input)
								}}
								onValidityChange={setModalFormValidity}
							/>
						) : modal.attributeTemplate ? (
							<div
								className="access-level-details"
								data-selectable="true"
							>
								<div>
									<p>id</p>
									<strong className="attribute-template-id-value">
										{modal.attributeTemplate.id}
									</strong>
								</div>
								<div>
									<p>name</p>
									<strong>{modal.attributeTemplate.name}</strong>
								</div>
								<div>
									<p>description</p>
									<strong className="empty-value-space">
										{modal.attributeTemplate.description}
									</strong>
								</div>
								<div>
									<p>value type</p>
									<strong>{modal.attributeTemplate.valueType}</strong>
								</div>
								<div>
									<p>default value</p>
									<strong className="empty-value-space">
										{modal.attributeTemplate.defaultValue ?? ''}
									</strong>
								</div>
								<div>
									<p>required</p>
									<strong>{modal.attributeTemplate.isRequired ? 'yes' : 'no'}</strong>
								</div>
							</div>
						) : null}
					</DraggableModal>
				))}
			</div>
		</section>
	)
}
