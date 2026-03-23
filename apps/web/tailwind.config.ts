import type { Config } from 'tailwindcss';

const config: Config = {
  // Make Tailwind's `dark:` variants depend on the presence of `html.dark`,
  // so the user's in-app theme selection (stored in localStorage) is the
  // single source of truth across *all* pages (including auth).
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './contexts/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;

