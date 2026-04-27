import { Button } from '@/components/ui/button'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import { apiRoutes, PermissionName } from '@rebirth/shared'
import {
	Database,
	House,
	LogIn,
	LogOut,
	Menu,
	Moon,
	ScrollText,
	Shapes,
	Shield,
	Sun,
	User,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
	authChangedEventName,
	clearStoredAuth,
	getStoredAuth,
	hasStoredPermission,
} from '../auth'
import { SpaLink, type AppPath } from '../routing'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9908'

interface HeaderProps {
	onToggleTheme: () => void
	theme: 'light' | 'dark'
}

export function Header({ onToggleTheme, theme }: HeaderProps) {
	const userMenuRef = useRef<HTMLDivElement>(null)
	const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
	const [storedAuth, setStoredAuth] = useState(getStoredAuth)
	const isLoggedIn = storedAuth !== null
	const canAccessData =
		hasStoredPermission(storedAuth, PermissionName.Admin) ||
		hasStoredPermission(storedAuth, PermissionName.Editor) ||
		hasStoredPermission(storedAuth, PermissionName.Viewer)
	const canAccessSecurity = hasStoredPermission(
		storedAuth,
		PermissionName.Admin,
	)
	const canAccessAudit = Boolean(
		storedAuth?.user.username === 'admin' ||
		storedAuth?.user.accessLevels.some(
			(accessLevel) => accessLevel.name.toLowerCase() === 'audit',
		),
	)

	useEffect(() => {
		function closeUserMenuOnOutsideClick(event: PointerEvent): void {
			if (!userMenuRef.current?.contains(event.target as Node)) {
				setIsUserMenuOpen(false)
			}
		}

		document.addEventListener('pointerdown', closeUserMenuOnOutsideClick)

		return () => {
			document.removeEventListener(
				'pointerdown',
				closeUserMenuOnOutsideClick,
			)
		}
	}, [])

	useEffect(() => {
		function syncAuthState(): void {
			setStoredAuth(getStoredAuth())
		}

		window.addEventListener(authChangedEventName, syncAuthState)
		window.addEventListener('storage', syncAuthState)

		return () => {
			window.removeEventListener(authChangedEventName, syncAuthState)
			window.removeEventListener('storage', syncAuthState)
		}
	}, [])

	function toggleTheme(): void {
		onToggleTheme()
		setIsUserMenuOpen(false)
	}

	async function logout(): Promise<void> {
		const currentAuth = getStoredAuth()

		if (currentAuth) {
			try {
				await fetch(`${apiBaseUrl}${apiRoutes.authLogout}`, {
					headers: {
						Authorization: `Bearer ${currentAuth.sessionKey}`,
					},
					method: 'POST',
				})
			} catch {
				// Local logout should still happen when the session is already gone.
			}
		}

		clearStoredAuth()
		setIsUserMenuOpen(false)
		window.history.pushState(null, '', '/')
		window.dispatchEvent(new PopStateEvent('popstate'))
	}

	return (
		<header className="app-header">
			<SpaLink ariaLabel="Rebirth home" className="brand" to="/">
				<img src="/logo1.png" alt="" />
			</SpaLink>
			<TooltipProvider>
				<nav className="header-nav" aria-label="Primary navigation">
					<HeaderNavLink label="Home" to="/">
						<House aria-hidden="true" />
					</HeaderNavLink>
					{canAccessData ? (
						<>
							<HeaderNavLink
								label="Data Explorer"
								to="/data-explorer"
							>
								<Database aria-hidden="true" />
							</HeaderNavLink>
							<HeaderNavLink label="Templates" to="/templates">
								<Shapes aria-hidden="true" />
							</HeaderNavLink>
						</>
					) : null}
					{canAccessSecurity ? (
						<HeaderNavLink label="Security" to="/security">
							<Shield aria-hidden="true" />
						</HeaderNavLink>
					) : null}
					{canAccessAudit ? (
						<HeaderNavLink label="Audit" to="/audit">
							<ScrollText aria-hidden="true" />
						</HeaderNavLink>
					) : null}
				</nav>
			</TooltipProvider>
			<div className="header-actions" ref={userMenuRef}>
				<Button
					aria-expanded={isUserMenuOpen}
					aria-haspopup="menu"
					aria-label="Open user menu"
					className="icon-button header-user-button"
					size="icon"
					type="button"
					variant="ghost"
					onClick={() => setIsUserMenuOpen((current) => !current)}
				>
					<Menu aria-hidden="true" />
				</Button>
				{isUserMenuOpen ? (
					<div className="user-menu" role="menu">
						{isLoggedIn ? (
							<>
								<SpaLink
									role="menuitem"
									to="/user-profile"
									onNavigate={() => setIsUserMenuOpen(false)}
								>
									<User aria-hidden="true" />
									Profile
								</SpaLink>
								<Button
									className="theme-toggle"
									role="menuitem"
									type="button"
									variant="ghost"
									onClick={logout}
								>
									<LogOut aria-hidden="true" />
									Logout
								</Button>
							</>
						) : (
							<SpaLink
								role="menuitem"
								to="/login"
								onNavigate={() => setIsUserMenuOpen(false)}
							>
								<LogIn aria-hidden="true" />
								Login
							</SpaLink>
						)}
						<Button
							aria-label={
								theme === 'light'
									? 'Switch to dark theme'
									: 'Switch to light theme'
							}
							className="theme-toggle"
							role="menuitem"
							title={
								theme === 'light'
									? 'Switch to dark theme'
									: 'Switch to light theme'
							}
							type="button"
							variant="ghost"
							onClick={toggleTheme}
						>
							{theme === 'light' ? (
								<Moon aria-hidden="true" />
							) : (
								<Sun aria-hidden="true" />
							)}
							Toggle Theme
						</Button>
					</div>
				) : null}
			</div>
		</header>
	)
}

interface HeaderNavLinkProps {
	children: ReactNode
	label: string
	to: AppPath
}

function HeaderNavLink({ children, label, to }: HeaderNavLinkProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<SpaLink ariaLabel={label} className="header-nav-link" to={to}>
					{children}
				</SpaLink>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}
