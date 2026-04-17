import { apiRoutes, type AccessLevel, type AccessLevelsResponse } from '@rebirth/shared'
import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { fonts } from '../fonts'
import { type ThemeColors } from '../theme'

const apiBaseUrl =
	process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:9908'

interface SecurityViewProps {
	colors: ThemeColors
}

export function SecurityView({ colors }: SecurityViewProps) {
	const [accessLevels, setAccessLevels] = useState<AccessLevel[]>([])
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
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
					setAccessLevels(data.accessLevels)
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

	function renderRows() {
		if (isLoading) {
			return <Text style={styles.status}>Loading access levels</Text>
		}

		if (error) {
			return <Text style={styles.status}>{error}</Text>
		}

		if (accessLevels.length === 0) {
			return <Text style={styles.status}>No access levels found</Text>
		}

		return accessLevels.map((accessLevel) => (
			<View key={accessLevel.id} style={styles.row}>
				<Text style={styles.name}>{accessLevel.name}</Text>
				<Text style={styles.description}>{accessLevel.description}</Text>
			</View>
		))
	}

	return (
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
	)
}

function createStyles(colors: ThemeColors) {
	return StyleSheet.create({
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
	})
}
