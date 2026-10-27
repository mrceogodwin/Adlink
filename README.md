# Adlink

**Find your audience. Make your message matter.**

Adlink is an advertising marketplace concept connecting businesses with creators, social pages, WhatsApp and Telegram communities, and websites across Africa.

## Current build

The first frontend milestone is a responsive Vite + React marketplace preview featuring:

- Responsive landing page and Adlink visual identity
- Publisher placement cards and sample inventory
- Search by publisher, platform, category, and tags
- Platform and category filters
- Maximum budget slider
- Sorting by recommendation, price, audience, and engagement
- Save/unsave placement interactions
- Empty states, load-more, and feedback notices
- Publisher onboarding call-to-action
- Vercel build configuration

**Important:** the displayed publisher names, audience figures, reach, engagement, and prices are sample data used to develop the interface. They are not verified offers. Account creation, real publisher listings, booking, payment, campaign reporting, and admin workflows are not connected yet.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Create a production build:

```bash
npm run build
npm run preview
```

## Deployment

Import this repository into Vercel. The included `vercel.json` sets the Vite build command and `dist` output directory. A live deployment still needs to be created and verified.

## Roadmap

1. Marketplace foundation and responsive UI
2. Database schema, authentication, advertiser and publisher profiles
3. Real listing submission, moderation and publisher verification
4. Campaign briefs, shortlist, booking requests and delivery evidence
5. Payments, platform fees, refunds and payout workflow
6. Campaign analytics, recommendations and admin operations

Build in verified increments. Do not present sample inventory as real or mark integrations complete until configured and tested.


CI build verification is configured in `.github/workflows/build.yml`.


## Production backend foundation

- PostgreSQL schema: `database/migrations/001_initial_schema.sql`
- Public listings API: `api/listings.js` (only published placements from verified publishers)
- Runtime dependency: `@neondatabase/serverless`
- Environment template: `.env.example`

### Required before live data is available

1. Create or select a dedicated Adlink Neon project and apply the schema migration.
2. Set the pooled Neon connection string as `DATABASE_URL` in Vercel Production and Preview environments.
3. Connect an authentication provider and implement server-verified session checks before enabling mutations.
4. Add payment provider credentials only after webhook signature verification and idempotency handling are implemented.

The API deliberately returns HTTP 503 when `DATABASE_URL` is missing; it never silently substitutes demo data. The current homepage still has a clearly labelled sample-data catalog until the frontend is switched to database-backed listings and auth is connected.
