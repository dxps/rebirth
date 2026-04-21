import { useEffect, useRef, useState, type ReactNode } from "react";
import { Database, House, LogIn, LogOut, Moon, Shapes, Shield, Sun, User } from "lucide-react";
import { apiRoutes } from "@rebirth/shared";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { authChangedEventName, clearStoredAuth, getStoredAuth } from "../auth";
import { SpaLink, type AppPath } from "../routing";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:9908";

interface HeaderProps {
  onToggleTheme: () => void;
  theme: "light" | "dark";
}

export function Header({ onToggleTheme, theme }: HeaderProps) {
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => getStoredAuth() !== null);

  useEffect(() => {
    function closeUserMenuOnOutsideClick(event: PointerEvent): void {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeUserMenuOnOutsideClick);

    return () => {
      document.removeEventListener("pointerdown", closeUserMenuOnOutsideClick);
    };
  }, []);

  useEffect(() => {
    function syncAuthState(): void {
      setIsLoggedIn(getStoredAuth() !== null);
    }

    window.addEventListener(authChangedEventName, syncAuthState);
    window.addEventListener("storage", syncAuthState);

    return () => {
      window.removeEventListener(authChangedEventName, syncAuthState);
      window.removeEventListener("storage", syncAuthState);
    };
  }, []);

  function toggleTheme(): void {
    onToggleTheme();
    setIsUserMenuOpen(false);
  }

  async function logout(): Promise<void> {
    const storedAuth = getStoredAuth();

    if (storedAuth) {
      try {
        await fetch(`${apiBaseUrl}${apiRoutes.authLogout}`, {
          headers: {
            Authorization: `Bearer ${storedAuth.sessionKey}`
          },
          method: "POST"
        });
      } catch {
        // Local logout should still happen when the session is already gone.
      }
    }

    clearStoredAuth();
    setIsUserMenuOpen(false);

    if (window.location.pathname === "/profile") {
      window.history.pushState(null, "", "/login");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }

  return (
    <header className="app-header">
      <SpaLink ariaLabel="Rebirth home" className="brand" to="/">
        <img src="/logo.png" alt="" />
      </SpaLink>
      <TooltipProvider>
        <nav className="header-nav" aria-label="Primary navigation">
          <HeaderNavLink label="Home" to="/">
            <House aria-hidden="true" />
          </HeaderNavLink>
          <HeaderNavLink label="Data Explorer" to="/data-explorer">
            <Database aria-hidden="true" />
          </HeaderNavLink>
          <HeaderNavLink label="Templates" to="/templates">
            <Shapes aria-hidden="true" />
          </HeaderNavLink>
          <HeaderNavLink label="Security" to="/security">
            <Shield aria-hidden="true" />
          </HeaderNavLink>
        </nav>
      </TooltipProvider>
      <div className="header-actions" ref={userMenuRef}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
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
                <User aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>User profile</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {isUserMenuOpen ? (
          <div className="user-menu" role="menu">
            {isLoggedIn ? (
              <>
                <SpaLink role="menuitem" to="/profile" onNavigate={() => setIsUserMenuOpen(false)}>
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
              <SpaLink role="menuitem" to="/login" onNavigate={() => setIsUserMenuOpen(false)}>
                <LogIn aria-hidden="true" />
                Login
              </SpaLink>
            )}
            <Button
              aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
              className="theme-toggle"
              role="menuitem"
              title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
              type="button"
              variant="ghost"
              onClick={toggleTheme}
            >
              {theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
              Toggle Theme
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

interface HeaderNavLinkProps {
  children: ReactNode;
  label: string;
  to: AppPath;
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
  );
}
