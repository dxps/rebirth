import {
	WorkSans_400Regular,
	WorkSans_800ExtraBold,
	WorkSans_900Black,
	useFonts,
} from '@expo-google-fonts/work-sans'
import { Moon, Sun } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import {
	Platform,
	Pressable,
	SafeAreaView,
	StyleSheet,
	StatusBar,
	useColorScheme,
	View,
} from 'react-native'
import { FooterNav } from './src/components/FooterNav'
import { type MobileView } from './src/navigation'
import { themes, type ThemeColors, type ThemeMode } from './src/theme'
import { HomeView } from './src/views/HomeView'
import { PageLabelView } from './src/views/PageLabelView'

export default function App() {
	const deviceTheme = useColorScheme()
	const [fontsLoaded] = useFonts({
		WorkSans_400Regular,
		WorkSans_800ExtraBold,
		WorkSans_900Black,
	})
	const [theme, setTheme] = useState<ThemeMode>(
		deviceTheme === 'dark' ? 'dark' : 'light',
	)
	const [activeView, setActiveView] = useState<MobileView>('home')
	const colors = themes[theme]
	const styles = useMemo(() => createStyles(colors), [colors])
	const themeIcon =
		theme === 'light' ? (
			<Moon color={colors.foreground} size={18} />
		) : (
			<Sun color={colors.foreground} size={18} />
		)

	if (!fontsLoaded) {
		return (
			<SafeAreaView style={styles.safeArea}>
				<StatusBar
					backgroundColor={colors.background}
					barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
				/>
			</SafeAreaView>
		)
	}

	function renderView() {
		switch (activeView) {
			case 'data-explorer':
				return <PageLabelView colors={colors} title="Data Explorer" />
			case 'types':
				return <PageLabelView colors={colors} title="Types Mgmt" />
			case 'profile':
				return <PageLabelView colors={colors} title="User Profile" />
			case 'home':
				return <HomeView colors={colors} />
		}
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<StatusBar
				backgroundColor={colors.background}
				barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
			/>
			<View style={styles.screen}>
				{renderView()}
				<View pointerEvents="box-none" style={styles.topBar}>
					<Pressable
						accessibilityLabel={
							theme === 'light'
								? 'Switch to dark theme'
								: 'Switch to light theme'
						}
						accessibilityRole="button"
						hitSlop={8}
						style={({ pressed }) => [
							styles.themeButton,
							pressed ? styles.themeButtonPressed : null,
						]}
						onPress={() =>
							setTheme((current) =>
								current === 'light' ? 'dark' : 'light',
							)
						}
					>
						{themeIcon}
					</Pressable>
				</View>
				<FooterNav
					activeView={activeView}
					colors={colors}
					onSelectView={setActiveView}
				/>
			</View>
		</SafeAreaView>
	)
}

function createStyles(colors: ThemeColors) {
	return StyleSheet.create({
		safeArea: {
			backgroundColor: colors.background,
			flex: 1,
		},
		screen: {
			backgroundColor: colors.background,
			flex: 1,
		},
		topBar: {
			left: 0,
			paddingHorizontal: 24,
			paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 24,
			position: 'absolute',
			right: 0,
			top: 0,
			zIndex: 10,
		},
		themeButton: {
			alignItems: 'center',
			backgroundColor: 'transparent',
			borderRadius: 8,
			height: 40,
			justifyContent: 'center',
			width: 40,
		},
		themeButtonPressed: {
			opacity: 0.72,
		},
	})
}
