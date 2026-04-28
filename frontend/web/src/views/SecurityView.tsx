import {
	apiRoutes,
	PermissionName,
	type AccessLevel,
	type AccessLevelResponse,
	type AccessLevelsResponse,
	type ApiErrorResponse,
	type CreateAccessLevelInput,
	type CreateUserInput,
	type Permission,
	type PermissionsResponse,
	type UpdateAccessLevelInput,
	type UpdateUserInput,
	type User,
	type UserResponse,
	type UsersResponse,
} from '@rebirth/shared'
import {
	ArrowLeft,
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
	type FormEvent,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
} from 'react'
import {
	authChangedEventName,
	getStoredAuth,
	hasStoredPermission,
} from '../auth'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9908'
const draggableModalHeight = 220
const draggableModalMargin = 16
const draggableModalMinHeights: Record<OpenAccessLevelModal['mode'], number> = {
	create: 220,
	details: 220,
	edit: 220,
}
const draggableModalMinWidth = 280
const accessLevelModalWidth = 360
const userModalWidth = 460
const userDetailsModalHeight = 300
const userEditModalHeight = 360
const userCreateModalYOffset = 64
const builtInAccessLevelMaxId = 3
const builtInAccessLevelDeleteTooltip =
	'This built-in access level cannot be deleted.'
const builtInAccessLevelRenameTooltip =
	'This built-in access level cannot be renamed.'

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
): Promise<string> {
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
			return data.error.message
		}

		if (typeof data.error === 'string' && data.error.length > 0) {
			return data.error
		}
	} catch {
		return fallback
	}

	return fallback
}

type SecurityModalMode = 'create' | 'details' | 'edit'

interface OpenAccessLevelModal {
	accessLevel: AccessLevel | null
	initialPosition: {
		x: number
		y: number
	}
	key: string
	kind: 'access-level'
	mode: SecurityModalMode
	zIndex: number
}

interface OpenUserModal {
	initialPosition: {
		x: number
		y: number
	}
	key: string
	kind: 'user'
	mode: SecurityModalMode
	user: User | null
	zIndex: number
}

type OpenSecurityModal = OpenAccessLevelModal | OpenUserModal

interface DraggableModalProps {
	children: ReactNode
	deleteTooltip?: string
	infoText?: string
	isSaveDisabled?: boolean
	isDeleteDisabled?: boolean
	saveDisabledTooltip?: string
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
	mode: SecurityModalMode
	title: string
	zIndex: number
}

function clampToRange(value: number, min: number, max: number) {
	return Math.max(min, Math.min(value, max))
}

function getAccessLevelModalTitle(mode: OpenAccessLevelModal['mode']) {
	if (mode === 'create') {
		return 'Access Level :: New'
	}

	if (mode === 'edit') {
		return 'Access Level :: Edit'
	}

	return 'Access Level'
}

function getUserModalTitle(mode: SecurityModalMode) {
	if (mode === 'create') {
		return 'User :: New'
	}

	if (mode === 'edit') {
		return 'User :: Edit'
	}

	return 'User'
}

function isBuiltInAccessLevel(accessLevel?: AccessLevel | null): boolean {
	return Boolean(accessLevel && accessLevel.id <= builtInAccessLevelMaxId)
}

function getUserModalHeight(mode: SecurityModalMode): number {
	return mode === 'details' ? userDetailsModalHeight : userEditModalHeight
}

function DraggableModal({
	children,
	deleteTooltip = 'Delete',
	id,
	infoText,
	isDeleteDisabled = false,
	initialPosition,
	isSaveDisabled = false,
	mode,
	onActivate,
	onBack,
	onCreateSave,
	onClose,
	onDelete,
	onEdit,
	saveDisabledTooltip = 'Required fields must be filled',
	title,
	zIndex,
}: DraggableModalProps) {
	const [position, setPosition] = useState(initialPosition)
	const defaultHeight = id.startsWith('user')
		? getUserModalHeight(mode)
		: draggableModalHeight
	const defaultWidth = id.startsWith('user')
		? userModalWidth
		: accessLevelModalWidth
	const [size, setSize] = useState({
		height: defaultHeight,
		width: Math.min(
			defaultWidth,
			Math.max(draggableModalMinWidth, window.innerWidth * 0.86),
		),
	})
	const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
	const [isInfoPopoverOpen, setIsInfoPopoverOpen] = useState(false)
	const minHeight = id.startsWith('user')
		? getUserModalHeight(mode)
		: draggableModalMinHeights[mode]
	const confirmDeleteButtonRef = useRef<HTMLButtonElement>(null)
	const infoPopoverRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		setSize((current) => ({
			...current,
			height: minHeight,
		}))
	}, [minHeight])

	useEffect(() => {
		if (isDeleteConfirmOpen) {
			confirmDeleteButtonRef.current?.focus()
		}
	}, [isDeleteConfirmOpen])

	useEffect(() => {
		if (!isInfoPopoverOpen) {
			return
		}

		function closeInfoPopover(event: PointerEvent): void {
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

		document.addEventListener('pointerdown', closeInfoPopover)

		return () => {
			document.removeEventListener('pointerdown', closeInfoPopover)
		}
	}, [isInfoPopoverOpen])

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
					x:
						dragStart.current.x +
						pointerEvent.clientX -
						dragStart.current.pointerX,
					y:
						dragStart.current.y +
						pointerEvent.clientY -
						dragStart.current.pointerY,
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
		[
			id,
			minHeight,
			onActivate,
			position.x,
			position.y,
			size.height,
			size.width,
		],
	)

	const saveTooltip = isSaveDisabled ? saveDisabledTooltip : 'Save'
	const deleteButton = (
		<div
			className="draggable-modal-delete-action"
			data-no-drag="true"
			data-tooltip={isDeleteDisabled ? deleteTooltip : undefined}
		>
			<button
				aria-expanded={isDeleteConfirmOpen}
				aria-label={`Delete ${title}`}
				className="draggable-modal-titlebar-button"
				data-no-drag="true"
				data-tooltip={
					isDeleteDisabled || isDeleteConfirmOpen
						? undefined
						: deleteTooltip
				}
				disabled={isDeleteDisabled}
				type="button"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={() => {
					if (isDeleteDisabled) {
						return
					}

					setIsDeleteConfirmOpen(true)
				}}
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
					<p>Delete this entry?</p>
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
			<div className="draggable-modal-body" onPointerDown={startDrag}>
				<div className="draggable-modal-header">
					<h2>{title}</h2>
					{infoText ? (
						<div
							className="draggable-modal-info-action"
							ref={infoPopoverRef}
						>
							<button
								aria-expanded={isInfoPopoverOpen}
								aria-label="Show id"
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
								form={`${id}-edit-form`}
								disabled={isSaveDisabled}
								type="submit"
								onPointerDown={(event) =>
									event.stopPropagation()
								}
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

interface AccessLevelEditFormProps {
	accessLevel?: AccessLevel
	autoFocusName?: boolean
	formId: string
	modalKey: string
	onValidityChange: (key: string, isValid: boolean, reason?: string) => void
	onSave: (
		input: CreateAccessLevelInput | UpdateAccessLevelInput,
	) => Promise<void>
}

function AccessLevelEditForm({
	accessLevel,
	autoFocusName = false,
	formId,
	modalKey,
	onValidityChange,
	onSave,
}: AccessLevelEditFormProps) {
	const isBuiltIn = isBuiltInAccessLevel(accessLevel)
	const [description, setDescription] = useState(
		accessLevel?.description ?? '',
	)
	const [error, setError] = useState<string | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const [name, setName] = useState(accessLevel?.name ?? '')
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
		} catch (error) {
			setError(
				error instanceof Error
					? error.message
					: 'Unable to save access level',
			)
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
				<span
					className="access-level-name-input-wrap"
					data-tooltip={
						isBuiltIn ? builtInAccessLevelRenameTooltip : undefined
					}
				>
					<input
						ref={nameInputRef}
						readOnly={isBuiltIn}
						type="text"
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
				</span>
			</label>
			<label>
				<span>description</span>
				<textarea
					className="access-level-description-input"
					rows={1}
					value={description}
					onChange={(event) => setDescription(event.target.value)}
				/>
			</label>
			{error ? <p className="form-error">{error}</p> : null}
			{isSaving ? <p className="form-status">Saving</p> : null}
		</form>
	)
}

interface UserEditFormProps {
	accessLevels: AccessLevel[]
	autoFocusFirstName?: boolean
	formId: string
	modalKey: string
	permissions: Permission[]
	onSave: (input: CreateUserInput | UpdateUserInput) => Promise<void>
	onValidityChange: (key: string, isValid: boolean, reason?: string) => void
	user?: User
}

function UserEditForm({
	accessLevels,
	autoFocusFirstName = false,
	formId,
	modalKey,
	permissions,
	onSave,
	onValidityChange,
	user,
}: UserEditFormProps) {
	const isCreate = !user
	const [email, setEmail] = useState(user?.email ?? '')
	const [firstName, setFirstName] = useState(user?.firstName ?? '')
	const [lastName, setLastName] = useState(user?.lastName ?? '')
	const [username, setUsername] = useState(user?.username ?? '')
	const [password, setPassword] = useState('')
	const [isPasswordVisible, setIsPasswordVisible] = useState(false)
	const [isPermissionMenuOpen, setIsPermissionMenuOpen] = useState(false)
	const [isAccessLevelMenuOpen, setIsAccessLevelMenuOpen] = useState(false)
	const [permissionTooltip, setPermissionTooltip] = useState<{
		description: string
		x: number
		y: number
	} | null>(null)
	const [permissionIds, setPermissionIds] = useState<number[]>(() => {
		const existingPermissionIds =
			user?.permissions.map((permission) => permission.id) ?? []

		if (existingPermissionIds.length > 0) {
			return existingPermissionIds
		}

		return [
			permissions.find(
				(permission) => permission.name === PermissionName.Viewer,
			)?.id ??
				permissions[0]?.id ??
				1,
		]
	})
	const [accessLevelIds, setAccessLevelIds] = useState<number[]>(
		() => {
			const existingAccessLevelIds =
				user?.accessLevels.map((accessLevel) => accessLevel.id) ?? []

			if (existingAccessLevelIds.length > 0) {
				return existingAccessLevelIds
			}

			return [
				accessLevels.find(
					(accessLevel) => accessLevel.name === 'Public',
				)?.id ??
					1,
			]
		},
	)
	const [error, setError] = useState<string | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const firstNameInputRef = useRef<HTMLInputElement>(null)
	const permissionPickerRef = useRef<HTMLSpanElement>(null)
	const permissionMenuRef = useRef<HTMLDivElement>(null)
	const accessLevelPickerRef = useRef<HTMLSpanElement>(null)
	const selectedPermissionNames = permissions
		.filter((permission) => permissionIds.includes(permission.id))
		.map((permission) => permission.name)
	const permissionSummary = selectedPermissionNames.join(', ')
	const selectedAccessLevelNames = accessLevels
		.filter((accessLevel) => accessLevelIds.includes(accessLevel.id))
		.map((accessLevel) => accessLevel.name)
	const accessLevelSummary = selectedAccessLevelNames.join(', ')
	const hasEmptyRequiredField =
		email.trim().length === 0 ||
		firstName.trim().length === 0 ||
		lastName.trim().length === 0 ||
		username.trim().length === 0 ||
		(isCreate && password.length === 0) ||
		permissionIds.length === 0 ||
		permissionIds.some(
			(permissionId) =>
				!permissions.some(
					(permission) => permission.id === permissionId,
				),
		) ||
		accessLevelIds.some(
			(accessLevelId) =>
				!accessLevels.some(
					(accessLevel) => accessLevel.id === accessLevelId,
				),
		)
	const hasInvalidPassword = password.length > 0 && password.length < 8
	const isValid = !hasEmptyRequiredField && !hasInvalidPassword
	const invalidReason = hasInvalidPassword
		? 'Password must be at least 8 characters'
		: 'Required fields must be filled'

	useEffect(() => {
		onValidityChange(modalKey, isValid, invalidReason)
	}, [invalidReason, isValid, modalKey, onValidityChange])

	useEffect(() => {
		if (autoFocusFirstName) {
			firstNameInputRef.current?.focus()
		}
	}, [autoFocusFirstName])

	useEffect(() => {
		const validPermissionIds = permissionIds.filter((permissionId) =>
			permissions.some((permission) => permission.id === permissionId),
		)

		if (validPermissionIds.length !== permissionIds.length) {
			setPermissionIds(validPermissionIds)
			return
		}

		if (validPermissionIds.length === 0 && permissions[0]) {
			setPermissionIds([permissions[0].id])
		}
	}, [permissionIds, permissions])

	useEffect(() => {
		if (!isPermissionMenuOpen) {
			setPermissionTooltip(null)
		}
	}, [isPermissionMenuOpen])

	useEffect(() => {
		const validAccessLevelIds = accessLevelIds.filter((accessLevelId) =>
			accessLevels.some(
				(accessLevel) => accessLevel.id === accessLevelId,
			),
		)

		if (validAccessLevelIds.length !== accessLevelIds.length) {
			setAccessLevelIds(validAccessLevelIds)
			return
		}

		if (isCreate && validAccessLevelIds.length === 0 && accessLevels[0]) {
			setAccessLevelIds([
				accessLevels.find((accessLevel) => accessLevel.name === 'Public')
					?.id ??
					accessLevels[0].id,
			])
		}
	}, [accessLevelIds, accessLevels, isCreate])

	useEffect(() => {
		function closeMenus(event: PointerEvent): void {
			const target = event.target

			if (
				target instanceof Node &&
				!permissionPickerRef.current?.contains(target)
			) {
				setIsPermissionMenuOpen(false)
			}

			if (
				target instanceof Node &&
				!accessLevelPickerRef.current?.contains(target)
			) {
				setIsAccessLevelMenuOpen(false)
			}
		}

		document.addEventListener('pointerdown', closeMenus)

		return () => {
			document.removeEventListener('pointerdown', closeMenus)
		}
	}, [])

	function togglePermission(permissionId: number): void {
		setPermissionIds((current) =>
			current.includes(permissionId)
				? current.filter((currentId) => currentId !== permissionId)
				: [...current, permissionId],
		)
	}

	function toggleAccessLevel(accessLevelId: number): void {
		setAccessLevelIds((current) =>
			current.includes(accessLevelId)
				? current.filter((currentId) => currentId !== accessLevelId)
				: [...current, accessLevelId],
		)
	}

	function movePermissionTooltip(
		event: ReactPointerEvent,
		description: string,
	): void {
		const menuRect = permissionMenuRef.current?.getBoundingClientRect()

		if (!menuRect) {
			return
		}

		setPermissionTooltip({
			description,
			x: event.clientX - menuRect.left,
			y: event.clientY - menuRect.top,
		})
	}

	async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()

		if (!isValid) {
			setError('Required fields must be filled')
			return
		}

		setError(null)
		setIsSaving(true)

		try {
			const input = {
				accessLevelIds,
				email,
				firstName,
				lastName,
				permissionIds,
				username,
				...(password ? { password } : {}),
			}

			if (isCreate) {
				await onSave({
					...input,
					password,
				})
			} else {
				await onSave(input)
			}
		} catch (error) {
			setError(
				error instanceof Error ? error.message : 'Unable to save user',
			)
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<form
			className="access-level-edit-form security-user-edit-form"
			data-selectable="true"
			id={formId}
			onSubmit={(event) => void submit(event)}
		>
			<div className="security-user-name-row">
				<label>
					<span>first name</span>
					<input
						ref={firstNameInputRef}
						autoComplete="given-name"
						type="text"
						value={firstName}
						onChange={(event) => setFirstName(event.target.value)}
					/>
				</label>
				<label>
					<span>last name</span>
					<input
						autoComplete="family-name"
						type="text"
						value={lastName}
						onChange={(event) => setLastName(event.target.value)}
					/>
				</label>
			</div>
			<label>
				<span>email</span>
				<input
					autoComplete="email"
					type="email"
					value={email}
					onChange={(event) => setEmail(event.target.value)}
				/>
			</label>
			<div className="security-user-two-column-row">
				<label
					data-tooltip={
						user?.username === 'admin'
							? 'Admin user cannot rename its username'
							: undefined
					}
				>
					<span>username</span>
					<input
						autoComplete="username"
						type="text"
						value={username}
						onChange={(event) => setUsername(event.target.value)}
					/>
				</label>
				<label>
					<span>permissions</span>
					<span
						ref={permissionPickerRef}
						className="security-user-permissions-picker"
					>
						<button
							aria-expanded={isPermissionMenuOpen}
							aria-haspopup="listbox"
							className="security-user-permissions-trigger"
							data-empty={
								permissionSummary.length === 0
									? 'true'
									: undefined
							}
							type="button"
							onClick={() =>
								setIsPermissionMenuOpen((current) => !current)
							}
						>
							<span>
								{permissionSummary || 'Select permissions'}
							</span>
						</button>
						{isPermissionMenuOpen ? (
							<div
								ref={permissionMenuRef}
								className="security-user-permissions-menu"
								role="listbox"
								aria-multiselectable="true"
							>
								{permissions.map((permission) => (
									<label
										key={permission.id}
										className="security-user-permission-option"
										onPointerEnter={(event) =>
											movePermissionTooltip(
												event,
												permission.description,
											)
										}
										onPointerLeave={() =>
											setPermissionTooltip(null)
										}
										onPointerMove={(event) =>
											movePermissionTooltip(
												event,
												permission.description,
											)
										}
									>
										<input
											checked={permissionIds.includes(
												permission.id,
											)}
											type="checkbox"
											onChange={() =>
												togglePermission(permission.id)
											}
										/>
										<span>{permission.name}</span>
									</label>
								))}
								{permissionTooltip ? (
									<div
										className="security-user-permission-tooltip"
										style={{
											left: permissionTooltip.x,
											top: permissionTooltip.y,
										}}
									>
										{permissionTooltip.description}
									</div>
								) : null}
							</div>
						) : null}
					</span>
				</label>
			</div>
			<label>
				<span>access levels</span>
				<span
					ref={accessLevelPickerRef}
					className="security-user-permissions-picker"
				>
					<button
						aria-expanded={isAccessLevelMenuOpen}
						aria-haspopup="listbox"
						className="security-user-permissions-trigger"
						data-empty={
							accessLevelSummary.length === 0 ? 'true' : undefined
						}
						type="button"
						onClick={() =>
							setIsAccessLevelMenuOpen((current) => !current)
						}
					>
						<span>{accessLevelSummary || 'No access levels'}</span>
					</button>
					{isAccessLevelMenuOpen ? (
						<div
							className="security-user-permissions-menu"
							role="listbox"
							aria-multiselectable="true"
						>
							{accessLevels.map((accessLevel) => (
								<label
									key={accessLevel.id}
									className="security-user-permission-option"
								>
									<input
										checked={accessLevelIds.includes(
											accessLevel.id,
										)}
										type="checkbox"
										onChange={() =>
											toggleAccessLevel(accessLevel.id)
										}
									/>
									<span>{accessLevel.name}</span>
								</label>
							))}
						</div>
					) : null}
				</span>
			</label>
			<label>
				<span>{isCreate ? 'password' : 'new password'}</span>
				<span className="security-user-password-wrap">
					<input
						autoComplete="new-password"
						placeholder={
							isCreate ? undefined : 'Leave empty to keep current'
						}
						type={isPasswordVisible ? 'text' : 'password'}
						value={password}
						onChange={(event) => setPassword(event.target.value)}
					/>
					<button
						aria-label={
							isPasswordVisible
								? 'Hide password'
								: 'Show password'
						}
						className="security-user-password-toggle"
						type="button"
						onClick={() =>
							setIsPasswordVisible((current) => !current)
						}
					>
						{isPasswordVisible ? (
							<Eye aria-hidden="true" />
						) : (
							<EyeOff aria-hidden="true" />
						)}
					</button>
				</span>
			</label>
			{error ? <p className="form-error">{error}</p> : null}
			{isSaving ? <p className="form-status">Saving</p> : null}
		</form>
	)
}

export function SecurityView() {
	const [storedAuth, setStoredAuth] = useState(getStoredAuth)
	const [accessLevels, setAccessLevels] = useState<AccessLevel[]>([])
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [openModals, setOpenModals] = useState<OpenSecurityModal[]>([])
	const [permissions, setPermissions] = useState<Permission[]>([])
	const [users, setUsers] = useState<User[]>([])
	const [usersError, setUsersError] = useState<string | null>(null)
	const [isUsersLoading, setIsUsersLoading] = useState(true)
	const [validFormModalIds, setValidFormModalIds] = useState<Set<string>>(
		() => new Set(),
	)
	const [invalidFormModalTooltips, setInvalidFormModalTooltips] = useState<
		Map<string, string>
	>(() => new Map())
	const isMountedRef = useRef(false)
	const loadRequestId = useRef(0)
	const usersLoadRequestId = useRef(0)
	const nextZIndex = useRef(1)
	const isAuthenticated = storedAuth !== null
	const isAuthorized = hasStoredPermission(storedAuth, PermissionName.Admin)

	const loadAccessLevels = useCallback(async (): Promise<void> => {
		const requestId = loadRequestId.current + 1
		loadRequestId.current = requestId

		setIsLoading(true)

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

			if (isMountedRef.current && requestId === loadRequestId.current) {
				setAccessLevels(data.data)
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

	const loadUsersAndPermissions = useCallback(async (): Promise<void> => {
		const requestId = usersLoadRequestId.current + 1
		usersLoadRequestId.current = requestId

		setIsUsersLoading(true)

		try {
			const [permissionsResponse, usersResponse] = await Promise.all([
				fetch(`${apiBaseUrl}${apiRoutes.permissions}`),
				fetch(`${apiBaseUrl}${apiRoutes.users}`, {
					headers: getAuthHeaders(),
				}),
			])

			if (!permissionsResponse.ok) {
				throw new Error('Unable to load permissions')
			}

			if (!usersResponse.ok) {
				throw new Error(
					usersResponse.status === 401 || usersResponse.status === 403
						? 'Admin permission is required to manage users'
						: 'Unable to load users',
				)
			}

			const permissionsData =
				(await permissionsResponse.json()) as PermissionsResponse
			const usersData = (await usersResponse.json()) as UsersResponse

			if (
				isMountedRef.current &&
				requestId === usersLoadRequestId.current
			) {
				setPermissions(permissionsData.data)
				setUsers(
					usersData.data.filter((user) => user.username !== 'admin'),
				)
				setUsersError(null)
			}
		} catch (error) {
			if (
				isMountedRef.current &&
				requestId === usersLoadRequestId.current
			) {
				setUsersError(
					error instanceof Error
						? error.message
						: 'Users are unavailable',
				)
			}
		} finally {
			if (
				isMountedRef.current &&
				requestId === usersLoadRequestId.current
			) {
				setIsUsersLoading(false)
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
		void loadUsersAndPermissions()

		return () => {
			isMountedRef.current = false
		}
	}, [isAuthorized, loadAccessLevels, loadUsersAndPermissions])

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
		setValidFormModalIds((current) => {
			if (!current.has(key)) {
				return current
			}

			const next = new Set(current)
			next.delete(key)
			return next
		})
		setInvalidFormModalTooltips((current) => {
			if (!current.has(key)) {
				return current
			}

			const next = new Map(current)
			next.delete(key)
			return next
		})
	}, [])

	const setModalMode = useCallback((key: string, mode: SecurityModalMode) => {
		setOpenModals((current) =>
			current.map((modal) =>
				modal.key === key ? { ...modal, mode } : modal,
			),
		)
	}, [])

	const setModalFormValidity = useCallback(
		(
			key: string,
			isValid: boolean,
			reason = 'Required fields must be filled',
		) => {
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
			setInvalidFormModalTooltips((current) => {
				if (isValid) {
					if (!current.has(key)) {
						return current
					}

					const next = new Map(current)
					next.delete(key)
					return next
				}

				if (current.get(key) === reason) {
					return current
				}

				const next = new Map(current)
				next.set(key, reason)
				return next
			})
		},
		[],
	)

	const updateAccessLevelInState = useCallback((accessLevel: AccessLevel) => {
		setAccessLevels((current) =>
			current.map((item) =>
				item.id === accessLevel.id ? accessLevel : item,
			),
		)
		setOpenModals((current) =>
			current.filter((modal) =>
				modal.kind === 'access-level' &&
				modal.accessLevel?.id === accessLevel.id
					? false
					: true,
			),
		)
	}, [])

	const saveAccessLevel = useCallback(
		async (id: number, input: UpdateAccessLevelInput) => {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.accessLevel(id)}`,
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
				throw new Error(
					await getResponseErrorMessage(
						response,
						'Unable to save access level',
					),
				)
			}

			const data = (await response.json()) as AccessLevelResponse
			updateAccessLevelInState(data.data)
		},
		[updateAccessLevelInState],
	)

	const createAccessLevel = useCallback(
		async (input: CreateAccessLevelInput | UpdateAccessLevelInput) => {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.accessLevels}`,
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
					await getResponseErrorMessage(
						response,
						'Unable to create access level',
					),
				)
			}

			const data = (await response.json()) as AccessLevelResponse
			setAccessLevels((current) => [...current, data.data])
			setOpenModals((current) =>
				current.filter((modal) => modal.key !== 'access-level-create'),
			)
		},
		[],
	)

	const deleteAccessLevel = useCallback(async (accessLevel: AccessLevel) => {
		const response = await fetch(
			`${apiBaseUrl}${apiRoutes.accessLevel(accessLevel.id)}`,
			{
				headers: getAuthHeaders(),
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
			current.filter(
				(modal) =>
					modal.kind !== 'access-level' ||
					modal.accessLevel?.id !== accessLevel.id,
			),
		)
	}, [])

	const createUser = useCallback(async (input: CreateUserInput) => {
		const response = await fetch(`${apiBaseUrl}${apiRoutes.users}`, {
			body: JSON.stringify(input),
			headers: {
				...getAuthHeaders(),
				'Content-Type': 'application/json',
			},
			method: 'POST',
		})

		if (!response.ok) {
			throw new Error(
				await getResponseErrorMessage(
					response,
					'Unable to create user',
				),
			)
		}

		const data = (await response.json()) as UserResponse
		if (data.data.username !== 'admin') {
			setUsers((current) =>
				[...current, data.data].sort((left, right) =>
					left.username.localeCompare(right.username),
				),
			)
		}
		setOpenModals((current) =>
			current.filter((modal) => modal.key !== 'user-create'),
		)
	}, [])

	const saveUser = useCallback(async (user: User, input: UpdateUserInput) => {
		const response = await fetch(
			`${apiBaseUrl}${apiRoutes.user(user.id)}`,
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
			throw new Error(
				await getResponseErrorMessage(response, 'Unable to save user'),
			)
		}

		const data = (await response.json()) as UserResponse
		setUsers((current) =>
			current.map((item) =>
				item.id === data.data.id ? data.data : item,
			),
		)
		setOpenModals((current) =>
			current.filter((modal) =>
				modal.kind === 'user' && modal.user?.id === data.data.id
					? false
					: true,
			),
		)
	}, [])

	const deleteUser = useCallback(async (user: User) => {
		const response = await fetch(
			`${apiBaseUrl}${apiRoutes.user(user.id)}`,
			{
				headers: getAuthHeaders(),
				method: 'DELETE',
			},
		)

		if (!response.ok) {
			throw new Error('Unable to delete user')
		}

		setUsers((current) => current.filter((item) => item.id !== user.id))
		setOpenModals((current) =>
			current.filter(
				(modal) => modal.kind !== 'user' || modal.user?.id !== user.id,
			),
		)
	}, [])

	const openAccessLevel = useCallback(
		(
			accessLevel: AccessLevel,
			point: { clientX: number; clientY: number },
		) => {
			nextZIndex.current += 1
			setOpenModals((current) => {
				const existing = current.find(
					(modal) =>
						modal.kind === 'access-level' &&
						modal.accessLevel?.id === accessLevel.id,
				)

				if (existing) {
					return current.map((modal) =>
						modal.key === existing.key
							? { ...modal, zIndex: nextZIndex.current }
							: modal,
					)
				}

				const modalWidth = Math.min(
					accessLevelModalWidth,
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
						accessLevel,
						initialPosition: { x, y },
						key: `access-level-${accessLevel.id}`,
						kind: 'access-level',
						mode: 'details',
						zIndex: nextZIndex.current,
					},
				]
			})
		},
		[],
	)

	const openCreateAccessLevel = useCallback(
		(point: { clientX: number; clientY: number }) => {
			nextZIndex.current += 1
			setOpenModals((current) => {
				const existing = current.find(
					(modal) => modal.key === 'access-level-create',
				)

				if (existing) {
					return current.map((modal) =>
						modal.key === existing.key
							? { ...modal, zIndex: nextZIndex.current }
							: modal,
					)
				}

				const modalWidth = Math.min(
					accessLevelModalWidth,
					Math.max(draggableModalMinWidth, window.innerWidth * 0.86),
				)

				return [
					...current,
					{
						accessLevel: null,
						initialPosition: {
							x: clampToRange(
								point.clientX - modalWidth - 10,
								draggableModalMargin,
								window.innerWidth -
									modalWidth -
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
						key: 'access-level-create',
						kind: 'access-level',
						mode: 'create',
						zIndex: nextZIndex.current,
					},
				]
			})
		},
		[],
	)

	const openUser = useCallback(
		(user: User, point: { clientX: number; clientY: number }) => {
			nextZIndex.current += 1
			setOpenModals((current) => {
				const existing = current.find(
					(modal) =>
						modal.kind === 'user' && modal.user?.id === user.id,
				)

				if (existing) {
					return current.map((modal) =>
						modal.key === existing.key
							? { ...modal, zIndex: nextZIndex.current }
							: modal,
					)
				}

				const modalWidth = Math.min(
					userModalWidth,
					Math.max(draggableModalMinWidth, window.innerWidth * 0.86),
				)
				const pointerOffset = 10

				return [
					...current,
					{
						initialPosition: {
							x: clampToRange(
								point.clientX + pointerOffset,
								draggableModalMargin,
								window.innerWidth -
									modalWidth -
									draggableModalMargin,
							),
							y: clampToRange(
								point.clientY - userCreateModalYOffset,
								draggableModalMargin,
								window.innerHeight -
									userDetailsModalHeight -
									draggableModalMargin,
							),
						},
						key: `user-${user.id}`,
						kind: 'user',
						mode: 'details',
						user,
						zIndex: nextZIndex.current,
					},
				]
			})
		},
		[],
	)

	const openCreateUser = useCallback(
		(point: { clientX: number; clientY: number }) => {
			nextZIndex.current += 1
			setOpenModals((current) => {
				const existing = current.find(
					(modal) => modal.key === 'user-create',
				)

				if (existing) {
					return current.map((modal) =>
						modal.key === existing.key
							? { ...modal, zIndex: nextZIndex.current }
							: modal,
					)
				}

				const modalWidth = Math.min(
					userModalWidth,
					Math.max(draggableModalMinWidth, window.innerWidth * 0.86),
				)

				return [
					...current,
					{
						initialPosition: {
							x: clampToRange(
								point.clientX - modalWidth - 10,
								draggableModalMargin,
								window.innerWidth -
									modalWidth -
									draggableModalMargin,
							),
							y: clampToRange(
								point.clientY - userCreateModalYOffset,
								draggableModalMargin,
								window.innerHeight -
									userEditModalHeight -
									draggableModalMargin,
							),
						},
						key: 'user-create',
						kind: 'user',
						mode: 'create',
						user: null,
						zIndex: nextZIndex.current,
					},
				]
			})
		},
		[],
	)

	if (!isAuthorized) {
		return (
			<section className="security-view">
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
		<section className="security-view">
			<div className="section-heading">
				<p>Access Levels</p>
			</div>

			{error ? (
				<div className="access-level-unavailable" role="status">
					<p>{error}</p>
					<button
						aria-label="Refresh access levels"
						className="access-level-refresh-button"
						data-tooltip="Try again"
						type="button"
						onClick={() => void loadAccessLevels()}
					>
						<RefreshCw aria-hidden="true" />
					</button>
				</div>
			) : (
				<div className="data-table-wrap security-table-wrap">
					<table className="data-table security-access-levels-table">
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
										onClick={(event) =>
											openCreateAccessLevel(event)
										}
									>
										<Plus aria-hidden="true" />
									</button>
								</th>
							</tr>
						</thead>
						<tbody>
							{isLoading ? (
								<tr>
									<td colSpan={3}>Loading access levels</td>
								</tr>
							) : accessLevels.length === 0 ? (
								<tr>
									<td colSpan={3}>There are no entries</td>
								</tr>
							) : (
								accessLevels.map((accessLevel) => (
									<tr
										key={accessLevel.id}
										className="data-table-row"
										tabIndex={0}
										onClick={(
											event: ReactMouseEvent<HTMLTableRowElement>,
										) =>
											openAccessLevel(accessLevel, event)
										}
										onKeyDown={(event) => {
											if (
												event.key === 'Enter' ||
												event.key === ' '
											) {
												event.preventDefault()
												const rect =
													event.currentTarget.getBoundingClientRect()
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
			)}
			<div className="section-heading security-users-heading">
				<p>Users</p>
			</div>
			{usersError ? (
				<div className="access-level-unavailable" role="status">
					<p>{usersError}</p>
					<button
						aria-label="Refresh users"
						className="access-level-refresh-button"
						data-tooltip="Try again"
						type="button"
						onClick={() => void loadUsersAndPermissions()}
					>
						<RefreshCw aria-hidden="true" />
					</button>
				</div>
			) : (
				<>
					<div className="data-table-wrap security-table-wrap">
						<table className="data-table security-users-table">
							<thead>
								<tr>
									<th className="security-users-username-column">
										username
									</th>
									<th className="security-users-email-column">
										email
									</th>
									<th className="security-users-permissions-column">
										permissions
									</th>
									<th className="security-users-access-levels-column">
										access levels
									</th>
									<th className="data-table-action-heading">
										<button
											aria-label="Create user"
											className="section-action-button"
											data-tooltip="Add a user"
											type="button"
											onClick={(event) =>
												openCreateUser(event)
											}
										>
											<Plus aria-hidden="true" />
										</button>
									</th>
								</tr>
							</thead>
							<tbody>
								{isUsersLoading ? (
									<tr>
										<td colSpan={5}>Loading users</td>
									</tr>
								) : users.length === 0 ? (
									<tr>
										<td
											className="data-table-empty-cell"
											colSpan={5}
										>
											<span>There are no entries</span>
										</td>
									</tr>
								) : (
									users.map((user) => (
										<tr
											key={user.id}
											className="data-table-row"
											tabIndex={0}
											onClick={(
												event: ReactMouseEvent<HTMLTableRowElement>,
											) => openUser(user, event)}
											onKeyDown={(event) => {
												if (
													event.key === 'Enter' ||
													event.key === ' '
												) {
													event.preventDefault()
													const rect =
														event.currentTarget.getBoundingClientRect()
													openUser(user, {
														clientX: rect.left,
														clientY: rect.top,
													})
												}
											}}
										>
											<td>{user.username}</td>
											<td>{user.email}</td>
											<td>
												{user.permissions
													.map(
														(permission) =>
															permission.name,
													)
													.join(', ')}
											</td>
											<td>
												{user.accessLevels
													.map(
														(accessLevel) =>
															accessLevel.name,
													)
													.join(', ')}
											</td>
											<td aria-hidden="true" />
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</>
			)}
			<div className="draggable-modal-layer">
				{openModals.map((modal) => (
					<DraggableModal
						key={modal.key}
						deleteTooltip={
							modal.kind === 'access-level' &&
							isBuiltInAccessLevel(modal.accessLevel)
								? builtInAccessLevelDeleteTooltip
								: undefined
						}
						id={modal.key}
						initialPosition={modal.initialPosition}
						isDeleteDisabled={
							modal.kind === 'access-level' &&
							isBuiltInAccessLevel(modal.accessLevel)
						}
						isSaveDisabled={
							(modal.mode === 'create' ||
								modal.mode === 'edit') &&
							!validFormModalIds.has(modal.key)
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
							if (
								modal.kind === 'access-level' &&
								modal.accessLevel
							) {
								void deleteAccessLevel(modal.accessLevel)
							} else if (modal.kind === 'user' && modal.user) {
								void deleteUser(modal.user)
							}
						}}
						onEdit={(key) => setModalMode(key, 'edit')}
						saveDisabledTooltip={invalidFormModalTooltips.get(
							modal.key,
						)}
						title={
							modal.kind === 'access-level'
								? getAccessLevelModalTitle(modal.mode)
								: getUserModalTitle(modal.mode)
						}
						infoText={
							modal.kind === 'access-level'
								? modal.accessLevel?.id.toString()
								: modal.user?.id
						}
						zIndex={modal.zIndex}
					>
						{modal.kind === 'access-level' &&
						modal.mode === 'create' ? (
							<AccessLevelEditForm
								autoFocusName
								formId={`${modal.key}-edit-form`}
								modalKey={modal.key}
								onValidityChange={setModalFormValidity}
								onSave={createAccessLevel}
							/>
						) : modal.kind === 'access-level' &&
						  modal.mode === 'edit' &&
						  modal.accessLevel ? (
							<AccessLevelEditForm
								accessLevel={modal.accessLevel}
								autoFocusName
								formId={`${modal.key}-edit-form`}
								modalKey={modal.key}
								onValidityChange={setModalFormValidity}
								onSave={(input) => {
									const accessLevel = modal.accessLevel

									if (!accessLevel) {
										return Promise.resolve()
									}

									return saveAccessLevel(
										accessLevel.id,
										input,
									)
								}}
							/>
						) : modal.kind === 'access-level' &&
						  modal.accessLevel ? (
							<div
								className="access-level-edit-form access-level-details-form access-level-view-form"
								data-selectable="true"
							>
								<label>
									<span>name</span>
									<input
										readOnly
										type="text"
										value={modal.accessLevel.name}
									/>
								</label>
								<label>
									<span>description</span>
									<textarea
										className="access-level-description-input"
										readOnly
										rows={1}
										value={modal.accessLevel.description}
									/>
								</label>
							</div>
						) : modal.kind === 'user' && modal.mode === 'create' ? (
							<UserEditForm
								accessLevels={accessLevels}
								autoFocusFirstName
								formId={`${modal.key}-edit-form`}
								modalKey={modal.key}
								permissions={permissions}
								onValidityChange={setModalFormValidity}
								onSave={(input) =>
									createUser(input as CreateUserInput)
								}
							/>
						) : modal.kind === 'user' &&
						  modal.mode === 'edit' &&
						  modal.user ? (
							<UserEditForm
								accessLevels={accessLevels}
								autoFocusFirstName
								formId={`${modal.key}-edit-form`}
								modalKey={modal.key}
								permissions={permissions}
								user={modal.user}
								onValidityChange={setModalFormValidity}
								onSave={(input) => {
									if (!modal.user) {
										return Promise.resolve()
									}

									return saveUser(
										modal.user,
										input as UpdateUserInput,
									)
								}}
							/>
						) : modal.kind === 'user' && modal.user ? (
							<div
								className="access-level-edit-form security-user-edit-form security-user-details-form"
								data-selectable="true"
							>
								<div className="security-user-name-row">
									<label>
										<span>first name</span>
										<input
											readOnly
											type="text"
											value={modal.user.firstName}
										/>
									</label>
									<label>
										<span>last name</span>
										<input
											readOnly
											type="text"
											value={modal.user.lastName}
										/>
									</label>
								</div>
								<label>
									<span>email</span>
									<input
										readOnly
										type="email"
										value={modal.user.email}
									/>
								</label>
								<div className="security-user-two-column-row">
									<label>
										<span>username</span>
										<input
											readOnly
											type="text"
											value={modal.user.username}
										/>
									</label>
									<label>
										<span>permissions</span>
										<input
											readOnly
											type="text"
											value={modal.user.permissions
												.map(
													(permission) =>
														permission.name,
												)
												.join(', ')}
										/>
									</label>
								</div>
								<label>
									<span>access levels</span>
									<input
										readOnly
										type="text"
										value={modal.user.accessLevels
											.map(
												(accessLevel) =>
													accessLevel.name,
											)
											.join(', ')}
									/>
								</label>
							</div>
						) : null}
					</DraggableModal>
				))}
			</div>
		</section>
	)
}
