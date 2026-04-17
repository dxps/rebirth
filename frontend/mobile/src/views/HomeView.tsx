import { apiRoutes, appInfo, type HealthResponse } from '@rebirth/shared'
import { Server, Smartphone } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Logo } from '../Logo'
import { fonts } from '../fonts'
import { type ThemeColors } from '../theme'

const apiBaseUrl =
	process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:9908'

interface HomeViewProps {
	colors: ThemeColors
}

const titleStripeTops = [5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57]

export function HomeView({ colors }: HomeViewProps) {
	const [apiStatus, setApiStatus] = useState('Not checked yet')
	const styles = createStyles(colors)

	async function checkApiHealth(): Promise<void> {
		try {
			const response = await fetch(`${apiBaseUrl}${apiRoutes.health}`)
			const health = (await response.json()) as HealthResponse
			setApiStatus(`${health.appName} API is ${health.status}`)
		} catch {
			setApiStatus('API is unreachable from this device')
		}
	}

	return (
		<View style={styles.container}>
			<View style={styles.logo}>
				<Logo />
			</View>
			<StripedTitle colors={colors} styles={styles} title={appInfo.name} />
			<Text style={styles.description}>{appInfo.description}</Text>

			<View style={styles.actions}>
				<Pressable
					accessibilityRole="button"
					style={styles.primaryButton}
					onPress={checkApiHealth}
				>
					<Server color={colors.background} size={18} />
					<Text style={styles.primaryButtonText}>
						Check API health
					</Text>
				</Pressable>
				<View style={styles.nativeBadge}>
					<Smartphone color={colors.background} size={18} />
					<Text style={styles.nativeBadgeText}>
						React Native ready
					</Text>
				</View>
			</View>

			<View style={styles.status}>
				<Server color={colors.green} size={18} />
				<Text style={styles.statusText}>{apiStatus}</Text>
			</View>
			<Text style={styles.route}>
				Service route: {apiBaseUrl}
				{apiRoutes.health}
			</Text>
		</View>
	)
}

interface StripedTitleProps {
	colors: ThemeColors
	styles: ReturnType<typeof createStyles>
	title: string
}

function StripedTitle({ colors, styles, title }: StripedTitleProps) {
	return (
		<View
			accessibilityLabel={title}
			accessible
			style={styles.titleFrame}
		>
			<Text
				accessibilityElementsHidden
				importantForAccessibility="no"
				style={styles.title}
			>
				{title}
			</Text>
			<View
				pointerEvents="none"
				style={StyleSheet.absoluteFill}
			>
				{titleStripeTops.map((top) => (
					<View
						key={top}
						style={[
							styles.titleStripe,
							{ backgroundColor: colors.background, top },
						]}
					/>
				))}
			</View>
		</View>
	)
}

function createStyles(colors: ThemeColors) {
	return StyleSheet.create({
		container: {
			flex: 1,
			justifyContent: 'center',
			paddingBottom: 104,
			paddingHorizontal: 24,
			paddingTop: 24,
		},
		eyebrow: {
			color: colors.green,
			fontFamily: fonts.black,
			fontSize: 13,
			letterSpacing: 0,
			marginBottom: 12,
			textTransform: 'uppercase',
		},
		logo: {
			alignSelf: 'flex-start',
			marginBottom: 16,
		},
		titleFrame: {
			alignSelf: 'flex-start',
			overflow: 'hidden',
			position: 'relative',
		},
		title: {
			color: colors.foreground,
			fontFamily: fonts.extraBold,
			fontSize: 56,
			lineHeight: 60,
		},
		titleStripe: {
			height: 1,
			left: 0,
			position: 'absolute',
			right: 0,
		},
		description: {
			color: colors.muted,
			fontFamily: fonts.regular,
			fontSize: 18,
			lineHeight: 28,
			marginBottom: 24,
			marginTop: 20,
		},
		actions: {
			alignItems: 'flex-start',
			gap: 12,
		},
		primaryButton: {
			alignItems: 'center',
			backgroundColor: colors.foreground,
			borderRadius: 8,
			flexDirection: 'row',
			gap: 8,
			minHeight: 40,
			paddingHorizontal: 12,
		},
		primaryButtonText: {
			color: colors.background,
			fontFamily: fonts.regular,
			fontSize: 16,
		},
		nativeBadge: {
			alignItems: 'center',
			backgroundColor: colors.muted,
			borderRadius: 8,
			flexDirection: 'row',
			gap: 8,
			minHeight: 40,
			paddingHorizontal: 12,
		},
		nativeBadgeText: {
			color: colors.background,
			fontFamily: fonts.regular,
			fontSize: 15,
		},
		status: {
			alignItems: 'center',
			flexDirection: 'row',
			gap: 8,
			marginTop: 24,
		},
		statusText: {
			color: colors.green,
			fontFamily: fonts.extraBold,
			fontSize: 16,
		},
		route: {
			color: colors.muted,
			fontFamily: fonts.regular,
			fontSize: 14,
			lineHeight: 22,
			marginTop: 8,
		},
	})
}
