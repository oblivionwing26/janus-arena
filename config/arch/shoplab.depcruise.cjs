// ShopLab's architecture rules (F2.5), checked by Janus with dependency-cruiser. They describe
// layers a healthy Next.js shop keeps apart; a violation is a finding, not a build failure.

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'components-not-database',
      severity: 'error',
      comment:
        'UI components get data from pages or the API, never straight from the database client.',
      from: { path: '^src/components/' },
      to: { path: '^src/lib/db' },
    },
    {
      name: 'pages-not-api-handlers',
      severity: 'error',
      comment: 'Pages call shared code in src/lib, not the API route handlers.',
      from: { path: '^src/app/', pathNot: '^src/app/api/' },
      to: { path: '^src/app/api/' },
    },
    {
      name: 'lib-not-ui',
      severity: 'error',
      comment: 'Business code in src/lib does not depend on pages or components.',
      from: { path: '^src/lib/' },
      to: { path: '^src/(app|components)/' },
    },
    {
      name: 'no-circular',
      severity: 'warn',
      comment: 'Circular imports make the order of initialisation fragile.',
      from: {},
      to: { circular: true },
    },
  ],
};
