/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        surface: 'var(--surface)',
        elevated: 'var(--elevated)',
        hover: 'var(--hover)',

        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',

        foreground: 'var(--foreground)',
        'foreground-muted': 'var(--foreground-muted)',
        'foreground-subtle': 'var(--foreground-subtle)',

        accent: 'var(--accent)',
        'accent-foreground': 'var(--accent-foreground)',
        'accent-hover': 'var(--accent-hover)',
        'accent-soft': 'var(--accent-soft)',
        'accent-soft-foreground': 'var(--accent-soft-foreground)',

        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',

        'danger-foreground': 'var(--danger-foreground)',
        'success-foreground': 'var(--success-foreground)',
        'success-soft': 'var(--success-soft)',
        'success-soft-foreground': 'var(--success-soft-foreground)',
        'danger-soft': 'var(--danger-soft)',
        'danger-soft-foreground': 'var(--danger-soft-foreground)',
        'warning-soft': 'var(--warning-soft)',
        'warning-soft-foreground': 'var(--warning-soft-foreground)',
      },
    },
  },
  plugins: [],
}
