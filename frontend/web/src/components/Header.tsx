import { useEffect, useRef, useState, type ReactNode } from "react";
import { Database, House, Moon, Shapes, Sun, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SpaLink, type AppPath } from "../routing";

interface HeaderProps {
  onToggleTheme: () => void;
  theme: "light" | "dark";
}

export function Header({ onToggleTheme, theme }: HeaderProps) {
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

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

  function toggleTheme(): void {
    onToggleTheme();
    setIsUserMenuOpen(false);
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
          <HeaderNavLink label="Types Mgmt" to="/types">
            <Shapes aria-hidden="true" />
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
            <SpaLink role="menuitem" to="/profile" onNavigate={() => setIsUserMenuOpen(false)}>
              <User aria-hidden="true" />
              Profile
            </SpaLink>
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
