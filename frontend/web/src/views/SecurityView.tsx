import { apiRoutes, type AccessLevel, type AccessLevelsResponse } from '@rebirth/shared'
import {
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
const draggableModalMinWidth = 280

interface OpenAccessLevelModal {
	accessLevel: AccessLevel
	initialPosition: {
		x: number
		y: number
	}
	key: string
	zIndex: number
}

interface DraggableModalProps {
	children: ReactNode
	id: string
	initialPosition: {
		x: number
		y: number
	}
	onActivate: (id: string) => void
	onClose: (id: string) => void
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
	onActivate,
	onClose,
	title,
	zIndex,
}: DraggableModalProps) {
	const [position, setPosition] = useState(initialPosition)
	const [size, setSize] = useState({
		height: draggableModalHeight,
		width: Math.min(360, Math.max(draggableModalMinWidth, window.innerWidth * 0.86)),
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
						180,
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
		[id, onActivate, position.x, position.y, size.height, size.width],
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
				<div
					className="draggable-modal-header"
				>
					<h2>{title}</h2>
					<button
						aria-label={`Close ${title}`}
						className="draggable-modal-close"
						data-no-drag="true"
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

export function SecurityView() {
	const [accessLevels, setAccessLevels] = useState<AccessLevel[]>([])
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [openModals, setOpenModals] = useState<OpenAccessLevelModal[]>([])
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

	const openAccessLevel = useCallback(
		(accessLevel: AccessLevel, point: { clientX: number; clientY: number }) => {
			nextZIndex.current += 1
			setOpenModals((current) => {
				const existing = current.find(
					(modal) => modal.accessLevel.id === accessLevel.id,
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
						zIndex: nextZIndex.current,
					},
				]
			})
		},
		[],
	)

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
						onActivate={bringToFront}
						onClose={closeModal}
						title={modal.accessLevel.name}
						zIndex={modal.zIndex}
					>
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
					</DraggableModal>
				))}
			</div>
		</section>
	)
}
