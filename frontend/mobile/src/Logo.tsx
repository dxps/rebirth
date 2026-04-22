import { Image, StyleSheet } from 'react-native'

interface LogoProps {
	height?: number
	width?: number
}

const logoImage = require('../assets/logo1.png') as number

export function Logo({ height = 86, width = 100 }: LogoProps) {
	return (
		<Image
			accessibilityLabel="Rebirth logo"
			resizeMode="contain"
			source={logoImage}
			style={[styles.logo, { height, width }]}
		/>
	)
}

const styles = StyleSheet.create({
	logo: {
		height: 86,
		width: 100,
	},
})
