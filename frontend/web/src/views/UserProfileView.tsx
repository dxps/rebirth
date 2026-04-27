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
	const [username, setUsername] = useState(storedAuth?.user.username ?? '')
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
		setUsername(nextAuth?.user.username ?? '')
	}, [])

	async function getResponseErrorMessage(
		response: Response,
		fallback: string,
	): Promise<string> {
		try {
			const payload = (await response.json()) as {
				error?:
					| unknown
					| {
							message?: unknown
					  }
			}

			if (typeof payload.error === 'string' && payload.error.length > 0) {
				return payload.error
			}

			if (
				typeof payload.error === 'object' &&
				payload.error !== null &&
				'message' in payload.error &&
				typeof payload.error.message === 'string' &&
				payload.error.message.length > 0
			) {
				return payload.error.message
			}
		} catch {
			// Ignore invalid error payloads and use the fallback.
		}

		return fallback
	}

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
				`${apiBaseUrl}${apiRoutes.userInfo}`,
				{
					body: JSON.stringify({
						email,
						firstName,
						lastName,
						username,
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
					await getResponseErrorMessage(
						response,
						'Unable to update user info.',
					),
				)
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
			setUsername(data.data.username)
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

	const adminUsernameTooltip =
		storedAuth.user.username === 'admin'
			? 'Admin user cannot rename its username'
			: undefined

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
					<label
						className={
							adminUsernameTooltip
								? 'profile-tooltip-field'
								: undefined
						}
						data-tooltip={adminUsernameTooltip}
					>
						<span>Username</span>
						<input
							type="text"
							readOnly={storedAuth.user.username === 'admin'}
							value={username}
							onChange={(event) =>
								setUsername(event.target.value)
							}
						/>
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
				<section className="profile-form profile-authorization-section">
					<div className="profile-form-heading">
						<Shield aria-hidden="true" />
						<h2>Authorization</h2>
					</div>
					<label>
						<span>Permissions</span>
						<div className="profile-authorization-list">
							{storedAuth.user.permissions.length > 0 ? (
								storedAuth.user.permissions.map((permission) => (
									<span
										key={permission.id}
										className="profile-authorization-item"
										data-tooltip={permission.description}
									>
										{permission.name}
									</span>
								))
							) : (
								<span className="profile-authorization-empty">
									None
								</span>
							)}
						</div>
					</label>
					<label>
						<span>Access Levels</span>
						<div className="profile-authorization-list">
							{storedAuth.user.accessLevels.length > 0 ? (
								storedAuth.user.accessLevels.map((accessLevel) => (
									<span
										key={accessLevel.id}
										className="profile-authorization-item"
										data-tooltip={accessLevel.description}
									>
										{accessLevel.name}
									</span>
								))
							) : (
								<span className="profile-authorization-empty">
									None
								</span>
							)}
						</div>
					</label>
				</section>
			</div>
		</section>
	)
}
