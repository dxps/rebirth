import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envFiles = [
	resolve(process.cwd(), '.env'),
	resolve(process.cwd(), '../.env'),
	resolve(process.cwd(), '../../.env'),
]

function parseEnvLine(line: string): [string, string] | undefined {
	const trimmed = line.trim()

	if (!trimmed || trimmed.startsWith('#')) {
		return undefined
	}

	const equalsIndex = trimmed.indexOf('=')

	if (equalsIndex <= 0) {
		return undefined
	}

	const key = trimmed.slice(0, equalsIndex).trim()
	const rawValue = trimmed.slice(equalsIndex + 1).trim()
	const value =
		(rawValue.startsWith('"') && rawValue.endsWith('"')) ||
		(rawValue.startsWith("'") && rawValue.endsWith("'"))
			? rawValue.slice(1, -1)
			: rawValue

	return [key, value]
}

export function loadEnvFiles(): void {
	for (const envFile of envFiles) {
		if (!existsSync(envFile)) {
			continue
		}

		for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
			const entry = parseEnvLine(line)

			if (!entry) {
				continue
			}

			const [key, value] = entry

			if (Bun.env[key] === undefined) {
				Bun.env[key] = value
			}
		}
	}
}
