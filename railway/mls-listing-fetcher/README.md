# MLS Listing Fetcher

Heartland MLS listing data scraper for the TC App. Fetches address, zip, county, and legal description directly from Matrix using session cookies.

## Endpoints

### `GET /health`
Returns `{ status: 'ok', service: 'mls-listing-fetcher' }`.

### `GET /listing/:mlsNumber`
Returns full listing data for the given MLS#.

**Rules:**
- No MLS# → 400 error (property not on MLS)
- Session expired → 401 error (re-auth required)
- Not found → `{ found: false }`
- Found → `{ found: true, data: { address, city, state, zipCode, county, legalDescription, subdivision, listPrice, status, ... } }`

## Environment Variables

| Variable | Description |
|---|---|
| `MLS_MATRIX_COOKIES` | JSON array of Playwright-format cookies for hmls.mlsmatrix.com and heartland.clareityiam.net |
| `PORT` | Server port (Railway sets this automatically) |

## Cookie Format

```json
[
  { "name": "LoginSig", "value": "...", "domain": "hmls.mlsmatrix.com", "path": "/" },
  { "name": "AWSALB", "value": "...", "domain": "hmls.mlsmatrix.com", "path": "/" },
  { "name": "AWSALBCORS", "value": "...", "domain": "hmls.mlsmatrix.com", "path": "/" },
  { "name": "clareity", "value": "...", "domain": "heartland.clareityiam.net", "path": "/", "secure": true }
]
```

## Cookie Refresh

Session cookies last ~7–30 days. When the `/listing/:mlsNumber` endpoint returns `{ error: 'session_expired' }`, log in to Heartland MLS manually (going through MFA), extract new cookies, and update the `MLS_MATRIX_COOKIES` env var on Railway.
