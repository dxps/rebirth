import { Database, Shapes, Shield, User } from 'lucide-react-native'
import { Pressable, StyleSheet, View } from 'react-native'
import { Logo } from '../Logo'
import { type MobileView } from '../navigation'
import { type ThemeColors } from '../theme'

interface FooterNavProps {
	activeView: MobileView
	colors: ThemeColors
	onSelectView: (view: MobileView) => void
}

export function FooterNav({
	activeView,
	colors,
	onSelectView,
}: FooterNavProps) {
	const styles = createStyles(colors)
	const iconColor = colors.foreground

	return (
		<View style={styles.footer}>
			<Pressable
				accessibilityLabel="Rebirth home"
				accessibilityRole="button"
				style={[
					styles.footerItem,
					activeView === 'home' ? styles.activeFooterItem : null,
				]}
				onPress={() => onSelectView('home')}
			>
				<Logo height={26} width={42} />
			</Pressable>
			<Pressable
				accessibilityLabel="Data explorer"
				accessibilityRole="button"
				style={[
					styles.footerItem,
					activeView === 'data-explorer' ? styles.activeFooterItem : null,
				]}
				onPress={() => onSelectView('data-explorer')}
			>
				<Database color={iconColor} size={22} />
			</Pressable>
			<Pressable
				accessibilityLabel="Templates"
				accessibilityRole="button"
				style={[
					styles.footerItem,
					activeView === 'types' ? styles.activeFooterItem : null,
				]}
				onPress={() => onSelectView('types')}
			>
				<Shapes color={iconColor} size={22} />
			</Pressable>
			<Pressable
				accessibilityLabel="Security"
				accessibilityRole="button"
				style={[
					styles.footerItem,
					activeView === 'security' ? styles.activeFooterItem : null,
				]}
				onPress={() => onSelectView('security')}
			>
				<Shield color={iconColor} size={22} />
			</Pressable>
			<Pressable
				accessibilityLabel="User profile"
				accessibilityRole="button"
				style={[
					styles.footerItem,
					activeView === 'profile' ? styles.activeFooterItem : null,
				]}
				onPress={() => onSelectView('profile')}
			>
				<User color={iconColor} size={22} />
			</Pressable>
		</View>
	)
}

function createStyles(colors: ThemeColors) {
	return StyleSheet.create({
		footer: {
			alignItems: 'center',
			backgroundColor: colors.background,
			borderTopColor: colors.border,
			borderTopWidth: 1,
			bottom: 0,
			flexDirection: 'row',
			height: 76,
			justifyContent: 'space-around',
			left: 0,
			paddingHorizontal: 12,
			position: 'absolute',
			right: 0,
		},
		footerItem: {
			alignItems: 'center',
			borderRadius: 8,
			height: 44,
			justifyContent: 'center',
			width: 56,
		},
		activeFooterItem: {
			backgroundColor: 'transparent',
		},
	})
}
