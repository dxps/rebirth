import { apiRoutes, type UserResponse } from '@rebirth/shared'
import { KeyRound, Save, Shield, UserRound } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'

import { getStoredAuth, setStoredAuth, type StoredAuth } from '../auth'
import { SpaLink } from '../routing'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9908'

export function UserProfileView() {
	const [storedAuth, setStoredAuthState] = useState<StoredAuth | null>(
		getStoredAuth,
	)
	const [email, setEmail] = useState(storedAuth?.user.email ?? '')
	const [firstName, setFirstName] = useState(storedAuth?.user.firstName ?? '')
	const [lastName, setLastName] = useState(storedAuth?.user.lastName ?? '')
	const [currentPassword, setCurrentPassword] = useState('')
	const [newPassword, setNewPassword] = useState('')
	const [userInfoStatus, setUserInfoStatus] = useState<string | null>(null)
	const [passwordStatus, setPasswordStatus] = useState<string | null>(null)
	const [userInfoError, setUserInfoError] = useState<string | null>(null)
	const [passwordError, setPasswordError] = useState<string | null>(null)
	const [isUserInfoSubmitting, setIsUserInfoSubmitting] = useState(false)
	const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false)
	const canUpdatePassword =
		currentPassword.length > 0 &&
		newPassword.length > 0 &&
		currentPassword === newPassword

	useEffect(() => {
		const nextAuth = getStoredAuth()

		setStoredAuthState(nextAuth)
		setEmail(nextAuth?.user.email ?? '')
		setFirstName(nextAuth?.user.firstName ?? '')
		setLastName(nextAuth?.user.lastName ?? '')
	}, [])

	async function updateUserInfo(
		event: FormEvent<HTMLFormElement>,
	): Promise<void> {
		event.preventDefault()

		if (!storedAuth) {
			setUserInfoError('Login is required.')
			return
		}

		setIsUserInfoSubmitting(true)
		setUserInfoError(null)
		setUserInfoStatus(null)

		try {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.userEmail}`,
				{
					body: JSON.stringify({ email, firstName, lastName }),
					headers: {
						Authorization: `Bearer ${storedAuth.sessionKey}`,
						'Content-Type': 'application/json',
					},
					method: 'PUT',
				},
			)

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
			setFirstName(data.data.firstName)
			setLastName(data.data.lastName)
			setUserInfoStatus('User info updated.')
		} catch (error) {
			setUserInfoError(
				error instanceof Error
					? error.message
					: 'Unable to update user info.',
			)
		} finally {
			setIsUserInfoSubmitting(false)
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

		if (!canUpdatePassword) {
			setPasswordError('Both password fields must be filled with the same value.')
			return
		}

		setIsPasswordSubmitting(true)
		setPasswordError(null)
		setPasswordStatus(null)

		try {
			const response = await fetch(
				`${apiBaseUrl}${apiRoutes.userPassword}`,
				{
					body: JSON.stringify({
						currentPassword,
						newPassword,
					}),
					headers: {
						Authorization: `Bearer ${storedAuth.sessionKey}`,
						'Content-Type': 'application/json',
					},
					method: 'PUT',
				},
			)

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
					<p>You need to be authenticated to access this section.</p>
					<SpaLink to="/login">Login</SpaLink>
				</div>
			</section>
		)
	}

	return (
		<section className="profile-view" aria-label="Profile">
			<div className="profile-forms">
				<form className="profile-form" onSubmit={updateUserInfo}>
					<div className="profile-form-heading">
						<UserRound aria-hidden="true" />
						<h2>User Info</h2>
					</div>
					<div className="profile-name-row">
						<label>
							<span>First name</span>
							<input
								autoComplete="given-name"
								type="text"
								value={firstName}
								onChange={(event) => setFirstName(event.target.value)}
							/>
						</label>
						<label>
							<span>Last name</span>
							<input
								autoComplete="family-name"
								type="text"
								value={lastName}
								onChange={(event) => setLastName(event.target.value)}
							/>
						</label>
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
					<label>
						<span>Username</span>
						<input readOnly type="text" value={storedAuth.user.username} />
					</label>
					{userInfoError ? (
						<p className="form-error">{userInfoError}</p>
					) : null}
					{userInfoStatus ? (
						<p className="form-status">{userInfoStatus}</p>
					) : null}
					<button type="submit" disabled={isUserInfoSubmitting}>
						<Save aria-hidden="true" />
						{isUserInfoSubmitting ? 'Updating User Info' : 'Update User Info'}
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
							onChange={(event) =>
								setNewPassword(event.target.value)
							}
						/>
					</label>
					{passwordError ? (
						<p className="form-error">{passwordError}</p>
					) : null}
					{passwordStatus ? (
						<p className="form-status">{passwordStatus}</p>
					) : null}
					<button
						type="submit"
						disabled={isPasswordSubmitting || !canUpdatePassword}
					>
						<KeyRound aria-hidden="true" />
						{isPasswordSubmitting
							? 'Saving password'
							: 'Update Password'}
					</button>
				</form>
				<section className="profile-form profile-permissions-section">
					<div className="profile-form-heading">
						<Shield aria-hidden="true" />
						<h2>Permissions</h2>
					</div>
					<label>
						<span>Permissions</span>
						<input
							readOnly
							type="text"
							value={
								storedAuth.user.permissions
									.map((permission) => permission.name)
									.join(', ') || 'None'
							}
						/>
					</label>
				</section>
			</div>
		</section>
	)
}
