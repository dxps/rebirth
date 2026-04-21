import { apiRoutes, type UserResponse } from '@rebirth/shared'
import { KeyRound, Mail } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'

import { getStoredAuth, setStoredAuth, type StoredAuth } from '../auth'
import { SpaLink } from '../routing'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9908'

export function UserProfileView() {
	const [storedAuth, setStoredAuthState] = useState<StoredAuth | null>(
		getStoredAuth,
	)
	const [email, setEmail] = useState(storedAuth?.user.email ?? '')
	const [currentPassword, setCurrentPassword] = useState('')
	const [newPassword, setNewPassword] = useState('')
	const [emailStatus, setEmailStatus] = useState<string | null>(null)
	const [passwordStatus, setPasswordStatus] = useState<string | null>(null)
	const [emailError, setEmailError] = useState<string | null>(null)
	const [passwordError, setPasswordError] = useState<string | null>(null)
	const [isEmailSubmitting, setIsEmailSubmitting] = useState(false)
	const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false)

	useEffect(() => {
		const nextAuth = getStoredAuth()

		setStoredAuthState(nextAuth)
		setEmail(nextAuth?.user.email ?? '')
	}, [])

	async function updateEmail(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()

		if (!storedAuth) {
			setEmailError('Login is required.')
			return
		}

		setIsEmailSubmitting(true)
		setEmailError(null)
		setEmailStatus(null)

		try {
			const response = await fetch(`${apiBaseUrl}${apiRoutes.userEmail}`, {
				body: JSON.stringify({ email }),
				headers: {
					Authorization: `Bearer ${storedAuth.sessionKey}`,
					'Content-Type': 'application/json',
				},
				method: 'PUT',
			})

			if (!response.ok) {
				throw new Error('Unable to update email.')
			}

			const data = (await response.json()) as UserResponse
			const nextAuth = {
				...storedAuth,
				user: data.data,
			}

			setStoredAuth(nextAuth)
			setStoredAuthState(nextAuth)
			setEmail(data.data.email)
			setEmailStatus('Email updated.')
		} catch (error) {
			setEmailError(
				error instanceof Error ? error.message : 'Unable to update email.',
			)
		} finally {
			setIsEmailSubmitting(false)
		}
	}

	async function updatePassword(
		event: FormEvent<HTMLFormElement>,
	): Promise<void> {
		event.preventDefault()

		if (!storedAuth) {
			setPasswordError('Login is required.')
			return
		}

		setIsPasswordSubmitting(true)
		setPasswordError(null)
		setPasswordStatus(null)

		try {
			const response = await fetch(`${apiBaseUrl}${apiRoutes.userPassword}`, {
				body: JSON.stringify({
					currentPassword,
					newPassword,
				}),
				headers: {
					Authorization: `Bearer ${storedAuth.sessionKey}`,
					'Content-Type': 'application/json',
				},
				method: 'PUT',
			})

			if (!response.ok) {
				throw new Error(
					response.status === 401
						? 'Current password is incorrect.'
						: 'Unable to update password.',
				)
			}

			setCurrentPassword('')
			setNewPassword('')
			setPasswordStatus('Password updated.')
		} catch (error) {
			setPasswordError(
				error instanceof Error
					? error.message
					: 'Unable to update password.',
			)
		} finally {
			setIsPasswordSubmitting(false)
		}
	}

	if (!storedAuth) {
		return (
			<section className="profile-view">
				<div className="profile-empty">
					<h1>Profile</h1>
					<p>You need to be authenticated to access this view.</p>
					<SpaLink to="/login">Login</SpaLink>
				</div>
			</section>
		)
	}

	return (
		<section className="profile-view" aria-labelledby="profile-title">
			<div className="profile-heading">
				<h1 id="profile-title">Profile</h1>
				<p>{storedAuth.user.username}</p>
			</div>
			<div className="profile-forms">
				<form className="profile-form" onSubmit={updateEmail}>
					<div className="profile-form-heading">
						<Mail aria-hidden="true" />
						<h2>Email</h2>
					</div>
					<label>
						<span>Email</span>
						<input
							autoComplete="email"
							type="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
						/>
					</label>
					{emailError ? <p className="form-error">{emailError}</p> : null}
					{emailStatus ? <p className="form-status">{emailStatus}</p> : null}
					<button type="submit" disabled={isEmailSubmitting}>
						<Mail aria-hidden="true" />
						{isEmailSubmitting ? 'Saving email' : 'Save Email'}
					</button>
				</form>
				<form className="profile-form" onSubmit={updatePassword}>
					<div className="profile-form-heading">
						<KeyRound aria-hidden="true" />
						<h2>Password</h2>
					</div>
					<label>
						<span>Current password</span>
						<input
							autoComplete="current-password"
							type="password"
							value={currentPassword}
							onChange={(event) =>
								setCurrentPassword(event.target.value)
							}
						/>
					</label>
					<label>
						<span>New password</span>
						<input
							autoComplete="new-password"
							type="password"
							value={newPassword}
							onChange={(event) => setNewPassword(event.target.value)}
						/>
					</label>
					{passwordError ? (
						<p className="form-error">{passwordError}</p>
					) : null}
					{passwordStatus ? (
						<p className="form-status">{passwordStatus}</p>
					) : null}
					<button type="submit" disabled={isPasswordSubmitting}>
						<KeyRound aria-hidden="true" />
						{isPasswordSubmitting ? 'Saving password' : 'Save Password'}
					</button>
				</form>
			</div>
		</section>
	)
}
