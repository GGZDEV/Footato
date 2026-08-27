import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

const getInitialTheme = (): Theme => (
  document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
);

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const dark = theme === 'dark';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem('footato-theme', theme); } catch { /* Storage may be unavailable. */ }
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#071319' : '#10232d');
  }, [dark, theme]);

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={dark ? 'Activer le thème clair' : 'Activer le thème sombre'}
      aria-pressed={dark}
      title={dark ? 'Passer au thème clair' : 'Passer au thème sombre'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      <span aria-hidden="true">
        {dark ? (
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M20.2 15.2A8.7 8.7 0 0 1 8.8 3.8 8.8 8.8 0 1 0 20.2 15.2Z" />
          </svg>
        )}
      </span>
      <b>{dark ? 'Clair' : 'Sombre'}</b>
    </button>
  );
}
