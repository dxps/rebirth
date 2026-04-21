import { apiRoutes, type LoginResponse } from '@rebirth/shared'
import { LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { setStoredAuth } from '../auth'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9908'

export function LoginView() {
	const [identifier, setIdentifier] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)

	async function submitLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()

		const trimmedIdentifier = identifier.trim()

		if (!trimmedIdentifier || !password) {
			setError('Username and password are required.')
			return
		}

		setIsSubmitting(true)
		setError(null)

		try {
			const response = await fetch(`${apiBaseUrl}${apiRoutes.authLogin}`, {
				body: JSON.stringify({
					identifier: trimmedIdentifier,
					password,
				}),
				headers: {
					'Content-Type': 'application/json',
				},
				method: 'POST',
			})

			if (!response.ok) {
				throw new Error('Invalid username or password.')
			}

			const data = (await response.json()) as LoginResponse

			setStoredAuth({
				sessionKey: data.data.sessionKey,
				user: data.data.user,
			})
			window.history.pushState(null, '', '/profile')
			window.dispatchEvent(new PopStateEvent('popstate'))
		} catch (loginError) {
			setError(
				loginError instanceof Error
					? loginError.message
					: 'Unable to login.',
			)
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<section className="login-view" aria-labelledby="login-title">
			<form className="login-form" onSubmit={submitLogin}>
				<div className="login-heading">
					<LogIn aria-hidden="true" />
					<h1 id="login-title">Login</h1>
				</div>
				<label>
					<span>Username or email</span>
					<input
						autoComplete="username"
						autoFocus
						name="username"
						type="text"
						value={identifier}
						onChange={(event) => setIdentifier(event.target.value)}
					/>
				</label>
				<label>
					<span>Password</span>
					<input
						autoComplete="current-password"
						name="password"
						type="password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
					/>
				</label>
				{error ? <p className="form-error">{error}</p> : null}
				<button type="submit" disabled={isSubmitting}>
					<LogIn aria-hidden="true" />
					{isSubmitting ? 'Logging in' : 'Login'}
				</button>
			</form>
		</section>
	)
}
