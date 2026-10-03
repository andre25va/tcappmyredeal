# MyReDeal.com

Transaction Coordinator Dashboard — Real Estate Deal Management Platform

Built with React + TypeScript + Vite + Tailwind CSS

## Setup

```bash
npm install
npm run dev
```

## Deploy

Connect this repo to [Vercel](https://vercel.com) for automatic deployments.

## SMS inbox

Staff send and receive transaction-update texts from the **Texts** page. Messages go out through the Twilio Messaging Service (not a raw From number). Marketing texts are out of scope. Nothing in this repo configures the live Twilio webhook or sends a message on its own.

### Environment variables

Set these on Vercel (and in `.env.local` for local API testing). Do not commit them.

| Variable | Required | Purpose |
| --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account |
| `TWILIO_AUTH_TOKEN` | Yes | Sending texts and validating `X-Twilio-Signature` |
| `TWILIO_MESSAGING_SERVICE_SID` | Yes | Messaging Service used for every inbox send |
| `SUPABASE_URL` | Yes | Already used by the app |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Already used by the API |
| `FUB_API_KEY` | For contact cards | Follow Up Boss API key (basic auth username, empty password) |
| `FUB_LOG_NOTES` | No | `true` logs inbound texts as notes on the matched Follow Up Boss person. Default off |
| `PUBLIC_APP_URL` | Recommended | Canonical `https://…` origin used for outbound status callbacks. Falls back to `VERCEL_URL` |

### Database

Apply `supabase/migrations/20261003_sms_inbox.sql` to the Supabase project before using the page. The API uses the service role; the tables are not readable with the anon key.

### Twilio Messaging Service webhooks

In the Twilio console, open Messaging Service **MyReDeal TC Notifications** and set:

- **Incoming messages:** `https://<your-production-domain>/api/sms-inbox/inbound` (HTTP POST)
- **Status callback:** `https://<your-production-domain>/api/sms-inbox/status` (HTTP POST)

Use the same domain staff use to open the app. The signature check rebuilds that exact URL from the request host, so a preview URL and the production domain are not interchangeable.

Opt-out keywords (`STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`) are stored and block later sends. `START`, `YES`, and `UNSTOP` mark the number opted in. A number with no keyword on file can still be texted, and the compose box warns first.

### Local check

```bash
npm test
npm run dev
```

The inbox UI calls `/api/sms-inbox`, which runs as a Vercel function. `npm run dev` serves the React app only; exercise the webhooks against a Vercel preview or `vercel dev`.
