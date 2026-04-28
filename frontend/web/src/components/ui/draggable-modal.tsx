import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
} from 'react'

export interface DraggableModalPosition {
	x: number
	y: number
}

export interface DraggableModalSize {
	height: number
	width: number
}

interface DraggableModalDragBounds {
	margin: number
	minVisibleWidth: number
}

interface DraggableModalRenderState {
	position: DraggableModalPosition
	size: DraggableModalSize
}

interface DraggableModalProps {
	ariaLabel?: string
	children: ReactNode
	contentClassName?: string
	defaultSize?: DraggableModalSize
	dragBounds?: DraggableModalDragBounds
	id?: string
	initialPosition: DraggableModalPosition
	initialSize?: DraggableModalSize
	minSize: DraggableModalSize
	onActivate?: () => void
	onStateChange?: (state: DraggableModalRenderState) => void
	renderTitlebarActions?: (state: DraggableModalRenderState) => ReactNode
	title: string
	useLayer?: boolean
	viewportMargin?: number
	zIndex?: number
}

function clampToRange(value: number, min: number, max: number) {
	return Math.max(min, Math.min(value, max))
}

export function DraggableModal({
	ariaLabel,
	children,
	contentClassName,
	defaultSize,
	dragBounds,
	id,
	initialPosition,
	initialSize,
	minSize,
	onActivate,
	onStateChange,
	renderTitlebarActions,
	title,
	useLayer = true,
	viewportMargin = 16,
	zIndex,
}: DraggableModalProps) {
	const [position, setPosition] = useState(initialPosition)
	const [size, setSize] = useState(() => {
		const requestedSize = initialSize ?? defaultSize ?? minSize

		return {
			height: Math.max(requestedSize.height, minSize.height),
			width: Math.max(requestedSize.width, minSize.width),
		}
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

	useEffect(() => {
		onStateChange?.({ position, size })
	}, [onStateChange, position, size])

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
			onActivate?.()
			dragStart.current = {
				pointerX: event.clientX,
				pointerY: event.clientY,
				x: position.x,
				y: position.y,
			}

			function move(pointerEvent: PointerEvent): void {
				const nextX =
					dragStart.current.x +
					pointerEvent.clientX -
					dragStart.current.pointerX
				const nextY =
					dragStart.current.y +
					pointerEvent.clientY -
					dragStart.current.pointerY

				setPosition(
					dragBounds
						? {
								x: clampToRange(
									nextX,
									dragBounds.margin -
										size.width +
										dragBounds.minVisibleWidth,
									window.innerWidth - dragBounds.margin,
								),
								y: clampToRange(
									nextY,
									dragBounds.margin,
									window.innerHeight - dragBounds.margin,
								),
							}
						: {
								x: nextX,
								y: nextY,
							},
				)
			}

			function stop(): void {
				window.removeEventListener('pointermove', move)
				window.removeEventListener('pointerup', stop)
			}

			window.addEventListener('pointermove', move)
			window.addEventListener('pointerup', stop)
		},
		[dragBounds, onActivate, position.x, position.y, size.width],
	)

	const startResize = useCallback(
		(event: ReactPointerEvent<HTMLButtonElement>) => {
			event.preventDefault()
			onActivate?.()
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
						minSize.height,
						window.innerHeight - position.y - viewportMargin,
					),
					width: clampToRange(
						resizeStart.current.width +
							pointerEvent.clientX -
							resizeStart.current.pointerX,
						minSize.width,
						window.innerWidth - position.x - viewportMargin,
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
			minSize.height,
			minSize.width,
			onActivate,
			position.x,
			position.y,
			size.height,
			size.width,
			viewportMargin,
		],
	)

	const modal = (
			<div
				aria-label={ariaLabel ?? title}
				aria-modal="false"
				className="draggable-modal"
				id={id}
				role="dialog"
				style={{
					height: size.height,
					transform: `translate(${position.x}px, ${position.y}px)`,
					width: size.width,
					zIndex: useLayer ? undefined : zIndex,
				}}
				onPointerDown={onActivate}
			>
				<div className="draggable-modal-body" onPointerDown={startDrag}>
					<div className="draggable-modal-header">
						<h2>{title}</h2>
						{renderTitlebarActions?.({ position, size })}
					</div>
					<div
						className={[
							'draggable-modal-content',
							contentClassName ?? '',
						]
							.filter(Boolean)
							.join(' ')}
					>
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
						<span />
						<span />
						<span />
					</button>
				</div>
			</div>
	)

	if (!useLayer) {
		return modal
	}

	return (
		<div className="draggable-modal-layer" style={{ zIndex }}>
			{modal}
		</div>
	)
}
