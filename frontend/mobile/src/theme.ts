export type ThemeMode = 'light' | 'dark'

export const themes = {
	light: {
		accent: '#af3a03',
    background: '#e2e0d7',
		blue: '#076678',
		border: '#d5c4a1',
		foreground: '#504945',
		green: '#79740e',
		muted: '#7c6f64',
		surface: '#f2e5bc',
	},
	dark: {
		accent: '#fe8019',
		background: '#3c3c3c',
		blue: '#83a598',
		border: '#665c54',
		foreground: '#e0e0e0',
		green: '#b8bb26',
		muted: '#dbd1be',
		surface: '#3c3836',
	},
} as const

export type ThemeColors = (typeof themes)[ThemeMode]
