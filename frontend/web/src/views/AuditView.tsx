import {
	apiRoutes,
	PermissionName,
	type AuditEvent,
	type AuditEventsResponse,
} from '@rebirth/shared'
import { RefreshCw, X } from 'lucide-react'
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from 'react'

import {
	authChangedEventName,
	getStoredAuth,
	hasStoredPermission,
	type StoredAuth,
} from '../auth'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9908'
const auditModalMargin = 16
const auditModalWidth = 540
const auditModalHeight = 360
const auditModalMinWidth = 380

function clampToRange(value: number, min: number, max: number): number {
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

function hasAuditAccess(auth: StoredAuth | null): boolean {
	return Boolean(
		hasStoredPermission(auth, PermissionName.Admin) ||
			hasStoredPermission(auth, PermissionName.Audit),
	)
}

function formatAuditContent(content: string): string {
	try {
		return JSON.stringify(JSON.parse(content), null, 2)
	} catch {
		return content
	}
}

function formatAuditCreatedAt(createdAt: Date | string): string {
	const date = createdAt instanceof Date ? createdAt : new Date(createdAt)

	if (Number.isNaN(date.getTime())) {
		return String(createdAt)
	}

	return date.toLocaleString()
}

interface AuditDetailsModalProps {
	event: AuditEvent
	initialPosition: {
		x: number
		y: number
	}
	onClose: () => void
}

function AuditDetailsModal({
	event,
	initialPosition,
	onClose,
}: AuditDetailsModalProps) {
	const [position, setPosition] = useState(initialPosition)
	const [size, setSize] = useState({
		height: Math.min(
			auditModalHeight,
			window.innerHeight - auditModalMargin * 2,
		),
		width: Math.min(
			auditModalWidth,
			window.innerWidth - auditModalMargin * 2,
		),
	})
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
		(pointerEvent: ReactPointerEvent<HTMLElement>) => {
			const target = pointerEvent.target

			if (
				target instanceof HTMLElement &&
				target.closest('[data-no-drag="true"]')
			) {
				return
			}

			pointerEvent.preventDefault()
			dragStart.current = {
				pointerX: pointerEvent.clientX,
				pointerY: pointerEvent.clientY,
				x: position.x,
				y: position.y,
			}

			function move(event: PointerEvent): void {
				setPosition({
					x:
						dragStart.current.x +
						event.clientX -
						dragStart.current.pointerX,
					y:
						dragStart.current.y +
						event.clientY -
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
		[position.x, position.y],
	)

	const startResize = useCallback(
		(pointerEvent: ReactPointerEvent<HTMLButtonElement>) => {
			pointerEvent.preventDefault()
			resizeStart.current = {
				height: size.height,
				pointerX: pointerEvent.clientX,
				pointerY: pointerEvent.clientY,
				width: size.width,
			}

			function move(event: PointerEvent): void {
				setSize({
					height: clampToRange(
						resizeStart.current.height +
							event.clientY -
							resizeStart.current.pointerY,
						260,
						window.innerHeight - position.y - auditModalMargin,
					),
					width: clampToRange(
						resizeStart.current.width +
							event.clientX -
							resizeStart.current.pointerX,
						auditModalMinWidth,
						window.innerWidth - position.x - auditModalMargin,
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
				aria-label="Audit entry"
				aria-modal="false"
				className="draggable-modal audit-details-modal"
				role="dialog"
				style={{
					height: size.height,
					transform: `translate(${position.x}px, ${position.y}px)`,
					width: size.width,
				}}
			>
				<div className="draggable-modal-body" onPointerDown={startDrag}>
					<div className="draggable-modal-header">
						<h2>Audit Entry</h2>
						<button
							aria-label="Close Audit Entry"
							className="draggable-modal-titlebar-button draggable-modal-close"
							data-no-drag="true"
							type="button"
							onClick={onClose}
						>
							<X aria-hidden="true" />
						</button>
					</div>
					<div
						className="draggable-modal-content audit-details-content"
						data-no-drag="true"
					>
						<table className="audit-details-meta-table">
							<tbody>
								<tr>
									<th>id</th>
									<td>{event.id}</td>
								</tr>
								<tr>
									<th>name</th>
									<td>{event.name}</td>
								</tr>
								<tr>
									<th>created at</th>
									<td>{formatAuditCreatedAt(event.createdAt)}</td>
								</tr>
							</tbody>
						</table>
						<div className="audit-details-content-block">
							<p>content</p>
							<pre>{formatAuditContent(event.content)}</pre>
						</div>
					</div>
					<button
						aria-label="Resize Audit Entry"
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

export function AuditView() {
	const [storedAuth, setStoredAuth] = useState<StoredAuth | null>(
		getStoredAuth,
	)
	const [auditEvents, setAuditEvents] = useState<AuditEventsResponse['data']>(
		[],
	)
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [selectedAuditEvent, setSelectedAuditEvent] =
		useState<AuditEvent | null>(null)
	const [selectedAuditEventPosition, setSelectedAuditEventPosition] =
		useState({ x: auditModalMargin, y: auditModalMargin })
	const loadRequestId = useRef(0)
	const isAuthorized = hasAuditAccess(storedAuth)

	function openAuditEvent(
		event: AuditEvent,
		point: { clientX: number; clientY: number },
	): void {
		const modalWidth = Math.min(
			auditModalWidth,
			window.innerWidth - auditModalMargin * 2,
		)
		const modalHeight = Math.min(
			auditModalHeight,
			window.innerHeight - auditModalMargin * 2,
		)

		setSelectedAuditEvent(event)
		setSelectedAuditEventPosition({
			x: clampToRange(
				point.clientX - modalWidth * 0.3,
				auditModalMargin,
				window.innerWidth - modalWidth - auditModalMargin,
			),
			y: clampToRange(
				point.clientY - 48,
				auditModalMargin,
				window.innerHeight - modalHeight - auditModalMargin,
			),
		})
	}

	const loadAuditEvents = useCallback(async (): Promise<void> => {
		const requestId = loadRequestId.current + 1
		loadRequestId.current = requestId
		setIsLoading(true)

		try {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.auditEvents}`,
				{
					headers: getAuthHeaders(),
				},
			)

			if (!response.ok) {
				throw new Error('Unable to load audit events')
			}

			const data = (await response.json()) as AuditEventsResponse

			if (requestId === loadRequestId.current) {
				setAuditEvents(data.data)
				setError(null)
			}
		} catch {
			if (requestId === loadRequestId.current) {
				setError('Audit entries are unavailable')
			}
		} finally {
			if (requestId === loadRequestId.current) {
				setIsLoading(false)
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
		if (isAuthorized) {
			void loadAuditEvents()
		} else {
			setIsLoading(false)
		}
	}, [isAuthorized, loadAuditEvents])

	if (!isAuthorized) {
		return (
			<section className="types-mgmt-view audit-view">
				<div className="access-level-unavailable" role="status">
					<p>
						{storedAuth
							? 'You are not authorized to access this section.'
							: 'You must be authenticated to access this section.'}
					</p>
				</div>
			</section>
		)
	}

	return (
		<section className="types-mgmt-view audit-view">
			<div className="types-mgmt-section">
				<div className="section-heading">
					<p>Audit</p>
				</div>
				{error ? (
					<div className="access-level-unavailable" role="status">
						<p>{error}</p>
						<button
							aria-label="Refresh audit entries"
							className="access-level-refresh-button"
							data-tooltip="Try again"
							type="button"
							onClick={() => void loadAuditEvents()}
						>
							<RefreshCw aria-hidden="true" />
						</button>
					</div>
				) : (
					<div className="data-table-wrap">
						<table className="data-table audit-table">
							<thead>
								<tr>
									<th>name</th>
									<th>content</th>
									<th>created at</th>
								</tr>
							</thead>
							<tbody>
								{isLoading ? (
									<tr>
										<td colSpan={3}>
											Loading audit entries
										</td>
									</tr>
								) : auditEvents.length === 0 ? (
									<tr>
										<td
											className="data-table-empty-cell"
											colSpan={3}
										>
											<span>There are no entries</span>
										</td>
									</tr>
								) : (
									auditEvents.map((event) => (
										<tr
											key={event.id}
											className="data-table-row"
											tabIndex={0}
											onClick={(clickEvent) =>
												openAuditEvent(event, clickEvent)
											}
											onKeyDown={(keyEvent) => {
												if (
													keyEvent.key === 'Enter' ||
													keyEvent.key === ' '
												) {
													keyEvent.preventDefault()
													const rect =
														keyEvent.currentTarget.getBoundingClientRect()
													openAuditEvent(event, {
														clientX: rect.left,
														clientY: rect.top,
													})
												}
											}}
										>
											<td>
												<span>{event.name}</span>
											</td>
											<td>
												<span>
													{formatAuditContent(
														event.content,
													)}
												</span>
											</td>
											<td>
												<span>
													{formatAuditCreatedAt(
														event.createdAt,
													)}
												</span>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
						<div className="audit-refresh-row">
							<button
								aria-label="Refresh audit entries"
								className="access-level-refresh-button"
								data-tooltip="Refresh"
								type="button"
								onClick={() => void loadAuditEvents()}
							>
								<RefreshCw aria-hidden="true" />
							</button>
						</div>
					</div>
				)}
			</div>
			{selectedAuditEvent ? (
				<AuditDetailsModal
					key={selectedAuditEvent.id}
					event={selectedAuditEvent}
					initialPosition={selectedAuditEventPosition}
					onClose={() => setSelectedAuditEvent(null)}
				/>
			) : null}
		</section>
	)
}
