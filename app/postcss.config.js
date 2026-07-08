export default {
  plugins: {
    // Tailwind v4 ships its own PostCSS plugin and bundles autoprefixer via
    // Lightning CSS, so the old `tailwindcss` + `autoprefixer` pair is replaced
    // by this single entry. This matches the production Vercel build.
    '@tailwindcss/postcss': {},
  },
};
