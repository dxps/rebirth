import type { User } from '@rebirth/shared'

const authStorageKey = 'rebirth.auth'
export const authChangedEventName = 'rebirth:auth-changed'

export interface StoredAuth {
	sessionKey: string
	user: User
}

export function getStoredAuth(): StoredAuth | null {
	const rawAuth = window.localStorage.getItem(authStorageKey)

	if (!rawAuth) {
		return null
	}

	try {
		const auth = JSON.parse(rawAuth) as Partial<StoredAuth>

		if (
			typeof auth.sessionKey === 'string' &&
			auth.user &&
			typeof auth.user === 'object'
		) {
			return auth as StoredAuth
		}
	} catch {
		window.localStorage.removeItem(authStorageKey)
	}

	return null
}

export function setStoredAuth(auth: StoredAuth): void {
	window.localStorage.setItem(authStorageKey, JSON.stringify(auth))
	window.dispatchEvent(new CustomEvent(authChangedEventName))
}

export function clearStoredAuth(): void {
	window.localStorage.removeItem(authStorageKey)
	window.dispatchEvent(new CustomEvent(authChangedEventName))
}
