import { type ReactNode, useRef, useState } from 'react'
import {
	Animated,
	PanResponder,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
	type GestureResponderEvent,
	type PanResponderGestureState,
} from 'react-native'
import { fonts } from '../fonts'
import { type ThemeColors } from '../theme'

export const DRAGGABLE_MODAL_INITIAL_HEIGHT = 220
export const DRAGGABLE_MODAL_MIN_WIDTH = 280
export const DRAGGABLE_MODAL_VIEWPORT_MARGIN = 16

interface DraggableModalProps {
	children: ReactNode
	colors: ThemeColors
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

export function clampToRange(value: number, min: number, max: number) {
	return Math.max(min, Math.min(value, max))
}

export function DraggableModal({
	children,
	colors,
	id,
	initialPosition,
	onActivate,
	onClose,
	title,
	zIndex,
}: DraggableModalProps) {
	const { width } = useWindowDimensions()
	const pan = useRef(new Animated.ValueXY(initialPosition)).current
	const lastPosition = useRef(initialPosition)
	const [isInteracting, setIsInteracting] = useState(false)
	const modalWidth = Math.min(
		360,
		Math.max(DRAGGABLE_MODAL_MIN_WIDTH, width * 0.86),
	)

	const shouldStartDrag = (
		_event: GestureResponderEvent,
		gesture: PanResponderGestureState,
	) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 2

	const panResponder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => {
				onActivate(id)
				return false
			},
			onMoveShouldSetPanResponder: shouldStartDrag,
			onMoveShouldSetPanResponderCapture: shouldStartDrag,
			onPanResponderGrant: () => {
				onActivate(id)
				setIsInteracting(true)
				pan.setOffset(lastPosition.current)
				pan.setValue({ x: 0, y: 0 })
			},
			onPanResponderMove: Animated.event(
				[null, { dx: pan.x, dy: pan.y }],
				{ useNativeDriver: false },
			),
			onPanResponderRelease: (_event, gesture) => {
				lastPosition.current = {
					x: lastPosition.current.x + gesture.dx,
					y: lastPosition.current.y + gesture.dy,
				}
				pan.flattenOffset()
				setIsInteracting(false)
			},
			onPanResponderTerminate: (_event, gesture) => {
				lastPosition.current = {
					x: lastPosition.current.x + gesture.dx,
					y: lastPosition.current.y + gesture.dy,
				}
				pan.flattenOffset()
				setIsInteracting(false)
			},
			onPanResponderTerminationRequest: () => false,
			onShouldBlockNativeResponder: () => true,
		}),
	).current

	return (
		<Animated.View
			style={[
				styles.modal,
				{
					height: DRAGGABLE_MODAL_INITIAL_HEIGHT,
					shadowColor: '#000000',
					transform: pan.getTranslateTransform(),
					width: modalWidth,
					zIndex,
				},
			]}
		>
			<View
				{...panResponder.panHandlers}
				style={[
					styles.body,
					{
						backgroundColor: colors.surface,
						borderColor: colors.border,
					},
					isInteracting ? styles.preventSelection : null,
				]}
			>
				<View
					style={styles.header}
				>
					<Text
						selectable={false}
						style={[styles.title, { color: colors.foreground }]}
					>
						{title}
					</Text>
					<Pressable
						accessibilityLabel={`Close ${title}`}
						accessibilityRole="button"
						hitSlop={10}
						style={styles.closeButton}
						onPress={() => onClose(id)}
					>
						<Text style={[styles.closeText, { color: colors.muted }]}>x</Text>
					</Pressable>
				</View>
				<ScrollView
					contentContainerStyle={styles.content}
					style={styles.scroller}
				>
					{children}
				</ScrollView>
			</View>
		</Animated.View>
	)
}

const styles = StyleSheet.create({
	modal: {
		borderRadius: 8,
		elevation: 18,
		position: 'absolute',
		shadowOffset: { width: 0, height: 18 },
		shadowOpacity: 0.34,
		shadowRadius: 28,
	},
	body: {
		borderRadius: 8,
		borderWidth: StyleSheet.hairlineWidth,
		flex: 1,
		overflow: 'hidden',
	},
	preventSelection: {
		opacity: 0.98,
	},
	header: {
		alignItems: 'center',
		flexDirection: 'row',
		gap: 10,
		minHeight: 34,
		paddingLeft: 12,
		paddingRight: 4,
		paddingVertical: 4,
	},
	title: {
		flex: 1,
		fontFamily: fonts.extraBold,
		fontSize: 17,
	},
	closeButton: {
		alignItems: 'center',
		borderRadius: 8,
		height: 30,
		justifyContent: 'center',
		width: 30,
	},
	closeText: {
		fontFamily: fonts.regular,
		fontSize: 18,
		lineHeight: 20,
	},
	content: {
		flexGrow: 1,
		paddingHorizontal: 16,
		paddingVertical: 10,
	},
	scroller: {
		flex: 1,
	},
})
