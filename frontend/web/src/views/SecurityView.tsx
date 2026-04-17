import {
	apiRoutes,
	type AccessLevel,
	type AccessLevelResponse,
	type AccessLevelsResponse,
	type CreateAccessLevelInput,
	type UpdateAccessLevelInput,
} from '@rebirth/shared'
import { ArrowLeft, Pencil, Plus, Save, Trash2 } from 'lucide-react'
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
const draggableModalHeight = 220
const draggableModalMargin = 16
const draggableModalMinHeights: Record<OpenAccessLevelModal['mode'], number> = {
	create: 220,
	details: 220,
	edit: 220,
}
const draggableModalMinWidth = 280

interface OpenAccessLevelModal {
	accessLevel: AccessLevel | null
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
	isSaveDisabled?: boolean
	id: string
	initialPosition: {
		x: number
		y: number
	}
	onActivate: (id: string) => void
	onBack: (id: string) => void
	onCreateSave?: (id: string) => void
	onClose: (id: string) => void
	onDelete: (id: string) => void
	onEdit: (id: string) => void
	mode: OpenAccessLevelModal['mode']
	title: string
	zIndex: number
}

function clampToRange(value: number, min: number, max: number) {
	return Math.max(min, Math.min(value, max))
}

function DraggableModal({
	children,
	id,
	initialPosition,
	isSaveDisabled = false,
	mode,
	onActivate,
	onBack,
	onCreateSave,
	onClose,
	onDelete,
	onEdit,
	title,
	zIndex,
}: DraggableModalProps) {
	const [position, setPosition] = useState(initialPosition)
	const [size, setSize] = useState({
		height: draggableModalHeight,
		width: Math.min(360, Math.max(draggableModalMinWidth, window.innerWidth * 0.86)),
	})
	const minHeight = draggableModalMinHeights[mode]

	useEffect(() => {
		setSize((current) => ({
			...current,
			height: Math.min(current.height, minHeight),
		}))
	}, [minHeight])

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
		? 'An access level must have a name'
		: 'Save'

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
				<div
					className="draggable-modal-header"
				>
					<h2>{title}</h2>
					{mode === 'details' ? (
						<>
							<button
								aria-label={`Delete ${title}`}
								className="draggable-modal-titlebar-button"
								data-no-drag="true"
								data-tooltip="Delete"
								title="Delete"
								type="button"
								onPointerDown={(event) => event.stopPropagation()}
								onClick={() => onDelete(id)}
							>
								<Trash2 aria-hidden="true" />
							</button>
							<button
								aria-label={`Edit ${title}`}
								className="draggable-modal-titlebar-button"
								data-no-drag="true"
								data-tooltip="Edit"
								title="Edit"
								type="button"
								onPointerDown={(event) => event.stopPropagation()}
								onClick={() => onEdit(id)}
							>
								<Pencil aria-hidden="true" />
							</button>
						</>
					) : (
						<>
							{mode === 'edit' ? (
								<button
									aria-label={`Delete ${title}`}
									className="draggable-modal-titlebar-button"
									data-no-drag="true"
									data-tooltip="Delete"
									title="Delete"
									type="button"
									onPointerDown={(event) => event.stopPropagation()}
									onClick={() => onDelete(id)}
								>
									<Trash2 aria-hidden="true" />
								</button>
							) : null}
							<button
								aria-label={`Back to ${title} details`}
								className="draggable-modal-titlebar-button"
								data-no-drag="true"
								data-tooltip="Back"
								title="Back"
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
								form={`${id}-edit-form`}
								disabled={isSaveDisabled}
								title={saveTooltip}
								type="submit"
								onPointerDown={(event) => event.stopPropagation()}
								onClick={() => onCreateSave?.(id)}
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
						title="Close"
						type="button"
						onPointerDown={(event) => event.stopPropagation()}
						onClick={() => onClose(id)}
					>
						x
					</button>
				</div>
				<div className="draggable-modal-content">
					{children}
				</div>
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
				</button>
			</div>
		</div>
	)
}

interface AccessLevelEditFormProps {
	accessLevel?: AccessLevel
	formId: string
	modalKey: string
	onValidityChange: (key: string, isValid: boolean) => void
	onSave: (input: CreateAccessLevelInput | UpdateAccessLevelInput) => Promise<void>
}

function AccessLevelEditForm({
	accessLevel,
	formId,
	modalKey,
	onValidityChange,
	onSave,
}: AccessLevelEditFormProps) {
	const [description, setDescription] = useState(accessLevel?.description ?? '')
	const [error, setError] = useState<string | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const [name, setName] = useState(accessLevel?.name ?? '')

	useEffect(() => {
		onValidityChange(modalKey, name.trim().length > 0)
	}, [modalKey, name, onValidityChange])

	async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()

		if (name.trim().length === 0) {
			setError('Name is required')
			return
		}

		setError(null)
		setIsSaving(true)

		try {
			await onSave({
				description,
				name,
			})
		} catch {
			setError('Unable to save access level')
		 } finally {
			setIsSaving(false)
		}
	}

	return (
		<form
			className="access-level-edit-form"
			data-selectable="true"
			id={formId}
			onSubmit={(event) => void submit(event)}
		>
			<label>
				<span>name</span>
				<input
					type="text"
					value={name}
					onChange={(event) => setName(event.target.value)}
				/>
			</label>
			<label>
				<span>description</span>
				<textarea
					rows={2}
					value={description}
					onChange={(event) => setDescription(event.target.value)}
				/>
			</label>
			{error ? <p className="form-error">{error}</p> : null}
			{isSaving ? <p className="form-status">Saving</p> : null}
		</form>
	)
}

export function SecurityView() {
	const [accessLevels, setAccessLevels] = useState<AccessLevel[]>([])
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [openModals, setOpenModals] = useState<OpenAccessLevelModal[]>([])
	const [validFormModalIds, setValidFormModalIds] = useState<Set<string>>(
		() => new Set(),
	)
	const nextZIndex = useRef(1)

	useEffect(() => {
		let isMounted = true

		async function loadAccessLevels(): Promise<void> {
			try {
				const response = await fetch(`${apiBaseUrl}${apiRoutes.accessLevels}`)

				if (!response.ok) {
					throw new Error('Unable to load access levels')
				}

				const data = (await response.json()) as AccessLevelsResponse

				if (isMounted) {
					setAccessLevels(data.data)
					setError(null)
				}
			} catch {
				if (isMounted) {
					setError('Access levels are unavailable')
				}
			} finally {
				if (isMounted) {
					setIsLoading(false)
				}
			}
		}

		void loadAccessLevels()

		return () => {
			isMounted = false
		}
	}, [])

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
		(key: string, mode: OpenAccessLevelModal['mode']) => {
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

	const updateAccessLevelInState = useCallback((accessLevel: AccessLevel) => {
		setAccessLevels((current) =>
			current.map((item) =>
				item.id === accessLevel.id ? accessLevel : item,
			),
		)
		setOpenModals((current) =>
			current.filter((modal) =>
				modal.accessLevel?.id === accessLevel.id
					? false
					: true,
			),
		)
	}, [])

	const saveAccessLevel = useCallback(
		async (id: number, input: UpdateAccessLevelInput) => {
			const response = await fetch(`${apiBaseUrl}${apiRoutes.accessLevel(id)}`, {
				body: JSON.stringify(input),
				headers: {
					'Content-Type': 'application/json',
				},
				method: 'PATCH',
			})

			if (!response.ok) {
				throw new Error('Unable to save access level')
			}

			const data = (await response.json()) as AccessLevelResponse
			updateAccessLevelInState(data.data)
		},
		[updateAccessLevelInState],
	)

	const createAccessLevel = useCallback(
		async (input: CreateAccessLevelInput | UpdateAccessLevelInput) => {
			const response = await fetch(`${apiBaseUrl}${apiRoutes.accessLevels}`, {
				body: JSON.stringify(input),
				headers: {
					'Content-Type': 'application/json',
				},
				method: 'POST',
			})

			if (!response.ok) {
				throw new Error('Unable to create access level')
			}

			const data = (await response.json()) as AccessLevelResponse
			setAccessLevels((current) => [...current, data.data])
			setOpenModals((current) =>
				current.filter((modal) => modal.key !== 'access-level-create'),
			)
		},
		[],
	)

	const deleteAccessLevel = useCallback(
		async (accessLevel: AccessLevel) => {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.accessLevel(accessLevel.id)}`,
				{
					method: 'DELETE',
				},
			)

			if (!response.ok) {
				throw new Error('Unable to delete access level')
			}

			setAccessLevels((current) =>
				current.filter((item) => item.id !== accessLevel.id),
			)
			setOpenModals((current) =>
				current.filter((modal) => modal.accessLevel?.id !== accessLevel.id),
			)
		},
		[],
	)

	const openAccessLevel = useCallback(
		(accessLevel: AccessLevel, point: { clientX: number; clientY: number }) => {
			nextZIndex.current += 1
			setOpenModals((current) => {
				const existing = current.find(
					(modal) => modal.accessLevel?.id === accessLevel.id,
				)

				if (existing) {
					return current.map((modal) =>
						modal.key === existing.key
							? { ...modal, zIndex: nextZIndex.current }
							: modal,
					)
				}

				const modalWidth = Math.min(
					360,
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
						accessLevel,
						initialPosition: { x, y },
						key: `access-level-${accessLevel.id}`,
						mode: 'details',
						zIndex: nextZIndex.current,
					},
				]
			})
		},
		[],
	)

	const openCreateAccessLevel = useCallback((point: { clientX: number; clientY: number }) => {
		nextZIndex.current += 1
		setOpenModals((current) => {
			const existing = current.find((modal) => modal.key === 'access-level-create')

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
					accessLevel: null,
					initialPosition: {
						x: clampToRange(
							point.clientX - 360 - 10,
							draggableModalMargin,
							window.innerWidth - 360 - draggableModalMargin,
						),
						y: clampToRange(
							point.clientY + 10,
							draggableModalMargin,
							window.innerHeight - draggableModalHeight - draggableModalMargin,
						),
					},
					key: 'access-level-create',
					mode: 'create',
					zIndex: nextZIndex.current,
				},
			]
		})
	}, [])

	return (
		<section className="security-view">
			<div className="section-heading">
				<p>Access Levels</p>
			</div>

			<div className="data-table-wrap">
				<table className="data-table">
					<thead>
						<tr>
							<th>name</th>
							<th>description</th>
							<th className="data-table-action-heading">
								<button
									aria-label="Create access level"
									className="section-action-button"
									data-tooltip="Add an access level"
									type="button"
									onClick={(event) => openCreateAccessLevel(event)}
								>
									<Plus aria-hidden="true" />
								</button>
							</th>
						</tr>
					</thead>
					<tbody>
						{isLoading ? (
							<tr>
								<td colSpan={2}>Loading access levels</td>
							</tr>
						) : error ? (
							<tr>
								<td colSpan={2}>{error}</td>
							</tr>
						) : accessLevels.length === 0 ? (
							<tr>
								<td colSpan={2}>No access levels found</td>
							</tr>
						) : (
							accessLevels.map((accessLevel) => (
								<tr
									key={accessLevel.id}
									className="data-table-row"
									tabIndex={0}
									onClick={(event: ReactMouseEvent<HTMLTableRowElement>) =>
										openAccessLevel(accessLevel, event)
									}
									onKeyDown={(event) => {
										if (event.key === 'Enter' || event.key === ' ') {
											event.preventDefault()
											const rect = event.currentTarget.getBoundingClientRect()
											openAccessLevel(accessLevel, {
												clientX: rect.left,
												clientY: rect.top,
											})
										}
									}}
								>
									<td>{accessLevel.name}</td>
									<td>{accessLevel.description}</td>
									<td aria-hidden="true" />
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
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
							if (modal.accessLevel) {
								void deleteAccessLevel(modal.accessLevel)
							}
						}}
						onEdit={(key) => setModalMode(key, 'edit')}
						title="Access Level"
						zIndex={modal.zIndex}
					>
						{modal.mode === 'create' ? (
							<AccessLevelEditForm
								formId={`${modal.key}-edit-form`}
								modalKey={modal.key}
								onValidityChange={setModalFormValidity}
								onSave={createAccessLevel}
							/>
						) : modal.mode === 'edit' && modal.accessLevel ? (
							<AccessLevelEditForm
								accessLevel={modal.accessLevel}
								formId={`${modal.key}-edit-form`}
								modalKey={modal.key}
								onValidityChange={setModalFormValidity}
								onSave={(input) => {
									const accessLevel = modal.accessLevel

									if (!accessLevel) {
										return Promise.resolve()
									}

									return saveAccessLevel(accessLevel.id, input)
								}}
							/>
						) : modal.accessLevel ? (
							<div
								className="access-level-details"
								data-selectable="true"
							>
								<div>
									<p>id</p>
									<strong>{modal.accessLevel.id}</strong>
								</div>
								<div>
									<p>name</p>
									<strong>{modal.accessLevel.name}</strong>
								</div>
								<div>
									<p>description</p>
									<strong>{modal.accessLevel.description}</strong>
								</div>
							</div>
						) : null}
					</DraggableModal>
				))}
			</div>
		</section>
	)
}
