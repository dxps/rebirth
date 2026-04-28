import {
	apiRoutes,
	PermissionName,
	ValueType,
	valueTypes,
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
	type UpdateEntityTemplateInput,
} from '@rebirth/shared'
import {
	ArrowLeft,
	ExternalLink,
	GripVertical,
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
	useLayoutEffect,
	useRef,
	useState,
	type FormEvent,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	type RefObject,
} from 'react'
import {
	authChangedEventName,
	getStoredAuth,
	hasStoredPermission,
} from '../auth'
import { DraggableModal as BaseDraggableModal } from '../components/ui/draggable-modal'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9908'
const draggableModalHeight = 362
const draggableModalMargin = 16
const draggableModalMinHeights: Record<OpenTemplateModal['mode'], number> = {
	create: 362,
	details: 300,
	edit: 362,
}
const draggableModalMinWidth = 320
const draggableModalDefaultWidth = 360
const entityTemplateModalHeight = 440
const entityTemplateModalWidth = 520
const entityTemplateAttributeReorderThreshold = 0.5

function getSelectableAttributeAccessLevels(accessLevels: AccessLevel[]) {
	return accessLevels
}

function getSelectableAttributeAccessLevelId(
	accessLevels: AccessLevel[],
	accessLevelId?: number,
): number {
	const selectableAccessLevels = getSelectableAttributeAccessLevels(accessLevels)

	if (
		accessLevelId !== undefined &&
		selectableAccessLevels.some(
			(accessLevel) => accessLevel.id === accessLevelId,
		)
	) {
		return accessLevelId
	}

	return selectableAccessLevels[0]?.id ?? accessLevels[0]?.id ?? 1
}

function getAuthHeaders(): Record<string, string> {
	const storedAuth = getStoredAuth()

	return storedAuth
		? {
				Authorization: `Bearer ${storedAuth.sessionKey}`,
			}
		: {}
}

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
	entityTemplateActiveTab?: 'attributes' | 'links' | 'inlinks'
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
	canEdit?: boolean
	infoText?: string
	saveDisabledTooltip?: string
	title: string
	zIndex: number
}

function clampToRange(value: number, min: number, max: number) {
	return Math.max(min, Math.min(value, max))
}

function sortTemplatesByName<T extends { id: string; name: string }>(
	templates: T[],
): T[] {
	return templates.slice().sort((left, right) => {
		const nameComparison = left.name.localeCompare(right.name)

		return nameComparison === 0
			? left.id.localeCompare(right.id)
			: nameComparison
	})
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
	canEdit = true,
	infoText,
	saveDisabledTooltip = 'A template must have a name',
	title,
	zIndex,
}: DraggableModalProps) {
	const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
	const [isInfoPopoverOpen, setIsInfoPopoverOpen] = useState(false)
	const minHeight = minHeightOverride ?? draggableModalMinHeights[mode]
	const confirmDeleteButtonRef = useRef<HTMLButtonElement>(null)
	const infoPopoverRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (isDeleteConfirmOpen) {
			confirmDeleteButtonRef.current?.focus()
		}
	}, [isDeleteConfirmOpen])

	useEffect(() => {
		if (!isInfoPopoverOpen) {
			return
		}

		function handlePointerDown(event: PointerEvent): void {
			const target = event.target

			if (
				infoPopoverRef.current &&
				target instanceof Node &&
				infoPopoverRef.current.contains(target)
			) {
				return
			}

			setIsInfoPopoverOpen(false)
		}

		window.addEventListener('pointerdown', handlePointerDown)

		return () => {
			window.removeEventListener('pointerdown', handlePointerDown)
		}
	}, [isInfoPopoverOpen])

	useEffect(() => {
		setIsDeleteConfirmOpen(false)
	}, [mode])

	const saveTooltip = isSaveDisabled ? saveDisabledTooltip : 'Save'
	const deleteButton = (
		<div className="draggable-modal-delete-action" data-no-drag="true">
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
					<p>Delete this template?</p>
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
		<BaseDraggableModal
			defaultSize={{
				height: initialHeight,
				width: Math.min(
					id.startsWith('entity-template')
						? entityTemplateModalWidth
						: draggableModalDefaultWidth,
					Math.max(draggableModalMinWidth, window.innerWidth * 0.86),
				),
			}}
			id={id}
			initialPosition={initialPosition}
			minSize={{
				height: minHeight,
				width: draggableModalMinWidth,
			}}
			title={title}
			useLayer={false}
			viewportMargin={draggableModalMargin}
			zIndex={zIndex}
			onActivate={() => onActivate(id)}
			renderTitlebarActions={() => (
				<>
					{infoText ? (
						<div
							className="draggable-modal-info-action"
							ref={infoPopoverRef}
						>
							<button
								aria-expanded={isInfoPopoverOpen}
								aria-label="Template id"
								className="draggable-modal-titlebar-button draggable-modal-info-button"
								data-no-drag="true"
								data-tooltip="Info"
								type="button"
								onPointerDown={(event) =>
									event.stopPropagation()
								}
								onClick={() =>
									setIsInfoPopoverOpen((current) => !current)
								}
							>
								<Info aria-hidden="true" />
							</button>
							{isInfoPopoverOpen ? (
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
										id: {infoText}
									</p>
								</div>
							) : null}
						</div>
					) : null}
					{mode === 'details' ? (
						<>
							{canEdit ? (
								<>
									{deleteButton}
									<button
										aria-label={`Edit ${title}`}
										className="draggable-modal-titlebar-button"
										data-no-drag="true"
										data-tooltip="Edit"
										type="button"
										onPointerDown={(event) =>
											event.stopPropagation()
										}
										onClick={() => onEdit(id)}
									>
										<Pencil aria-hidden="true" />
									</button>
								</>
							) : null}
						</>
					) : (
						<>
							{mode === 'edit' ? deleteButton : null}
							<button
								aria-label={`Back to ${title} details`}
								className="draggable-modal-titlebar-button"
								data-no-drag="true"
								data-tooltip="Back to view"
								type="button"
								onPointerDown={(event) =>
									event.stopPropagation()
								}
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
								onPointerDown={(event) =>
									event.stopPropagation()
								}
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
				</>
			)}
		>
			{children}
		</BaseDraggableModal>
	)
}

interface AttributeTemplateEditFormProps {
	accessLevels: AccessLevel[]
	attributeTemplate?: AttributeTemplate
	attributeTemplates: AttributeTemplate[]
	autoFocusName?: boolean
	formId: string
	modalKey: string
	onOpenAttributeTemplate: (
		attributeTemplate: AttributeTemplate,
		point: { clientX: number; clientY: number },
	) => void
	onSave: (
		input: CreateAttributeTemplateInput | UpdateAttributeTemplateInput,
	) => Promise<void | AttributeTemplate>
	onValidityChange: (key: string, isValid: boolean) => void
}

interface TemplateNameLookupItem {
	id: string
	description: string
	name: string
}

interface TemplateNameLookupInputProps<TItem extends TemplateNameLookupItem> {
	closeAriaLabel: string
	currentItemId?: string
	inputRef: RefObject<HTMLInputElement | null>
	items: TItem[]
	minimumQueryLength: number
	onChange: (value: string) => void
	onOpenItem: (
		item: TItem,
		point: { clientX: number; clientY: number },
	) => void
	value: string
}

function highlightTemplateNameMatch(
	value: string,
	query: string,
): ReactNode {
	if (query.length === 0) {
		return value
	}

	const valueLower = value.toLocaleLowerCase()
	const queryLower = query.toLocaleLowerCase()
	const chunks: ReactNode[] = []
	let cursor = 0
	let matchIndex = valueLower.indexOf(queryLower)

	while (matchIndex >= 0) {
		if (matchIndex > cursor) {
			chunks.push(value.slice(cursor, matchIndex))
		}

		const matchEnd = matchIndex + query.length
		chunks.push(
			<mark key={`${matchIndex}-${matchEnd}`}>
				{value.slice(matchIndex, matchEnd)}
			</mark>,
		)
		cursor = matchEnd
		matchIndex = valueLower.indexOf(queryLower, cursor)
	}

	if (cursor < value.length) {
		chunks.push(value.slice(cursor))
	}

	return chunks
}

function TemplateNameLookupInput<TItem extends TemplateNameLookupItem>({
	closeAriaLabel,
	currentItemId,
	inputRef,
	items,
	minimumQueryLength,
	onChange,
	onOpenItem,
	value,
}: TemplateNameLookupInputProps<TItem>) {
	const [isOpen, setIsOpen] = useState(false)
	const normalizedQuery = value.trim().toLocaleLowerCase()
	const matchingItems =
		normalizedQuery.length >= minimumQueryLength
			? items.filter(
					(item) =>
						item.id !== currentItemId &&
						item.name
							.toLocaleLowerCase()
							.includes(normalizedQuery),
				)
			: []
	const shouldShowLookup = isOpen && matchingItems.length > 0

	return (
		<span className="template-name-lookup">
			<input
				ref={inputRef}
				type="text"
				value={value}
				aria-autocomplete="list"
				aria-expanded={shouldShowLookup}
				onBlur={() => setIsOpen(false)}
				onChange={(event) => {
					onChange(event.target.value)
					setIsOpen(true)
				}}
				onFocus={() => setIsOpen(true)}
				onKeyDown={(event) => {
					if (event.key === 'Escape') {
						setIsOpen(false)
					}
				}}
			/>
			{shouldShowLookup ? (
				<span
					className="template-name-lookup-popover"
					role="listbox"
				>
					<span className="template-name-lookup-header">
						<span>Existing entries</span>
						<button
							type="button"
							className="template-name-lookup-close"
							aria-label={closeAriaLabel}
							onMouseDown={(event) => {
								event.preventDefault()
							}}
							onClick={() => setIsOpen(false)}
						>
							<X aria-hidden="true" />
						</button>
					</span>
					{matchingItems.map((item) => (
						<button
							key={item.id}
							type="button"
							className="template-name-lookup-option"
							onMouseDown={(event) => {
								event.preventDefault()
							}}
							onClick={(event) => {
								setIsOpen(false)
								onOpenItem(item, {
									clientX: event.clientX,
									clientY: event.clientY,
								})
							}}
						>
							<span className="template-name-lookup-copy">
								<strong>
									{highlightTemplateNameMatch(
										item.name,
										normalizedQuery,
									)}
								</strong>
								<span>
									{item.description.trim().length > 0
										? item.description
										: '-'}
								</span>
							</span>
							<ExternalLink aria-hidden="true" />
						</button>
					))}
				</span>
			) : null}
		</span>
	)
}

function AttributeTemplateEditForm({
	accessLevels,
	attributeTemplate,
	attributeTemplates,
	autoFocusName = false,
	formId,
	modalKey,
	onOpenAttributeTemplate,
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
	const selectableAccessLevels =
		getSelectableAttributeAccessLevels(accessLevels)
	const [accessLevelId, setAccessLevelId] = useState(
		getSelectableAttributeAccessLevelId(
			accessLevels,
			attributeTemplate?.accessLevelId,
		),
	)
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
				accessLevelId,
				defaultValue:
					defaultValue.trim().length > 0 ? defaultValue : null,
				description,
				isRequired,
				name,
				valueType,
			})
		} catch (error) {
			setError({
				details:
					error instanceof FormResponseError
						? error.details
						: undefined,
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
				<TemplateNameLookupInput
					closeAriaLabel="Close attribute template matches"
					currentItemId={attributeTemplate?.id}
					inputRef={nameInputRef}
					items={attributeTemplates}
					minimumQueryLength={3}
					value={name}
					onChange={setName}
					onOpenItem={onOpenAttributeTemplate}
				/>
			</label>
			<label data-selectable="true">
				<span>description</span>
				<textarea
					className="attribute-template-description-input"
					rows={1}
					value={description}
					onChange={(event) => setDescription(event.target.value)}
				/>
			</label>
			<div className="attribute-template-select-row">
				<label data-selectable="true">
					<span>value type</span>
					<span className="attribute-template-select-wrap">
						<select
							value={valueType}
							onChange={(event) =>
								setValueType(event.target.value as ValueType)
							}
						>
							{valueTypes.map((type) => (
								<option key={type} value={type}>
									{type}
								</option>
							))}
						</select>
					</span>
				</label>
				<label data-selectable="true">
					<span>access level</span>
					<span className="attribute-template-select-wrap">
						<select
							value={accessLevelId}
							onChange={(event) =>
								setAccessLevelId(Number(event.target.value))
							}
						>
							{selectableAccessLevels.length === 0 ? (
								<option value={accessLevelId}>
									{accessLevelId}
								</option>
							) : (
								selectableAccessLevels.map((accessLevel) => (
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
				</label>
			</div>
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
				<p className="form-error" data-tooltip={error.details}>
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
	entityTemplates: EntityTemplate[]
	initialActiveTab?: 'attributes' | 'links'
	formId: string
	modalKey: string
	onCreateAttributeTemplate: (
		input: CreateAttributeTemplateInput,
	) => Promise<AttributeTemplate>
	onOpenEntityTemplate: (
		entityTemplate: EntityTemplate,
		point: { clientX: number; clientY: number },
	) => void
	onSave: (input: CreateEntityTemplateInput) => Promise<void>
	onActiveTabChange?: (key: string, tab: 'attributes' | 'links') => void
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

interface IncludedEntityLink {
	id: string
	description: string
	listingIndex: number
	name: string
	targetEntityTemplateId: string
}

function EntityTemplateEditForm({
	accessLevels,
	attributeTemplates,
	autoFocusName = false,
	entityTemplate,
	entityTemplates,
	initialActiveTab = 'attributes',
	formId,
	modalKey,
	onCreateAttributeTemplate,
	onActiveTabChange,
	onOpenEntityTemplate,
	onSave,
	onValidityChange,
}: EntityTemplateEditFormProps) {
	const [activeTab, setActiveTab] = useState<'attributes' | 'links'>(
		initialActiveTab,
	)
	const selectableAccessLevels =
		getSelectableAttributeAccessLevels(accessLevels)
	const defaultAccessLevelId =
		getSelectableAttributeAccessLevelId(accessLevels)
	const [description, setDescription] = useState(
		entityTemplate?.description ?? '',
	)
	const [draggedAttributeId, setDraggedAttributeId] = useState<string | null>(
		null,
	)
	const draggedAttributeIdRef = useRef<string | null>(null)
	const attributesPanelRef = useRef<HTMLDivElement>(null)
	const formRef = useRef<HTMLFormElement>(null)
	const [error, setError] = useState<FormErrorState | null>(null)
	const [includedAttributes, setIncludedAttributes] = useState<
		IncludedEntityAttribute[]
	>(() =>
		entityTemplate
			? entityTemplate.attributes
					.slice()
					.sort(
						(left, right) => left.listingIndex - right.listingIndex,
					)
					.map((attribute, index) => ({
						id: attribute.id,
						accessLevelId: getSelectableAttributeAccessLevelId(
							accessLevels,
							attribute.accessLevelId,
						),
						attributeTemplateId: attribute.attributeTemplateId,
						description: attribute.description,
						listingIndex: index,
						name: attribute.name,
						valueType: attribute.valueType,
					}))
			: [],
	)
	const [includedLinks, setIncludedLinks] = useState<IncludedEntityLink[]>(
		() =>
			entityTemplate
				? entityTemplate.links
						.slice()
						.sort(
							(left, right) =>
								left.listingIndex - right.listingIndex,
						)
						.map((link, index) => ({
							description: link.description ?? '',
							id: link.id,
							listingIndex: index,
							name: link.name,
							targetEntityTemplateId: link.targetEntityTemplateId,
						}))
				: [],
	)
	const availableAttributeTemplates = attributeTemplates.filter(
		(attributeTemplate) =>
			!includedAttributes.some(
				(attribute) =>
					attribute.attributeTemplateId === attributeTemplate.id &&
					attribute.name === attributeTemplate.name &&
					attribute.description === attributeTemplate.description &&
					attribute.valueType === attributeTemplate.valueType,
			),
	)
	const availableLinkTargets = entityTemplates
	const [includeAttributeMode, setIncludeAttributeMode] = useState<
		'existing' | 'new'
	>('existing')
	const [isAttributesPanelScrollable, setIsAttributesPanelScrollable] =
		useState(false)
	const [isIncludeAttributeOpen, setIsIncludeAttributeOpen] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [draggedLinkId, setDraggedLinkId] = useState<string | null>(null)
	const draggedLinkIdRef = useRef<string | null>(null)
	const [newAttributeDescription, setNewAttributeDescription] = useState('')
	const [newAttributeName, setNewAttributeName] = useState('')
	const [newAttributeSaveAsTemplate, setNewAttributeSaveAsTemplate] =
		useState(false)
	const [newAttributeValueType, setNewAttributeValueType] =
		useState<ValueType>(ValueType.Text)
	const firstListingAttributeId = includedAttributes[0]?.id ?? ''
	const [selectedAttributeTemplateId, setSelectedAttributeTemplateId] =
		useState(availableAttributeTemplates[0]?.id ?? '')
	const [listingAttributeId, setListingAttributeId] = useState(
		entityTemplate?.listingAttributeId ?? firstListingAttributeId,
	)
	const [name, setName] = useState(entityTemplate?.name ?? '')
	const nameInputRef = useRef<HTMLInputElement>(null)
	const newAttributeNameInputRef = useRef<HTMLInputElement>(null)
	const previousAttributeRowTopsRef = useRef<Map<string, number>>(new Map())
	const previousLinkRowTopsRef = useRef<Map<string, number>>(new Map())
	const shouldAnimateAttributeRowsRef = useRef(false)
	const shouldAnimateLinkRowsRef = useRef(false)
	const isValid =
		name.trim().length > 0 &&
		includedAttributes.length > 0 &&
		listingAttributeId.length > 0 &&
		includedAttributes.every(
			(attribute) => attribute.name.trim().length > 0,
		) &&
		includedLinks.every(
			(link) =>
				link.name.trim().length > 0 &&
				availableLinkTargets.some(
					(target) => target.id === link.targetEntityTemplateId,
				),
		)
	const getAccessLevelName = (accessLevelId: number): string =>
		accessLevels.find((accessLevel) => accessLevel.id === accessLevelId)
			?.name ?? String(accessLevelId)
	const getLinkTargetName = (targetEntityTemplateId: string): string =>
		availableLinkTargets.find(
			(target) => target.id === targetEntityTemplateId,
		)?.name ?? targetEntityTemplateId

	useEffect(() => {
		onValidityChange(modalKey, isValid)
	}, [isValid, modalKey, onValidityChange])

	useEffect(() => {
		setActiveTab(initialActiveTab)
	}, [initialActiveTab])

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

	const changeActiveTab = useCallback(
		(tab: 'attributes' | 'links') => {
			setActiveTab(tab)
			onActiveTabChange?.(modalKey, tab)
		},
		[modalKey, onActiveTabChange],
	)

	useEffect(() => {
		function blurAccessLevelSelect(event: PointerEvent): void {
			const activeElement = document.activeElement
			const target = event.target

			if (
				activeElement instanceof HTMLSelectElement &&
				activeElement.closest('.entity-template-access-level-wrap') &&
				target instanceof Node &&
				!activeElement
					.closest('.entity-template-access-level-wrap')
					?.contains(target)
			) {
				activeElement.blur()
			}
		}

		document.addEventListener('pointerdown', blurAccessLevelSelect, true)

		return () => {
			document.removeEventListener(
				'pointerdown',
				blurAccessLevelSelect,
				true,
			)
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
	}, [firstListingAttributeId, includedAttributes, listingAttributeId])

	useEffect(() => {
		if (
			selectedAttributeTemplateId.length === 0 ||
			!availableAttributeTemplates.some(
				(attributeTemplate) =>
					attributeTemplate.id === selectedAttributeTemplateId,
			)
		) {
			setSelectedAttributeTemplateId(
				availableAttributeTemplates[0]?.id ?? '',
			)
		}
	}, [availableAttributeTemplates, selectedAttributeTemplateId])

	function getAttributeRowTops(): Map<string, number> {
		const rows = formRef.current?.querySelectorAll<HTMLTableRowElement>(
			'[data-entity-template-attribute-id]',
		)
		const rowTops = new Map<string, number>()

		rows?.forEach((row) => {
			const attributeId = row.dataset.entityTemplateAttributeId

			if (attributeId) {
				rowTops.set(attributeId, row.getBoundingClientRect().top)
			}
		})

		return rowTops
	}

	function getLinkRowTops(): Map<string, number> {
		const rows = formRef.current?.querySelectorAll<HTMLTableRowElement>(
			'[data-entity-template-link-id]',
		)
		const rowTops = new Map<string, number>()

		rows?.forEach((row) => {
			const linkId = row.dataset.entityTemplateLinkId

			if (linkId) {
				rowTops.set(linkId, row.getBoundingClientRect().top)
			}
		})

		return rowTops
	}

	useLayoutEffect(() => {
		const previousRowTops = previousAttributeRowTopsRef.current
		const nextRowTops = getAttributeRowTops()

		if (shouldAnimateAttributeRowsRef.current) {
			formRef.current
				?.querySelectorAll<HTMLTableRowElement>(
					'[data-entity-template-attribute-id]',
				)
				.forEach((row) => {
					const attributeId = row.dataset.entityTemplateAttributeId
					const previousTop = attributeId
						? previousRowTops.get(attributeId)
						: undefined
					const nextTop = attributeId
						? nextRowTops.get(attributeId)
						: undefined

					if (previousTop === undefined || nextTop === undefined) {
						return
					}

					const deltaY = previousTop - nextTop

					if (deltaY === 0) {
						return
					}

					row.getAnimations().forEach((animation) =>
						animation.cancel(),
					)
					row.animate(
						[
							{ transform: `translateY(${deltaY}px)` },
							{ transform: 'translateY(0)' },
						],
						{
							duration: 160,
							easing: 'cubic-bezier(0.2, 0, 0, 1)',
						},
					)
				})
		}

		shouldAnimateAttributeRowsRef.current = false
		previousAttributeRowTopsRef.current = nextRowTops
	}, [includedAttributes])

	useLayoutEffect(() => {
		const previousRowTops = previousLinkRowTopsRef.current
		const nextRowTops = getLinkRowTops()

		if (shouldAnimateLinkRowsRef.current) {
			formRef.current
				?.querySelectorAll<HTMLTableRowElement>(
					'[data-entity-template-link-id]',
				)
				.forEach((row) => {
					const linkId = row.dataset.entityTemplateLinkId
					const previousTop = linkId
						? previousRowTops.get(linkId)
						: undefined
					const nextTop = linkId ? nextRowTops.get(linkId) : undefined

					if (previousTop === undefined || nextTop === undefined) {
						return
					}

					const deltaY = previousTop - nextTop

					if (deltaY === 0) {
						return
					}

					row.getAnimations().forEach((animation) =>
						animation.cancel(),
					)
					row.animate(
						[
							{ transform: `translateY(${deltaY}px)` },
							{ transform: 'translateY(0)' },
						],
						{
							duration: 160,
							easing: 'cubic-bezier(0.2, 0, 0, 1)',
						},
					)
				})
		}

		shouldAnimateLinkRowsRef.current = false
		previousLinkRowTopsRef.current = nextRowTops
	}, [includedLinks])

	useLayoutEffect(() => {
		const panel = attributesPanelRef.current

		if (!panel || activeTab !== 'attributes') {
			setIsAttributesPanelScrollable(false)
			return
		}

		const currentPanel = panel

		function updateScrollableState(): void {
			const lastRow = currentPanel.querySelector<HTMLTableRowElement>(
				'[data-entity-template-attribute-id]:last-of-type',
			)

			if (!lastRow) {
				setIsAttributesPanelScrollable(false)
				return
			}

			const panelRect = currentPanel.getBoundingClientRect()
			const lastRowRect = lastRow.getBoundingClientRect()

			setIsAttributesPanelScrollable(
				lastRowRect.bottom > panelRect.bottom + 1,
			)
		}

		updateScrollableState()

		const resizeObserver = new ResizeObserver(updateScrollableState)
		resizeObserver.observe(currentPanel)

		const content = currentPanel.firstElementChild
		if (content) {
			resizeObserver.observe(content)
		}

		return () => {
			resizeObserver.disconnect()
		}
	}, [activeTab, includedAttributes])

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
					accessLevelId: getSelectableAttributeAccessLevelId(
						accessLevels,
						attributeTemplate.accessLevelId,
					),
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
						accessLevelId: defaultAccessLevelId,
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
					name:
						savedAttributeTemplate?.name ?? newAttributeName.trim(),
					valueType:
						savedAttributeTemplate?.valueType ??
						newAttributeValueType,
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
					error instanceof FormResponseError
						? error.details
						: undefined,
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
				.map((attribute, index) => ({
					...attribute,
					listingIndex: index,
				})),
		)
	}

	function addLink(): void {
		const targetEntityTemplateId = availableLinkTargets[0]?.id

		if (!targetEntityTemplateId) {
			return
		}

		setIncludedLinks((current) => [
			...current,
			{
				description: '',
				id: crypto.randomUUID(),
				listingIndex: current.length,
				name: '',
				targetEntityTemplateId,
			},
		])
	}

	function removeLink(linkId: string): void {
		setIncludedLinks((current) =>
			current.filter((link) => link.id !== linkId),
		)
	}

	function updateLinkDescription(linkId: string, description: string): void {
		setIncludedLinks((current) =>
			current.map((link) =>
				link.id === linkId ? { ...link, description } : link,
			),
		)
	}

	function updateLinkName(linkId: string, name: string): void {
		setIncludedLinks((current) =>
			current.map((link) =>
				link.id === linkId ? { ...link, name } : link,
			),
		)
	}

	function updateLinkTarget(
		linkId: string,
		targetEntityTemplateId: string,
	): void {
		setIncludedLinks((current) =>
			current.map((link) =>
				link.id === linkId ? { ...link, targetEntityTemplateId } : link,
			),
		)
	}

	function reorderLink(draggedLinkId: string, targetLinkId: string): void {
		if (draggedLinkId === targetLinkId) {
			return
		}

		previousLinkRowTopsRef.current = getLinkRowTops()
		shouldAnimateLinkRowsRef.current = true

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

	function setActiveDraggedLink(linkId: string | null): void {
		draggedLinkIdRef.current = linkId
		setDraggedLinkId(linkId)
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

	function updateAttributeName(attributeId: string, name: string): void {
		setIncludedAttributes((current) =>
			current.map((attribute) =>
				attribute.id === attributeId
					? {
							...attribute,
							description: attributeTemplates.some(
								(attributeTemplate) =>
									attributeTemplate.id ===
										attribute.attributeTemplateId &&
									attributeTemplate.name === name,
							)
								? attribute.description
								: '',
							name,
						}
					: attribute,
			),
		)
	}

	function updateAttributeValueType(
		attributeId: string,
		valueType: ValueType,
	): void {
		setIncludedAttributes((current) =>
			current.map((attribute) =>
				attribute.id === attributeId
					? { ...attribute, valueType }
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

		previousAttributeRowTopsRef.current = getAttributeRowTops()
		shouldAnimateAttributeRowsRef.current = true

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

	function getTableRowLayoutBounds(row: HTMLTableRowElement): {
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
		setActiveDraggedAttribute(attributeId)

		function move(pointerEvent: PointerEvent): void {
			const rows = Array.from(
				formRef.current?.querySelectorAll<HTMLTableRowElement>(
					'[data-entity-template-attribute-id]',
				) ?? [],
			)
			const draggedId = draggedAttributeIdRef.current
			const draggedIndex = rows.findIndex(
				(row) => row.dataset.entityTemplateAttributeId === draggedId,
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
					previousRect.height *
						(1 - entityTemplateAttributeReorderThreshold)

				if (pointerEvent.clientY < previousTriggerY) {
					const previousAttributeId =
						previousRow.dataset.entityTemplateAttributeId

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
					nextRect.height * entityTemplateAttributeReorderThreshold

				if (pointerEvent.clientY > nextTriggerY) {
					const nextAttributeId =
						nextRow.dataset.entityTemplateAttributeId

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
		setActiveDraggedLink(linkId)

		function move(pointerEvent: PointerEvent): void {
			const rows = Array.from(
				formRef.current?.querySelectorAll<HTMLTableRowElement>(
					'[data-entity-template-link-id]',
				) ?? [],
			)
			const draggedId = draggedLinkIdRef.current
			const draggedIndex = rows.findIndex(
				(row) => row.dataset.entityTemplateLinkId === draggedId,
			)

			if (!draggedId || draggedIndex < 0) {
				return
			}

			const previousRow = rows[draggedIndex - 1]
			const nextRow = rows[draggedIndex + 1]

			if (previousRow) {
				const previousRect = getTableRowLayoutBounds(previousRow)
				const previousTriggerY =
					previousRect.top +
					previousRect.height *
						(1 - entityTemplateAttributeReorderThreshold)

				if (pointerEvent.clientY < previousTriggerY) {
					const previousLinkId =
						previousRow.dataset.entityTemplateLinkId

					if (previousLinkId) {
						reorderLink(draggedId, previousLinkId)
					}

					return
				}
			}

			if (nextRow) {
				const nextRect = getTableRowLayoutBounds(nextRow)
				const nextTriggerY =
					nextRect.top +
					nextRect.height * entityTemplateAttributeReorderThreshold

				if (pointerEvent.clientY > nextTriggerY) {
					const nextLinkId = nextRow.dataset.entityTemplateLinkId

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
			setActiveDraggedLink(null)
		}

		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', stop)
		window.addEventListener('pointercancel', stop)
	}

	async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()

		if (!isValid) {
			setError({
				message:
					includedAttributes.length === 0
						? 'Include at least one attribute'
						: includedAttributes.some(
									(attribute) =>
										attribute.name.trim().length === 0,
							  )
							? 'Included attributes must have names'
							: includedLinks.some(
										(link) => link.name.trim().length === 0,
								  )
								? 'Links must have names'
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
					name: attribute.name.trim(),
					valueType: attribute.valueType,
				})),
				description,
				links: includedLinks.map((link, index) => ({
					id: link.id,
					description:
						link.description.trim().length > 0
							? link.description.trim()
							: null,
					listingIndex: index,
					name: link.name.trim(),
					targetEntityTemplateId: link.targetEntityTemplateId,
				})),
				listingAttributeId,
				name,
			})
		} catch (error) {
			setError({
				details:
					error instanceof FormResponseError
						? error.details
						: undefined,
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
			ref={formRef}
			className="entity-template-edit-form"
			id={formId}
			onSubmit={(event) => void submit(event)}
		>
			<div className="entity-template-fields">
				<label data-selectable="true">
					<span>name</span>
					<TemplateNameLookupInput
						closeAriaLabel="Close entity template matches"
						currentItemId={entityTemplate?.id}
						inputRef={nameInputRef}
						items={entityTemplates}
						minimumQueryLength={2}
						value={name}
						onChange={setName}
						onOpenItem={onOpenEntityTemplate}
					/>
				</label>
				<label data-selectable="true">
					<span>description</span>
					<textarea
						className="entity-template-description-input"
						rows={1}
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
								<option key={attribute.id} value={attribute.id}>
									{attribute.name}
								</option>
							))}
						</select>
					</span>
				</label>
			</div>

			<div className="entity-template-tabs" data-selectable="true">
				<div className="entity-template-tab-row">
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
							onClick={() => changeActiveTab('attributes')}
						>
							<span>Attributes</span>
							<span className="entity-template-tab-badge">
								{includedAttributes.length}
							</span>
						</button>
						<button
							aria-selected={activeTab === 'links'}
							className="entity-template-tab"
							data-tooltip="Outbound Links"
							role="tab"
							type="button"
							onClick={() => changeActiveTab('links')}
						>
							<span>Outlinks</span>
							<span className="entity-template-tab-badge">
								{includedLinks.length}
							</span>
						</button>
					</div>
				</div>

				{activeTab === 'attributes' ? (
					<div
						ref={attributesPanelRef}
						data-scrollable={
							isAttributesPanelScrollable || undefined
						}
						role="tabpanel"
					>
						<table className="data-table entity-template-modal-table entity-template-attributes-table">
							<colgroup>
								<col className="entity-template-attribute-name-column" />
								<col className="entity-template-attribute-value-type-column" />
								<col className="entity-template-attribute-access-level-column" />
								<col className="entity-template-attribute-action-column" />
							</colgroup>
							<thead>
								<tr>
									<th>name</th>
									<th>value type</th>
									<th>access level</th>
									<th className="entity-template-attributes-header-action-cell">
										<div
											className="include-attribute-action"
											data-no-drag="true"
										>
											<button
												aria-expanded={
													isIncludeAttributeOpen
												}
												aria-label="Add attribute"
												className="section-action-button"
												data-tooltip="Include an attribute"
												type="button"
												onClick={() =>
													setIsIncludeAttributeOpen(
														(current) => !current,
													)
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
														onClick={() =>
															setIsIncludeAttributeOpen(
																false,
															)
														}
													>
														<X aria-hidden="true" />
													</button>
													<div className="include-attribute-mode-tabs">
														<button
															aria-selected={
																includeAttributeMode ===
																'existing'
															}
															type="button"
															onClick={() =>
																setIncludeAttributeMode(
																	'existing',
																)
															}
														>
															Existing
														</button>
														<button
															aria-selected={
																includeAttributeMode ===
																'new'
															}
															type="button"
															onClick={() =>
																setIncludeAttributeMode(
																	'new',
																)
															}
														>
															New
														</button>
													</div>
													{includeAttributeMode ===
													'existing' ? (
														<div className="include-attribute-fields">
															<label>
																<span>
																	attribute
																	template
																</span>
																<span className="attribute-template-select-wrap">
																	<select
																		disabled={
																			availableAttributeTemplates.length ===
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
																		{availableAttributeTemplates.map(
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
																	availableAttributeTemplates.length ===
																	0
																}
																type="button"
																onClick={
																	includeExistingAttribute
																}
															>
																<Plus aria-hidden="true" />
															</button>
														</div>
													) : (
														<div className="include-attribute-fields">
															<label>
																<span>
																	name
																</span>
																<input
																	ref={
																		newAttributeNameInputRef
																	}
																	type="text"
																	value={
																		newAttributeName
																	}
																	onChange={(
																		event,
																	) =>
																		setNewAttributeName(
																			event
																				.target
																				.value,
																		)
																	}
																/>
															</label>
															<label>
																<span>
																	description
																</span>
																<textarea
																	rows={2}
																	value={
																		newAttributeDescription
																	}
																	onChange={(
																		event,
																	) =>
																		setNewAttributeDescription(
																			event
																				.target
																				.value,
																		)
																	}
																/>
															</label>
															<label>
																<span>
																	value type
																</span>
																<span className="attribute-template-select-wrap">
																	<select
																		value={
																			newAttributeValueType
																		}
																		onChange={(
																			event,
																		) =>
																			setNewAttributeValueType(
																				event
																					.target
																					.value as ValueType,
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
															</label>
															<label className="include-attribute-checkbox">
																<input
																	checked={
																		newAttributeSaveAsTemplate
																	}
																	type="checkbox"
																	onChange={(
																		event,
																	) =>
																		setNewAttributeSaveAsTemplate(
																			event
																				.target
																				.checked,
																		)
																	}
																/>
																<span>
																	save it as
																	attribute
																	template
																</span>
															</label>
															<button
																aria-label="Include"
																className="icon-only-button include-attribute-submit-button"
																data-tooltip="Include"
																disabled={
																	newAttributeName.trim()
																		.length ===
																	0
																}
																type="button"
																onClick={() =>
																	void includeNewAttribute()
																}
															>
																<Plus aria-hidden="true" />
															</button>
														</div>
													)}
												</div>
											) : null}
										</div>
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
											<span>There are no entries</span>
										</td>
									</tr>
								) : (
									includedAttributes.map(
										(includedAttribute) => (
											<tr
												key={includedAttribute.id}
												data-dragging={
													draggedAttributeId ===
														includedAttribute.id ||
													undefined
												}
												data-entity-template-attribute-id={
													includedAttribute.id
												}
											>
												<td
													className="entity-template-attribute-name"
													data-tooltip={
														includedAttribute.description ||
														undefined
													}
												>
													<input
														aria-label="Attribute name"
														className="entity-template-attribute-name-input"
														data-no-drag="true"
														type="text"
														value={
															includedAttribute.name
														}
														onChange={(event) =>
															updateAttributeName(
																includedAttribute.id,
																event.target
																	.value,
															)
														}
													/>
												</td>
												<td
													className="entity-template-value-type-cell"
													data-tooltip="Value type"
												>
													<span className="attribute-template-select-wrap entity-template-value-type-wrap">
														<select
															aria-label={`${includedAttribute.name} value type`}
															data-no-drag="true"
															value={
																includedAttribute.valueType
															}
															onChange={(event) =>
																updateAttributeValueType(
																	includedAttribute.id,
																	event.target
																		.value as ValueType,
																)
															}
														>
															{valueTypes.map(
																(valueType) => (
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
													<span
														className="attribute-template-select-wrap entity-template-access-level-wrap"
														data-tooltip="Access level"
													>
														<select
															aria-label={`${includedAttribute.name} access level`}
															data-no-drag="true"
															value={
																includedAttribute.accessLevelId
															}
															onChange={(event) =>
																updateAttributeAccessLevel(
																	includedAttribute.id,
																	Number(
																		event
																			.target
																			.value,
																	),
																)
															}
														>
															{selectableAccessLevels.length ===
															0 ? (
																<option
																	value={
																		includedAttribute.accessLevelId
																	}
																>
																	{
																		includedAttribute.accessLevelId
																	}
																</option>
															) : (
																selectableAccessLevels.map(
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
														aria-label={`Remove ${includedAttribute.name}`}
														className="icon-only-button"
														data-no-drag="true"
														data-tooltip="Exclude"
														type="button"
														onClick={() =>
															removeAttribute(
																includedAttribute.id,
															)
														}
													>
														<Trash2 aria-hidden="true" />
													</button>
													<button
														aria-label={`Drag ${includedAttribute.name}`}
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
																includedAttribute.id,
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
						<table className="data-table entity-template-modal-table entity-template-links-table">
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
									<th className="entity-template-links-header-action-cell">
										<div className="entity-template-links-header-action-inner">
											<button
												aria-label="Include link"
												className="section-action-button"
												data-tooltip={
													availableLinkTargets.length ===
													0
														? 'There are no entity templates\nto refer to in a link.'
														: 'Include link'
												}
												disabled={
													availableLinkTargets.length ===
													0
												}
												type="button"
												onClick={addLink}
											>
												<Plus aria-hidden="true" />
											</button>
										</div>
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
											<span>There are no entries</span>
										</td>
									</tr>
								) : (
									includedLinks.map((includedLink) => (
										<tr
											key={includedLink.id}
											data-dragging={
												draggedLinkId ===
													includedLink.id || undefined
											}
											data-entity-template-link-id={
												includedLink.id
											}
										>
											<td
												className="entity-template-link-name-cell"
												data-tooltip="Name"
											>
												<input
													aria-label="Link name"
													className="entity-template-link-input"
													data-no-drag="true"
													type="text"
													value={includedLink.name}
													onChange={(event) =>
														updateLinkName(
															includedLink.id,
															event.target.value,
														)
													}
												/>
											</td>
											<td
												className="entity-template-link-description-cell"
												data-tooltip="Description"
											>
												<input
													aria-label="Link description"
													className="entity-template-link-input"
													data-no-drag="true"
													type="text"
													value={
														includedLink.description
													}
													onChange={(event) =>
														updateLinkDescription(
															includedLink.id,
															event.target.value,
														)
													}
												/>
											</td>
											<td>
												<span
													className="attribute-template-select-wrap entity-template-link-target-wrap"
													data-tooltip={getLinkTargetName(
														includedLink.targetEntityTemplateId,
													)}
												>
													<select
														aria-label={`${includedLink.name || 'Link'} target entity template`}
														data-no-drag="true"
														value={
															includedLink.targetEntityTemplateId
														}
														onChange={(event) =>
															updateLinkTarget(
																includedLink.id,
																event.target
																	.value,
															)
														}
													>
														{availableLinkTargets.map(
															(target) => (
																<option
																	key={
																		target.id
																	}
																	value={
																		target.id
																	}
																>
																	{
																		target.name
																	}
																</option>
															),
														)}
													</select>
												</span>
											</td>
											<td className="entity-template-link-actions">
												<button
													aria-label={`Remove ${includedLink.name || 'link'}`}
													className="icon-only-button"
													data-no-drag="true"
													data-tooltip="Exclude"
													type="button"
													onClick={() =>
														removeLink(
															includedLink.id,
														)
													}
												>
													<Trash2 aria-hidden="true" />
												</button>
												<button
													aria-label={`Drag ${includedLink.name || 'link'}`}
													className="icon-only-button entity-template-drag-handle"
													data-no-drag="true"
													data-tooltip={
														'Drag up or down\nto reorder'
													}
													type="button"
													onPointerDown={(event) =>
														startLinkPointerDrag(
															event,
															includedLink.id,
														)
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
				)}
			</div>

			{error ? (
				<p className="form-error" data-tooltip={error.details}>
					{error.message}
				</p>
			) : null}
			{isSaving ? <p className="form-status">Saving</p> : null}
		</form>
	)
}

interface EntityTemplateDetailsViewProps {
	accessLevels: AccessLevel[]
	entityTemplate: EntityTemplate
	entityTemplates: EntityTemplate[]
	initialActiveTab?: 'attributes' | 'links' | 'inlinks'
	onActiveTabChange?: (tab: 'attributes' | 'links' | 'inlinks') => void
	onOpenEntityTemplate: (
		entityTemplate: EntityTemplate,
		point: { clientX: number; clientY: number },
	) => void
}

function LinkDescriptionValue({ description }: { description: string | null }) {
	const descriptionRef = useRef<HTMLSpanElement>(null)
	const [isTrimmed, setIsTrimmed] = useState(false)
	const descriptionValue = description ?? ''

	useLayoutEffect(() => {
		const element = descriptionRef.current

		if (!element) {
			setIsTrimmed(false)
			return
		}

		const measuredElement = element

		function updateTrimmedState(): void {
			setIsTrimmed(
				measuredElement.scrollWidth > measuredElement.clientWidth,
			)
		}

		updateTrimmedState()

		const resizeObserver = new ResizeObserver(updateTrimmedState)
		resizeObserver.observe(measuredElement)

		return () => {
			resizeObserver.disconnect()
		}
	}, [descriptionValue])

	return (
		<td
			className="entity-template-link-description-value"
			data-tooltip={isTrimmed ? descriptionValue : undefined}
		>
			<span ref={descriptionRef}>{descriptionValue}</span>
		</td>
	)
}

function AttributeTemplateDescriptionValue({
	description,
}: {
	description: string
}) {
	const descriptionRef = useRef<HTMLSpanElement>(null)
	const [isTrimmed, setIsTrimmed] = useState(false)

	useLayoutEffect(() => {
		const element = descriptionRef.current

		if (!element) {
			setIsTrimmed(false)
			return
		}

		const measuredElement = element

		function updateTrimmedState(): void {
			setIsTrimmed(
				measuredElement.scrollWidth > measuredElement.clientWidth,
			)
		}

		updateTrimmedState()

		const resizeObserver = new ResizeObserver(updateTrimmedState)
		resizeObserver.observe(measuredElement)

		return () => {
			resizeObserver.disconnect()
		}
	}, [description])

	return (
		<td
			className="attribute-template-description-value"
			data-tooltip={isTrimmed ? description : undefined}
		>
			<span ref={descriptionRef}>{description}</span>
		</td>
	)
}

function EntityTemplateDetailsView({
	accessLevels,
	entityTemplate,
	entityTemplates,
	initialActiveTab = 'attributes',
	onActiveTabChange,
	onOpenEntityTemplate,
}: EntityTemplateDetailsViewProps) {
	const [activeTab, setActiveTab] = useState<
		'attributes' | 'links' | 'inlinks'
	>(initialActiveTab)
	const orderedAttributes = entityTemplate.attributes
		.slice()
		.sort((left, right) => left.listingIndex - right.listingIndex)
	const orderedLinks = entityTemplate.links
		.slice()
		.sort((left, right) => left.listingIndex - right.listingIndex)
	const incomingLinks = entityTemplates
		.flatMap((sourceTemplate) =>
			sourceTemplate.links
				.filter(
					(link) => link.targetEntityTemplateId === entityTemplate.id,
				)
				.map((link) => ({
					link,
					sourceTemplate,
				})),
		)
		.sort((left, right) => {
			const sourceNameComparison = left.sourceTemplate.name.localeCompare(
				right.sourceTemplate.name,
			)

			if (sourceNameComparison !== 0) {
				return sourceNameComparison
			}

			return left.link.listingIndex - right.link.listingIndex
		})
	const getLinkedEntityTemplate = useCallback(
		(targetEntityTemplateId: string) =>
			entityTemplates.find(
				(candidate) => candidate.id === targetEntityTemplateId,
			) ?? null,
		[entityTemplates],
	)

	function openReferencedEntityTemplate(
		referencedEntityTemplate: EntityTemplate,
		event: ReactMouseEvent<HTMLButtonElement>,
	): void {
		event.stopPropagation()
		onOpenEntityTemplate(referencedEntityTemplate, {
			clientX: event.clientX,
			clientY: event.clientY,
		})
	}

	useEffect(() => {
		setActiveTab(initialActiveTab)
	}, [initialActiveTab])

	const changeActiveTab = useCallback(
		(tab: 'attributes' | 'links' | 'inlinks') => {
			setActiveTab(tab)
			onActiveTabChange?.(tab)
		},
		[onActiveTabChange],
	)

	return (
		<div
			className="entity-template-edit-form entity-template-view-form access-level-details"
			data-selectable="true"
		>
			<div className="entity-template-fields">
				<label>
					<span>name</span>
					<input readOnly type="text" value={entityTemplate.name} />
				</label>
				<label>
					<span>description</span>
					<textarea
						className="entity-template-description-input"
						readOnly
						rows={1}
						value={entityTemplate.description}
					/>
				</label>
				<label>
					<span>listing attribute</span>
					<span className="attribute-template-select-wrap">
						<select
							disabled
							value={entityTemplate.listingAttributeId}
						>
							{orderedAttributes.map((attribute) => (
								<option key={attribute.id} value={attribute.id}>
									{attribute.name}
								</option>
							))}
						</select>
					</span>
				</label>
			</div>

			<div className="entity-template-tabs">
				<div className="entity-template-tab-row">
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
							onClick={() => changeActiveTab('attributes')}
						>
							<span>Attributes</span>
							<span className="entity-template-tab-badge">
								{orderedAttributes.length}
							</span>
						</button>
						<button
							aria-selected={activeTab === 'links'}
							className="entity-template-tab"
							data-tooltip="Outbound Links"
							role="tab"
							type="button"
							onClick={() => changeActiveTab('links')}
						>
							<span>Outlinks</span>
							<span className="entity-template-tab-badge">
								{orderedLinks.length}
							</span>
						</button>
						{incomingLinks.length > 0 ? (
							<button
								aria-selected={activeTab === 'inlinks'}
								className="entity-template-tab"
								data-tooltip="Incoming links"
								role="tab"
								type="button"
								onClick={() => changeActiveTab('inlinks')}
							>
								<span>Inlinks</span>
								<span className="entity-template-tab-badge">
									{incomingLinks.length}
								</span>
							</button>
						) : null}
					</div>
				</div>

				{activeTab === 'attributes' ? (
					<div role="tabpanel">
						<table className="data-table entity-template-modal-table entity-template-attributes-table entity-template-view-attributes-table">
							<colgroup>
								<col className="entity-template-attribute-name-column" />
								<col className="entity-template-attribute-value-type-column" />
								<col className="entity-template-attribute-access-level-column" />
							</colgroup>
							<thead>
								<tr>
									<th>name</th>
									<th>value type</th>
									<th>access level</th>
								</tr>
							</thead>
							<tbody>
								{orderedAttributes.length === 0 ? (
									<tr>
										<td
											className="data-table-empty-cell"
											colSpan={3}
										>
											<span>There are no entries</span>
										</td>
									</tr>
								) : (
									orderedAttributes.map((attribute) => (
										<tr key={attribute.id}>
											<td
												className="entity-template-attribute-name"
												data-tooltip={
													attribute.description ||
													undefined
												}
											>
												{attribute.name}
											</td>
											<td
												className="entity-template-value-type-cell"
												data-tooltip="Value type"
											>
												{attribute.valueType}
											</td>
											<td>
												{accessLevels.find(
													(accessLevel) =>
														accessLevel.id ===
														attribute.accessLevelId,
												)?.name ??
													attribute.accessLevelId}
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				) : activeTab === 'links' ? (
					<div role="tabpanel">
						<table className="data-table entity-template-modal-table entity-template-links-table entity-template-view-links-table">
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
											<span>There are no entries</span>
										</td>
									</tr>
								) : (
									orderedLinks.map((link) => {
										const targetEntityTemplate =
											getLinkedEntityTemplate(
												link.targetEntityTemplateId,
											)

										return (
											<tr key={link.id}>
												<td>{link.name}</td>
												<LinkDescriptionValue
													description={
														link.description
													}
												/>
												<td>
													{targetEntityTemplate ? (
														<button
															aria-label={`Open entity template ${targetEntityTemplate.name}`}
															className="entity-reference-button"
															type="button"
															onClick={(event) =>
																openReferencedEntityTemplate(
																	targetEntityTemplate,
																	event,
																)
															}
														>
															<span>
																{
																	targetEntityTemplate.name
																}
															</span>
															<ExternalLink aria-hidden="true" />
														</button>
													) : (
														link.targetEntityTemplateId
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
						<table className="data-table entity-template-modal-table entity-template-links-table entity-template-view-inlinks-table">
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
								{incomingLinks.map(
									({ link, sourceTemplate }) => (
										<tr
											key={`${sourceTemplate.id}:${link.id}`}
										>
											<td>
												<button
													aria-label={`Open entity template ${sourceTemplate.name}`}
													className="entity-reference-button"
													type="button"
													onClick={(event) =>
														openReferencedEntityTemplate(
															sourceTemplate,
															event,
														)
													}
												>
													<span>
														{sourceTemplate.name}
													</span>
													<ExternalLink aria-hidden="true" />
												</button>
											</td>
											<td>{link.name}</td>
											<LinkDescriptionValue
												description={link.description}
											/>
										</tr>
									),
								)}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	)
}

export function TemplatesView() {
	const [storedAuth, setStoredAuth] = useState(getStoredAuth)
	const [accessLevels, setAccessLevels] = useState<AccessLevel[]>([])
	const [attributeTemplates, setAttributeTemplates] = useState<
		AttributeTemplate[]
	>([])
	const [entityTemplates, setEntityTemplates] = useState<EntityTemplate[]>([])
	const [entityTemplatesError, setEntityTemplatesError] = useState<
		string | null
	>(null)
	const [isLoadingEntityTemplates, setIsLoadingEntityTemplates] =
		useState(true)
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
	const isAuthenticated = storedAuth !== null
	const canManageOwnData = hasStoredPermission(
		storedAuth,
		PermissionName.ManageOwnData,
	)
	const canManageTemplates =
		hasStoredPermission(storedAuth, PermissionName.Admin) ||
		hasStoredPermission(storedAuth, PermissionName.Editor)
	const canCreateManagedData = canManageTemplates || canManageOwnData
	const isAuthorized =
		canCreateManagedData ||
		hasStoredPermission(storedAuth, PermissionName.Viewer)

	const loadAccessLevels = useCallback(async (): Promise<void> => {
		const requestId = accessLevelsLoadRequestId.current + 1
		accessLevelsLoadRequestId.current = requestId

		try {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.accessLevels}`,
				{
					headers: getAuthHeaders(),
				},
			)

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

			if (isMountedRef.current && requestId === loadRequestId.current) {
				setAttributeTemplates(sortTemplatesByName(data.data))
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
		function syncAuthState(): void {
			setStoredAuth(getStoredAuth())
		}

		window.addEventListener(authChangedEventName, syncAuthState)
		window.addEventListener('storage', syncAuthState)

		return () => {
			window.removeEventListener(authChangedEventName, syncAuthState)
			window.removeEventListener('storage', syncAuthState)
		}
	}, [])

	useEffect(() => {
		isMountedRef.current = true

		if (!isAuthorized) {
			return () => {
				isMountedRef.current = false
			}
		}

		void loadAccessLevels()
		void loadAttributeTemplates()
		void loadEntityTemplates()

		return () => {
			isMountedRef.current = false
		}
	}, [
		isAuthorized,
		loadAccessLevels,
		loadAttributeTemplates,
		loadEntityTemplates,
	])

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

	const setModalFormValidity = useCallback(
		(key: string, isValid: boolean) => {
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
		},
		[],
	)

	const updateAttributeTemplateInState = useCallback(
		(attributeTemplate: AttributeTemplate) => {
			setAttributeTemplates((current) =>
				sortTemplatesByName(
					current.map((item) =>
						item.id === attributeTemplate.id
							? attributeTemplate
							: item,
					),
				),
			)
			setOpenModals((current) =>
				current.map((modal) =>
					modal.attributeTemplate?.id === attributeTemplate.id
						? { ...modal, attributeTemplate, mode: 'details' }
						: modal,
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
						...getAuthHeaders(),
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
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.attributeTemplates}`,
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
				throw new FormResponseError(
					await getResponseErrorMessage(
						response,
						'Unable to create attribute template',
					),
				)
			}

			const data = (await response.json()) as AttributeTemplateResponse
			setAttributeTemplates((current) =>
				sortTemplatesByName([...current, data.data]),
			)
			setOpenModals((current) =>
				current.filter(
					(modal) => modal.key !== 'attribute-template-create',
				),
			)
			return data.data
		},
		[],
	)

	const createEntityTemplate = useCallback(
		async (input: CreateEntityTemplateInput) => {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.entityTemplates}`,
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
				current.filter(
					(modal) => modal.key !== 'entity-template-create',
				),
			)
		},
		[],
	)

	const updateEntityTemplateInState = useCallback(
		(entityTemplate: EntityTemplate) => {
			setEntityTemplates((current) =>
				current.map((item) =>
					item.id === entityTemplate.id ? entityTemplate : item,
				),
			)
			setOpenModals((current) =>
				current.map((modal) =>
					modal.entityTemplate?.id === entityTemplate.id
						? { ...modal, entityTemplate, mode: 'details' }
						: modal,
				),
			)
		},
		[],
	)

	const saveEntityTemplate = useCallback(
		async (id: string, input: UpdateEntityTemplateInput) => {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.entityTemplate(id)}`,
				{
					body: JSON.stringify(input),
					headers: {
						...getAuthHeaders(),
						'Content-Type': 'application/json',
					},
					method: 'PATCH',
				},
			)

			if (!response.ok) {
				throw new FormResponseError(
					await getResponseErrorMessage(
						response,
						'Unable to save entity template',
					),
				)
			}

			const data = (await response.json()) as EntityTemplateResponse
			updateEntityTemplateInState(data.data)
		},
		[updateEntityTemplateInState],
	)

	const deleteAttributeTemplate = useCallback(
		async (attributeTemplate: AttributeTemplate) => {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.attributeTemplate(attributeTemplate.id)}`,
				{
					headers: getAuthHeaders(),
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
					(modal) =>
						modal.attributeTemplate?.id !== attributeTemplate.id,
				),
			)
		},
		[],
	)

	const deleteEntityTemplate = useCallback(
		async (entityTemplate: EntityTemplate) => {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.entityTemplate(entityTemplate.id)}`,
				{
					headers: getAuthHeaders(),
					method: 'DELETE',
				},
			)

			if (!response.ok) {
				throw new Error('Unable to delete entity template')
			}

			setEntityTemplates((current) =>
				current.filter((item) => item.id !== entityTemplate.id),
			)
			setOpenModals((current) =>
				current.filter(
					(modal) => modal.entityTemplate?.id !== entityTemplate.id,
				),
			)
		},
		[],
	)

	const openEntityTemplate = useCallback(
		(
			entityTemplate: EntityTemplate,
			point: { clientX: number; clientY: number },
		) => {
			nextZIndex.current += 1
			setOpenModals((current) => {
				const existing = current.find(
					(modal) => modal.entityTemplate?.id === entityTemplate.id,
				)

				if (existing) {
					return current.map((modal) =>
						modal.key === existing.key
							? { ...modal, zIndex: nextZIndex.current }
							: modal,
					)
				}

				const modalWidth = Math.min(
					entityTemplateModalWidth,
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
					window.innerHeight -
						entityTemplateModalHeight -
						draggableModalMargin,
				)

				return [
					...current,
					{
						attributeTemplate: null,
						entityTemplate,
						entityTemplateActiveTab: 'attributes',
						initialPosition: { x, y },
						key: `entity-template-${entityTemplate.id}`,
						mode: 'details',
						templateType: 'entity',
						zIndex: nextZIndex.current,
					},
				]
			})
		},
		[],
	)

	const setEntityTemplateActiveTab = useCallback(
		(key: string, activeTab: 'attributes' | 'links' | 'inlinks') => {
			setOpenModals((current) =>
				current.map((modal) =>
					modal.key === key
						? { ...modal, entityTemplateActiveTab: activeTab }
						: modal,
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
					(modal) =>
						modal.attributeTemplate?.id === attributeTemplate.id,
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
					window.innerHeight -
						draggableModalHeight -
						draggableModalMargin,
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
			if (!canCreateManagedData) {
				return
			}

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
								window.innerHeight -
									draggableModalHeight -
									draggableModalMargin,
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
		[canCreateManagedData],
	)

	const openCreateEntityTemplate = useCallback(
		(point: { clientX: number; clientY: number }) => {
			if (!canCreateManagedData) {
				return
			}

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
								window.innerWidth -
									entityTemplateModalWidth -
									draggableModalMargin,
							),
							y: clampToRange(
								point.clientY + 10,
								draggableModalMargin,
								window.innerHeight -
									entityTemplateModalHeight -
									draggableModalMargin,
							),
						},
						key: 'entity-template-create',
						mode: 'create',
						templateType: 'entity',
						zIndex: nextZIndex.current,
					},
				]
			})
		},
		[canCreateManagedData],
	)

	if (!isAuthorized) {
		return (
			<section className="types-mgmt-view">
				<div className="access-level-unavailable" role="status">
					<p>
						{isAuthenticated
							? 'You are not authorized to access this section.'
							: 'You must be authenticated to access this section.'}
					</p>
				</div>
			</section>
		)
	}

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
					<div className="data-table-wrap templates-table-wrap">
						<table className="data-table entity-templates-table">
							<thead>
								<tr>
									<th>name</th>
									<th>description</th>
									<th className="data-table-action-heading">
										{canCreateManagedData ? (
											<button
												aria-label="Create entity template"
												className="section-action-button"
												data-tooltip="Add an entity template"
												type="button"
												onClick={(event) =>
													openCreateEntityTemplate(
														event,
													)
												}
											>
												<Plus aria-hidden="true" />
											</button>
										) : null}
									</th>
								</tr>
							</thead>
							<tbody>
								{isLoadingEntityTemplates ? (
									<tr>
										<td colSpan={3}>
											Loading entity templates
										</td>
									</tr>
								) : entityTemplates.length === 0 ? (
									<tr>
										<td
											className="data-table-empty-cell"
											colSpan={3}
										>
											<span>There are no entries</span>
										</td>
									</tr>
								) : (
									entityTemplates.map((entityTemplate) => (
										<tr
											key={entityTemplate.id}
											className="data-table-row"
											tabIndex={0}
											onClick={(
												event: ReactMouseEvent<HTMLTableRowElement>,
											) =>
												openEntityTemplate(
													entityTemplate,
													event,
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
													openEntityTemplate(
														entityTemplate,
														{
															clientX: rect.left,
															clientY: rect.top,
														},
													)
												}
											}}
										>
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
					<div className="data-table-wrap templates-table-wrap">
						<table className="data-table attribute-templates-table">
							<thead>
								<tr>
									<th>name</th>
									<th>description</th>
									<th>value type</th>
									<th className="data-table-action-heading">
										{canCreateManagedData ? (
											<button
												aria-label="Create attribute template"
												className="section-action-button"
												data-tooltip="Add an attribute template"
												type="button"
												onClick={(event) =>
													openCreateAttributeTemplate(
														event,
													)
												}
											>
												<Plus aria-hidden="true" />
											</button>
										) : null}
									</th>
								</tr>
							</thead>
							<tbody>
								{isLoading ? (
									<tr>
										<td colSpan={4}>
											Loading attribute templates
										</td>
									</tr>
								) : attributeTemplates.length === 0 ? (
									<tr>
										<td
											className="data-table-empty-cell"
											colSpan={4}
										>
											<span>There are no entries</span>
										</td>
									</tr>
								) : (
									attributeTemplates.map(
										(attributeTemplate) => (
											<tr
												key={attributeTemplate.id}
												className="data-table-row"
												tabIndex={0}
												onClick={(
													event: ReactMouseEvent<HTMLTableRowElement>,
												) =>
													openAttributeTemplate(
														attributeTemplate,
														event,
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
														openAttributeTemplate(
															attributeTemplate,
															{
																clientX:
																	rect.left,
																clientY:
																	rect.top,
															},
														)
													}
												}}
											>
												<td>
													{attributeTemplate.name}
												</td>
												<AttributeTemplateDescriptionValue
													description={
														attributeTemplate.description
													}
												/>
												<td>
													{
														attributeTemplate.valueType
													}
												</td>
												<td aria-hidden="true" />
											</tr>
										),
									)
								)}
							</tbody>
						</table>
					</div>
				)}
			</div>
			<div className="draggable-modal-layer">
				{openModals.map((modal) => {
					const canManageModal =
						canManageTemplates ||
						(canManageOwnData &&
							(modal.entityTemplate?.ownerUserId ??
								modal.attributeTemplate?.ownerUserId) ===
								storedAuth?.user.id)

					return (
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
								(modal.mode === 'create' ||
									modal.mode === 'edit') &&
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
								const modal = openModals.find(
									(item) => item.key === key,
								)

								if (modal?.mode === 'create') {
									closeModal(key)
									return
								}

								setModalMode(key, 'details')
							}}
							onClose={closeModal}
							onDelete={() => {
								if (!canManageModal) {
									return
								}

								if (modal.entityTemplate) {
									void deleteEntityTemplate(
										modal.entityTemplate,
									)
								} else if (modal.attributeTemplate) {
									void deleteAttributeTemplate(
										modal.attributeTemplate,
									)
								}
							}}
							onEdit={(key) => setModalMode(key, 'edit')}
							canEdit={canManageModal}
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
							infoText={
								modal.entityTemplate?.id ??
								modal.attributeTemplate?.id ??
								undefined
							}
							zIndex={modal.zIndex}
						>
							{modal.templateType === 'entity' &&
							modal.mode === 'create' ? (
								<EntityTemplateEditForm
									accessLevels={accessLevels}
									attributeTemplates={attributeTemplates}
									autoFocusName
									entityTemplates={entityTemplates}
									initialActiveTab={
										modal.entityTemplateActiveTab ===
										'links'
											? 'links'
											: 'attributes'
									}
									formId={`${modal.key}-edit-form`}
									modalKey={modal.key}
									onCreateAttributeTemplate={
										createAttributeTemplate
									}
									onActiveTabChange={
										setEntityTemplateActiveTab
									}
									onOpenEntityTemplate={openEntityTemplate}
									onSave={createEntityTemplate}
									onValidityChange={setModalFormValidity}
								/>
							) : modal.templateType === 'entity' &&
							  modal.mode === 'edit' &&
							  modal.entityTemplate ? (
								<EntityTemplateEditForm
									accessLevels={accessLevels}
									attributeTemplates={attributeTemplates}
									autoFocusName
									entityTemplate={modal.entityTemplate}
									entityTemplates={entityTemplates}
									initialActiveTab={
										modal.entityTemplateActiveTab ===
										'links'
											? 'links'
											: 'attributes'
									}
									formId={`${modal.key}-edit-form`}
									modalKey={modal.key}
									onCreateAttributeTemplate={
										createAttributeTemplate
									}
									onActiveTabChange={
										setEntityTemplateActiveTab
									}
									onOpenEntityTemplate={openEntityTemplate}
									onSave={(input) => {
										const entityTemplate =
											modal.entityTemplate

										if (!entityTemplate) {
											return Promise.resolve()
										}

										return saveEntityTemplate(
											entityTemplate.id,
											input,
										)
									}}
									onValidityChange={setModalFormValidity}
								/>
							) : modal.mode === 'create' ? (
								<AttributeTemplateEditForm
									accessLevels={accessLevels}
									attributeTemplates={attributeTemplates}
									autoFocusName
									formId={`${modal.key}-edit-form`}
									modalKey={modal.key}
									onOpenAttributeTemplate={
										openAttributeTemplate
									}
									onSave={createAttributeTemplate}
									onValidityChange={setModalFormValidity}
								/>
							) : modal.mode === 'edit' &&
							  modal.attributeTemplate ? (
								<AttributeTemplateEditForm
									accessLevels={accessLevels}
									attributeTemplate={modal.attributeTemplate}
									attributeTemplates={attributeTemplates}
									autoFocusName
									formId={`${modal.key}-edit-form`}
									modalKey={modal.key}
									onOpenAttributeTemplate={
										openAttributeTemplate
									}
									onSave={(input) => {
										const attributeTemplate =
											modal.attributeTemplate

										if (!attributeTemplate) {
											return Promise.resolve()
										}

										return saveAttributeTemplate(
											attributeTemplate.id,
											input,
										)
									}}
									onValidityChange={setModalFormValidity}
								/>
							) : modal.entityTemplate ? (
								<EntityTemplateDetailsView
									accessLevels={accessLevels}
									entityTemplate={modal.entityTemplate}
									entityTemplates={entityTemplates}
									initialActiveTab={
										modal.entityTemplateActiveTab
									}
									onActiveTabChange={(tab) =>
										setEntityTemplateActiveTab(
											modal.key,
											tab,
										)
									}
									onOpenEntityTemplate={openEntityTemplate}
								/>
							) : modal.attributeTemplate ? (
								<div className="access-level-details access-level-edit-form attribute-template-view-form">
									<label data-selectable="true">
										<span>name</span>
										<input
											readOnly
											type="text"
											value={modal.attributeTemplate.name}
										/>
									</label>
									<label data-selectable="true">
										<span>description</span>
										<textarea
											className="attribute-template-description-input"
											readOnly
											rows={1}
											value={
												modal.attributeTemplate
													.description
											}
										/>
									</label>
									<div className="attribute-template-detail-pair-row">
										<label data-selectable="true">
											<span>value type</span>
											<span className="attribute-template-select-wrap">
												<select
													disabled
													value={
														modal.attributeTemplate
															.valueType
													}
												>
													<option
														value={
															modal
																.attributeTemplate
																.valueType
														}
													>
														{
															modal
																.attributeTemplate
																.valueType
														}
													</option>
												</select>
											</span>
										</label>
										<label data-selectable="true">
											<span>access level</span>
											<span className="attribute-template-select-wrap">
												<select
													disabled
													value={
														modal.attributeTemplate
															.accessLevelId
													}
												>
													<option
														value={
															modal
																.attributeTemplate
																.accessLevelId
														}
													>
														{accessLevels.find(
															(accessLevel) =>
																accessLevel.id ===
																modal
																	.attributeTemplate
																	?.accessLevelId,
														)?.name ??
															modal
																.attributeTemplate
																.accessLevelId}
													</option>
												</select>
											</span>
										</label>
									</div>
									<label data-selectable="true">
										<span>default value</span>
										<input
											readOnly
											type="text"
											value={
												modal.attributeTemplate
													.defaultValue ?? ''
											}
										/>
									</label>
									<label
										className="attribute-template-checkbox-label attribute-template-readonly-checkbox"
										data-selectable="true"
									>
										<input
											checked={
												modal.attributeTemplate
													.isRequired
											}
											disabled
											readOnly
											type="checkbox"
										/>
										<span>required</span>
									</label>
								</div>
							) : null}
						</DraggableModal>
					)
				})}
			</div>
		</section>
	)
}
