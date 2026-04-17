import { defineConfig } from 'drizzle-kit'

const env = globalThis as typeof globalThis & {
	process?: {
		env?: Record<string, string | undefined>
	}
}

export default defineConfig({
	dialect: 'postgresql',
	dbCredentials: {
		url: env.process?.env?.DATABASE_URL ?? 'postgres://localhost:5455/rebirth',
	},
	out: './drizzle',
	schema: './src/db/schema/index.ts',
	strict: true,
	verbose: true,
})
