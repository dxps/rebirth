import {
	apiRoutes,
	type ApiErrorResponse,
	type AttributeTemplate,
	type AttributeTemplateResponse,
	type AttributeTemplatesResponse,
	type CreateAttributeTemplateInput,
	type UpdateAttributeTemplateInput,
	ValueType,
	valueTypes,
} from '@rebirth/shared'
import { ArrowLeft, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'
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
const draggableModalMinHeights: Record<OpenAttributeTemplateModal['mode'], number> = {
	create: 372,
	details: 300,
	edit: 372,
}
const draggableModalMinWidth = 320
const draggableModalDefaultWidth = 360

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

interface OpenAttributeTemplateModal {
	attributeTemplate: AttributeTemplate | null
	initialPosition: {
		x: number
		y: number
	}
	key: string
	mode: 'create' | 'details' | 'edit'
	zIndex: number
}

interface DraggableModalProps {
	children: ReactNode
	id: string
	initialPosition: {
		x: number
		y: number
	}
	isSaveDisabled?: boolean
	mode: OpenAttributeTemplateModal['mode']
	onActivate: (id: string) => void
	onBack: (id: string) => void
	onClose: (id: string) => void
	onDelete: (id: string) => void
	onEdit: (id: string) => void
	title: string
	zIndex: number
}

function clampToRange(value: number, min: number, max: number) {
	return Math.max(min, Math.min(value, max))
}

function getAttributeTemplateModalTitle(mode: OpenAttributeTemplateModal['mode']) {
	if (mode === 'create') {
		return 'Attribute Template :: New'
	}

	if (mode === 'edit') {
		return 'Attribute Template :: Edit'
	}

	return 'Attribute Template'
}

function DraggableModal({
	children,
	id,
	initialPosition,
	isSaveDisabled = false,
	mode,
	onActivate,
	onBack,
	onClose,
	onDelete,
	onEdit,
	title,
	zIndex,
}: DraggableModalProps) {
	const [position, setPosition] = useState(initialPosition)
	const [size, setSize] = useState({
		height: draggableModalHeight,
		width: Math.min(
			draggableModalDefaultWidth,
			Math.max(draggableModalMinWidth, window.innerWidth * 0.86),
		),
	})
	const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
	const minHeight = draggableModalMinHeights[mode]
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

	const saveTooltip = isSaveDisabled
		? 'An attribute template must have a name'
		: 'Save'
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
	) => Promise<void>
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

export function TypesMgmtView() {
	const [attributeTemplates, setAttributeTemplates] = useState<
		AttributeTemplate[]
	>([])
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [openModals, setOpenModals] = useState<OpenAttributeTemplateModal[]>([])
	const [validFormModalIds, setValidFormModalIds] = useState<Set<string>>(
		() => new Set(),
	)
	const isMountedRef = useRef(false)
	const loadRequestId = useRef(0)
	const nextZIndex = useRef(1)

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

	useEffect(() => {
		isMountedRef.current = true

		void loadAttributeTemplates()

		return () => {
			isMountedRef.current = false
		}
	}, [loadAttributeTemplates])

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
		(key: string, mode: OpenAttributeTemplateModal['mode']) => {
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
						initialPosition: { x, y },
						key: `attribute-template-${attributeTemplate.id}`,
						mode: 'details',
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
						zIndex: nextZIndex.current,
					},
				]
			})
		},
		[],
	)

	return (
		<section className="types-mgmt-view">
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
									<td colSpan={4}>No attribute templates found</td>
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
			<div className="draggable-modal-layer">
				{openModals.map((modal) => (
					<DraggableModal
						key={modal.key}
						id={modal.key}
						initialPosition={modal.initialPosition}
						isSaveDisabled={
							(modal.mode === 'create' || modal.mode === 'edit') &&
							!validFormModalIds.has(modal.key)
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
						title={getAttributeTemplateModalTitle(modal.mode)}
						zIndex={modal.zIndex}
					>
						{modal.mode === 'create' ? (
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
