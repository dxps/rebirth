import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/work-sans/latin-400.css";
import "@fontsource/work-sans/latin-800.css";
import "@fontsource/work-sans/latin-900.css";
import { Header } from "./components/Header";
import { getCurrentPath, type AppPath } from "./routing";
import { DataExplorerView } from "./views/DataExplorerView";
import { HomeView } from "./views/HomeView";
import { TypesMgmtView } from "./views/TypesMgmtView";
import { UserProfileView } from "./views/UserProfileView";
import "./styles.css";

type ThemeMode = "light" | "dark";

function App() {
  const [theme, setTheme] = useState<ThemeMode>(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  const [currentPath, setCurrentPath] = useState<AppPath>(getCurrentPath);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    function syncCurrentPath(): void {
      setCurrentPath(getCurrentPath());
    }

    window.addEventListener("popstate", syncCurrentPath);

    return () => {
      window.removeEventListener("popstate", syncCurrentPath);
    };
  }, []);

  function renderView() {
    switch (currentPath) {
      case "/data-explorer":
        return <DataExplorerView />;
      case "/types":
        return <TypesMgmtView />;
      case "/profile":
        return <UserProfileView />;
      case "/":
        return <HomeView />;
    }
  }

  return (
    <>
      <Header
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
      />
      <main className="app-shell">{renderView()}</main>
    </>
  );
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
