# Adlink

**Find your audience. Make your message matter.**

Adlink is an advertising marketplace connecting advertisers with creators, social pages, WhatsApp and Telegram communities, and websites across Africa.

## Product direction

Adlink supports two campaign paths:

- **Self-service:** advertisers discover approved placements, create campaign briefs, request bookings and manage delivery.
- **Managed campaigns:** Adlink can support advertisers who need help planning and coordinating placements.

Planned revenue streams are a platform commission, optional subscriptions and premium placement opportunities. These commercial features must be configured and tested before being presented as available for purchase.

## Current application

The existing application is being upgraded incrementally; this is not a greenfield rebuild.

- Frontend: Vite + React.
- API: Vercel serverless functions.
- Database: Neon Postgres using `@neondatabase/serverless`.
- Authentication: server-verified session endpoints and role-based access.
- Payments: Paystack integration in the main application branch.
- Deployment target: Vercel.

The Phase 1 development branch includes a responsive marketplace refresh, advertiser and publisher dashboard foundations, publisher verification and placement review, campaign creation, booking requests, delivery evidence review, earnings and payout request workflows, and a Super Admin workspace.

The public marketplace is intended to show only published placements belonging to verified publishers. Sample preview content must never be represented as verified inventory or real offers.

## Main workflows

### Advertisers
- Create and manage campaign briefs.
- Discover and save published placements.
- Request placements for a campaign.
- Pay for accepted bookings through the configured payment flow.
- Review publisher delivery evidence.

### Publishers
- Submit business and public profile details for verification.
- Submit placements for moderation.
- Accept or decline booking requests.
- Submit HTTPS delivery evidence.
- View earnings and request eligible payouts.

Publisher earnings are created as pending after successful payment processing. In the Phase 1 branch, earnings are released to available only after the advertiser approves delivery evidence. A payout request is separate from a bank transfer; an administrator must review and reconcile the payout.

### Super Admin
- Review publisher verification.
- Approve or reject placements.
- Manage eligible user account status.
- Review bookings, payment records, earnings and payout requests.
- Record administrative actions in audit logs.

## Important limitations

The following must not be treated as complete merely because a dashboard navigation item or design preview exists:

- Messaging and in-app conversations.
- Full campaign analytics and attribution.
- Advertiser billing history and subscription management.
- Premium placement checkout and subscription billing.
- A complete managed-campaign operator workflow.
- A full dispute case-management workflow.
- End-to-end live payment, webhook, delivery approval and bank payout verification.

Some dashboard areas remain under development and should not be presented as working features until their APIs and user flows are implemented and tested.

## Development

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Create a production build:

```bash
npm run build
```

Run automated tests:

```bash
npm test
```

## Environment

Configure environment variables in the appropriate Vercel environment. Do not commit secrets or paste credentials into issues or chat.

The backend uses `DATABASE_URL` for Neon Postgres. Payment and email integrations require their own provider credentials and verified webhook configuration. Use sandbox credentials in Preview for payment testing; do not change Production payment settings as part of Phase 1.

## Database

SQL migrations are stored in `database/migrations/`. Review migration order and current database state before applying any migration. Never run destructive schema changes against Production as part of routine UI or application work.

## Vercel function limit

The application currently targets the Vercel Hobby plan's 12-function limit. The API entry-point test guards the current count. Any new API endpoint must be consolidated into an existing handler or otherwise reviewed against the deployment limit before it is added.

## Phase 1 safety rules

- Work on `feat/adlink-2.0-phase-1` and keep its pull request in draft.
- Do not merge without explicit approval.
- Do not modify Production payment configuration.
- Do not apply destructive database changes.
- Do not claim a payment, webhook, database migration or payout test passed unless it has been independently verified.
- Keep the main branch and the separate Bachs sandbox work isolated.
