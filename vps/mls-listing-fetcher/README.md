# MLS Listing Fetcher — Hostinger VPS

Deployed on Hostinger VPS at `https://mls.srv1462857.hstgr.cloud`

## Stack
- Node.js 22 + Express + Playwright (Chromium)
- PM2 process manager (fork mode, auto-restart, survives reboots)
- Traefik reverse proxy (HTTPS via Let's Encrypt)

## Server
- IP: `72.62.75.220`
- Port: `4000` (internal)
- Public URL: `https://mls.srv1462857.hstgr.cloud`

## Endpoints
- `GET /health` — health check
- `GET /listing/:mlsNumber` — fetch listing data from Heartland MLS

## SSH
```bash
ssh root@72.62.75.220
cd /root/mls-listing-fetcher
pm2 status
pm2 logs mls-listing-fetcher
```

## Cookie refresh
When Matrix session expires, update `/root/mls-listing-fetcher/mls_matrix_cookies.json`
and run `pm2 restart mls-listing-fetcher`.
