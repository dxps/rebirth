import { apiRoutes, type AccessLevel, type AccessLevelsResponse } from '@rebirth/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
	type GestureResponderEvent,
} from 'react-native'
import {
	DRAGGABLE_MODAL_INITIAL_HEIGHT,
	DRAGGABLE_MODAL_MIN_WIDTH,
	DRAGGABLE_MODAL_VIEWPORT_MARGIN,
	DraggableModal,
	clampToRange,
} from '../components/DraggableModal'
import { fonts } from '../fonts'
import { type ThemeColors } from '../theme'

const apiBaseUrl =
	process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:9908'

interface SecurityViewProps {
	colors: ThemeColors
}

interface OpenAccessLevelModal {
	accessLevel: AccessLevel
	initialPosition: {
		x: number
		y: number
	}
	key: string
	zIndex: number
}

export function SecurityView({ colors }: SecurityViewProps) {
	const { height, width } = useWindowDimensions()
	const [accessLevels, setAccessLevels] = useState<AccessLevel[]>([])
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [openModals, setOpenModals] = useState<OpenAccessLevelModal[]>([])
	const nextZIndex = useRef(1)
	const styles = createStyles(colors)

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
		(accessLevel: AccessLevel, event: GestureResponderEvent) => {
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
					Math.max(DRAGGABLE_MODAL_MIN_WIDTH, width * 0.86),
				)
				const pointerOffset = 10
				const x = clampToRange(
					event.nativeEvent.pageX + pointerOffset,
					DRAGGABLE_MODAL_VIEWPORT_MARGIN,
					width - modalWidth - DRAGGABLE_MODAL_VIEWPORT_MARGIN,
				)
				const y = clampToRange(
					event.nativeEvent.pageY + pointerOffset,
					DRAGGABLE_MODAL_VIEWPORT_MARGIN,
					height -
						DRAGGABLE_MODAL_INITIAL_HEIGHT -
						DRAGGABLE_MODAL_VIEWPORT_MARGIN,
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
		[height, width],
	)

	function renderRows() {
		if (isLoading) {
			return <Text style={styles.status}>Loading access levels</Text>
		}

		if (error) {
			return <Text style={styles.status}>{error}</Text>
		}

		if (accessLevels.length === 0) {
			return <Text style={styles.status}>There are no entries</Text>
		}

		return accessLevels.map((accessLevel) => (
			<Pressable
				key={accessLevel.id}
				accessibilityLabel={`Open details for ${accessLevel.name}`}
				accessibilityRole="button"
				style={({ pressed }) => [
					styles.row,
					pressed ? styles.pressedRow : null,
				]}
				onPress={(event) => openAccessLevel(accessLevel, event)}
			>
				<Text style={styles.name}>{accessLevel.name}</Text>
				<Text style={styles.description}>{accessLevel.description}</Text>
			</Pressable>
		))
	}

	return (
		<View style={styles.screen}>
			<ScrollView
				contentContainerStyle={styles.container}
				style={styles.scrollView}
			>
				<Text style={styles.sectionTitle}>Access Levels</Text>
				<View style={styles.table}>
					<View style={styles.headerRow}>
						<Text style={styles.headerName}>name</Text>
						<Text style={styles.headerDescription}>description</Text>
					</View>
					{renderRows()}
				</View>
			</ScrollView>
			<View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
				{openModals.map((modal) => (
					<DraggableModal
						key={modal.key}
						colors={colors}
						id={modal.key}
						initialPosition={modal.initialPosition}
						onActivate={bringToFront}
						onClose={closeModal}
						title={modal.accessLevel.name}
						zIndex={modal.zIndex}
					>
						<View style={styles.detailGroup}>
							<Text style={styles.detailLabel}>id</Text>
							<Text style={styles.detailValue}>{modal.accessLevel.id}</Text>
						</View>
						<View style={styles.detailGroup}>
							<Text style={styles.detailLabel}>name</Text>
							<Text style={styles.detailValue}>{modal.accessLevel.name}</Text>
						</View>
						<View style={styles.detailGroup}>
							<Text style={styles.detailLabel}>description</Text>
							<Text style={styles.detailValue}>
								{modal.accessLevel.description}
							</Text>
						</View>
					</DraggableModal>
				))}
			</View>
		</View>
	)
}

function createStyles(colors: ThemeColors) {
	return StyleSheet.create({
		screen: {
			flex: 1,
		},
		scrollView: {
			flex: 1,
		},
		container: {
			paddingBottom: 104,
			paddingHorizontal: 24,
			paddingTop: 88,
		},
		sectionTitle: {
			color: colors.green,
			fontFamily: fonts.regular,
			fontSize: 16,
		},
		table: {
			marginTop: 20,
		},
		headerRow: {
			borderBottomColor: colors.border,
			borderBottomWidth: 1,
			flexDirection: 'row',
			paddingBottom: 6,
		},
		headerName: {
			color: colors.muted,
			flex: 0.8,
			fontFamily: fonts.regular,
			fontSize: 12,
		},
		headerDescription: {
			color: colors.muted,
			flex: 1.4,
			fontFamily: fonts.regular,
			fontSize: 12,
		},
		row: {
			borderBottomColor: colors.border,
			borderBottomWidth: 1,
			flexDirection: 'row',
			gap: 12,
			paddingVertical: 9,
		},
		pressedRow: {
			backgroundColor: colors.surface,
			borderRadius: 6,
		},
		name: {
			color: colors.foreground,
			flex: 0.8,
			fontFamily: fonts.regular,
			fontSize: 15,
		},
		description: {
			color: colors.muted,
			flex: 1.4,
			fontFamily: fonts.regular,
			fontSize: 15,
			lineHeight: 21,
		},
		status: {
			borderBottomColor: colors.border,
			borderBottomWidth: 1,
			color: colors.muted,
			fontFamily: fonts.regular,
			fontSize: 15,
			paddingVertical: 9,
		},
		detailGroup: {
			marginBottom: 14,
		},
		detailLabel: {
			color: colors.muted,
			fontFamily: fonts.regular,
			fontSize: 12,
			marginBottom: 3,
		},
		detailValue: {
			color: colors.foreground,
			fontFamily: fonts.regular,
			fontSize: 15,
			lineHeight: 21,
		},
	})
}
