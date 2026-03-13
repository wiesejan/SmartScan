# SmartScan — Development Log

---

## Session: 2026-03-04

### Context

Review and improvement session covering six areas:
categories, Dropbox UX, Nextcloud integration, AI recognition, hosting decision, and multi-user readiness.

---

## 1. Document Categories — Generalised

### Problem
The 28 categories were hardcoded to personal data: specific banks (`fin-dkb`, `fin-haspa`), a named insurance policy (`vers-risiko-jan`), children's names (`kind-salome`, `kind-david`), marital status (`ehe`). The keyword lists contained brand names like "Hamburger Sparkasse", "Salomé", "Vattenfall". The app was unusable by anyone other than the original owner.

### Change
Replaced with 17 generic categories usable by any German-speaking user.

| ID | Label | Folder |
|----|-------|--------|
| `payslip` | Gehaltsabrechnung | Finanzen/Gehaltsabrechnung |
| `bank` | Bankdokument | Finanzen/Bank |
| `investment` | Depot / Wertpapiere | Finanzen/Investment |
| `tax` | Steuerdokument | Finanzen/Steuer |
| `savings` | Spar- & Bausparvertrag | Finanzen/Sparvertraege |
| `invoice` | Rechnung | Rechnungen |
| `receipt` | Kassenbeleg / Quittung | Belege |
| `contract-utility` | Strom / Gas / Wasser | Vertraege/Versorgung |
| `contract-telecom` | Mobilfunk / Internet | Vertraege/Telekommunikation |
| `contract-general` | Sonstiger Vertrag | Vertraege/Sonstige |
| `insurance-health` | Krankenversicherung | Versicherungen/Kranken |
| `insurance-vehicle` | KFZ-Versicherung | Versicherungen/KFZ |
| `insurance-liability` | Haftpflicht | Versicherungen/Haftpflicht |
| `insurance-other` | Sonstige Versicherung | Versicherungen/Sonstige |
| `medical` | Medizinisches Dokument | Medizin |
| `official` | Behördendokument | Behoerden |
| `other` | Sonstiges | Sonstiges |

### Files changed
- `src/config.js` — categories array
- `src/classifier.js` — scores object, strongKeywords, mediumKeywords, ML candidateLabels/categoryMap
- `index.html` — `<select>` dropdown

---

## 2. Dropbox Connection — UX Fix

### Problem
The app required each user to create a Dropbox developer account, register an app, and paste an App Key into `config.js`. This was a developer task, not a user task.

### Current implementation (clarification)
The Dropbox connection already uses **OAuth 2.0 PKCE** — no static token, no client secret. When the Client ID is set, users see Dropbox's standard login screen and just click Authorise. The only barrier was the missing Client ID.

### Change
- Added `dropboxAPI.setClientId(id)` — stores the key in `localStorage`, no code editing needed
- Settings panel shows an App Key input field **only when no key is configured** — hidden once set
- The app owner sets the key once (either in `config.js` or via Settings UI); end users never see it

### Files changed
- `src/dropbox-api.js` — `getClientId()` checks localStorage first, new `setClientId()` method
- `index.html` — App Key input section in settings panel
- `src/app.js` — `saveDropboxClientId()`, updated error messages

---

## 3. Nextcloud Integration

### Decision: WebDAV

Nextcloud's WebDAV endpoint (`/remote.php/dav/files/{username}/`) is the correct and only supported way to perform file operations (upload, folder creation) from an external client. The OCS REST API handles metadata, shares, and user management — not file I/O.

### Authentication: App Passwords
Users generate an app password in Nextcloud → Settings → Security → App passwords. The main account password is never stored in the app. App passwords can be revoked individually without affecting the main account.

### New file: `src/nextcloud-api.js`
```
init()              — load credentials from localStorage
isConfigured()      — check all credentials present
saveCredentials()   — persist server URL, username, app password
clearCredentials()  — disconnect
getAuthHeader()     — Basic auth, Unicode-safe (TextEncoder, not btoa())
getWebDAVBase()     — constructs /remote.php/dav/files/{user}/
testConnection()    — OCS capabilities GET (not PROPFIND — see below)
createFolder()      — MKCOL with silent "already exists" handling
uploadFile()        — PUT with auto folder creation
getUserInfo()       — display name + server URL
```

### Connection test: OCS not PROPFIND
The initial implementation used `PROPFIND /remote.php/dav/` for the connection test. This was changed because:
- `PROPFIND` is a non-standard HTTP method requiring explicit CORS allowance
- A browser on a different origin is blocked by CORS preflight before the request even reaches the server
- The OCS capabilities endpoint (`GET /ocs/v2.php/cloud/capabilities?format=json`) uses a standard GET, is CORS-friendly, requires `OCS-APIRequest: true` header, and returns the Nextcloud version as a bonus

File uploads and folder creation still use WebDAV (no alternative exists in Nextcloud).

### btoa() fix
`btoa()` throws a `InvalidCharacterError` on non-ASCII input. Replaced with TextEncoder → binary string → btoa(), which correctly handles umlauts and special characters in usernames/passwords.

### CORS — root cause of connection failures
When SmartScan runs on a different origin than Nextcloud, the browser enforces CORS. Nextcloud's WebDAV server does not send CORS headers by default. This blocks both `PROPFIND` and `MKCOL` in the browser (desktop clients like Nextcloud Desktop or Cyberduck are not browsers and ignore CORS entirely).

**Fix required on the Nextcloud Nginx config** — see Section 6 (Server Relocation).

### Storage target selector
When both Dropbox and Nextcloud are connected, a selector appears in Settings:
- **Nur Dropbox** — saves to Dropbox only
- **Nur Nextcloud** — saves to Nextcloud only
- **Dropbox & Nextcloud** — saves to both; partial failures show a warning without blocking

The target is stored in `localStorage` key `smartscan_storage_target`.

### Files changed/created
- `src/nextcloud-api.js` — new file
- `src/config.js` — Nextcloud config block, storage keys
- `src/app.js` — import, initializeAPIs, startScan, handleSave, connect/disconnect/save/test functions
- `src/ui.js` — state, elements cache, updateNextcloudStatus, updateStorageTargetUI, refreshHomeStatus
- `index.html` — Nextcloud settings section, storage target selector, success screen storage label, CSP update

### CSP update
`connect-src` changed from a fixed whitelist to `https:` (any HTTPS URL) to allow user-configured Nextcloud servers whose domain cannot be known at build time.

---

## 4. AI Recognition — Deferred

### Decision
AI-based document classification was discussed but **not implemented** in this session.

### Data protection requirement (mandatory)
Documents scanned by this app contain sensitive personal data: bank statements, payslips, insurance policies, medical records, tax documents. Sending these to US-based cloud AI APIs (Google Gemini, Groq, Anthropic Claude) poses GDPR/DSGVO compliance issues:
- Data transfer to third country (USA) — requires SCCs or adequacy decision
- Requires Data Processing Agreement with each provider
- BfDI has flagged US cloud services as problematic
- Not acceptable as a default for German/EU users

### Recommended future path: self-hosted Ollama
The Hetzner server already exists. Running Ollama with a vision-capable model keeps all document data within EU infrastructure:

| Model | RAM required | Vision | Quality |
|-------|-------------|--------|---------|
| `moondream2` | ~2 GB | ✅ | Good — fast, CPU-friendly |
| `llava-phi3` | ~4 GB | ✅ | Good |
| `qwen2-vl:7b` | ~6 GB | ✅ | Excellent |
| `llama3.2-vision:11b` | ~8–10 GB | ✅ | Excellent — needs CX41+ |

Implementation pattern:
```
[Browser] → HTTPS → [Hetzner: /api/analyze] → [Ollama] → JSON classification
                                                ↑
                                    Data never leaves EU server
```

### Proposed classification hierarchy (for future implementation)
1. Self-hosted Ollama on Hetzner (primary, GDPR-safe)
2. Local Tesseract OCR + keyword classifier (offline fallback)
3. Third-party cloud AI — **opt-in only, explicit user consent, disabled by default**

---

## 5. Hosting Decision

### Recommendation: move to Hetzner server

| Factor | GitHub Pages | Hetzner |
|--------|-------------|---------|
| Cost | Free | Already paid (Nextcloud runs there) |
| Backend possible | No | Yes |
| API key protection | No — all keys in client | Yes — keys stay on server |
| Multi-user accounts | Not possible | Full control |
| Nextcloud CORS config | External server needed | Same infrastructure |
| Vendor dependency | GitHub/Microsoft | None |
| CI/CD | GitHub Actions built-in | Manual or self-hosted runner |

The decisive factor is the upcoming multi-user requirement: without a backend there is no way to protect API keys, manage user accounts, or centrally configure storage credentials.

---

## 6. Server Relocation — Step-by-Step Guide

### Prerequisites
- SSH access to Hetzner server
- Domain/subdomain pointing to server IP (DNS A record)
- Nginx running (confirm: `nginx -v`)
- Certbot installed (`certbot --version`)

### Step 1 — Clone the repo on the server
```bash
sudo mkdir -p /var/www/smartscan
sudo git clone https://github.com/wiesejan/SmartScan.git /var/www/smartscan
sudo chown -R www-data:www-data /var/www/smartscan
```

Future updates:
```bash
cd /var/www/smartscan && sudo git pull origin main
```

### Step 2 — Nginx virtual host
Create `/etc/nginx/sites-available/smartscan` (replace `scan.yourdomain.de`):

```nginx
server {
    listen 80;
    server_name scan.yourdomain.de;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name scan.yourdomain.de;

    root /var/www/smartscan;
    index index.html;

    ssl_certificate     /etc/letsencrypt/live/scan.yourdomain.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/scan.yourdomain.de/privkey.pem;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|ico|svg|woff2)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location ~* (index\.html|sw\.js|manifest\.json)$ {
        expires off;
        add_header Cache-Control "no-store";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/smartscan /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Step 3 — HTTPS certificate
```bash
sudo certbot --nginx -d scan.yourdomain.de
```

### Step 4 — CORS headers on the Nextcloud Nginx config
Add inside the Nextcloud `server { }` block (replace `scan.yourdomain.de` with your actual SmartScan domain):

```nginx
location ~ ^/(remote\.php|ocs)/ {
    # ... your existing PHP/fastcgi config for Nextcloud stays here ...

    add_header 'Access-Control-Allow-Origin'   'https://scan.yourdomain.de' always;
    add_header 'Access-Control-Allow-Methods'  'GET, POST, PUT, DELETE, MKCOL, PROPFIND, MOVE, COPY, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers'  'Authorization, Content-Type, Depth, Destination, Overwrite, OCS-APIRequest' always;
    add_header 'Access-Control-Expose-Headers' 'DAV, Content-Length, ETag' always;

    if ($request_method = OPTIONS) {
        add_header 'Access-Control-Allow-Origin'  'https://scan.yourdomain.de';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, MKCOL, PROPFIND, MOVE, COPY, OPTIONS';
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, Depth, Destination, Overwrite, OCS-APIRequest';
        add_header 'Access-Control-Max-Age' 3600;
        add_header 'Content-Length' 0;
        return 204;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

> **Note:** If SmartScan and Nextcloud ever share the same domain (e.g. `yourdomain.de` root vs `yourdomain.de/smartscan`), CORS is not needed — same origin means no restrictions.

### Step 5 — Update Dropbox redirect URI
In [Dropbox App Console](https://www.dropbox.com/developers/apps):
- Add `https://scan.yourdomain.de/` to Redirect URIs
- Keep the GitHub Pages URI during transition, remove it afterwards

### Step 6 — Disable GitHub Pages (when ready)
GitHub repo → Settings → Pages → Source → **None**

---

## 7. Multi-User Readiness — Requirements

For the app to be usable by people other than the owner, the following is needed:

| Priority | Item | Status |
|----------|------|--------|
| Required | Generic categories (no personal data) | ✅ Done |
| Required | Single registered Dropbox app (one Client ID for all) | ✅ Possible now |
| Required | Nextcloud WebDAV integration | ✅ Done |
| Required | CORS configured on Nextcloud server | Pending server setup |
| Recommended | Backend proxy to protect API keys | Future |
| Recommended | User accounts / per-user settings | Future |
| Recommended | Privacy notice / Datenschutzerklärung | Required if public |
| Nice to have | User-defined custom categories | Future |
| Nice to have | Multi-language support (app is German-only) | Future |

---

## Commits in this session

| Hash | Message |
|------|---------|
| `1bd61f8` | feat: Generic categories, Nextcloud integration, Dropbox UX improvements |
| `70f5b54` | fix: Nextcloud connection check and auth encoding |

---

## Session: 2026-03-13

### Context

Debugging Nextcloud connection failure and fixing CORS for the production setup on Hetzner (Caddy reverse proxy).

---

## 1. Nextcloud CORS — Root Cause and Fix

### Symptom
Connecting to Nextcloud via SmartScan Settings showed:
> `Nextcloud-Fehler: Load failed`

The error was a browser-level `TypeError` thrown by `fetch()` before any HTTP response was received — meaning the request was blocked client-side, not rejected by the server.

### Root cause: CORS preflight blocked
The app runs on `https://wiesejan.github.io` (origin A). The Nextcloud server is at `https://nextcloud.wiese-tech.com` (origin B). Any `fetch()` from A to B with an `Authorization` header triggers a **CORS preflight** (OPTIONS request). The server must respond with `Access-Control-Allow-Origin` and related headers, otherwise the browser aborts the request entirely — producing "Load failed" / "Failed to fetch" with no HTTP status code.

### Why `occ cors.allowed-domains` does not work
Nextcloud's built-in `cors.allowed-domains` config key (set via `occ config:system:set`) does not correctly handle CORS preflight requests in practice. It must not be relied upon for browser-based cross-origin access.

### Fix: CORS headers in Caddy
The Hetzner server uses **Caddy** as the reverse proxy (not Nginx). CORS headers were added to the `nextcloud.wiese-tech.com` block in `/opt/server/infrastructure/Caddyfile`:

```caddy
nextcloud.wiese-tech.com {
    redir /.well-known/carddav /remote.php/dav 301
    redir /.well-known/caldav /remote.php/dav 301

    @cors_preflight method OPTIONS
    handle @cors_preflight {
        header Access-Control-Allow-Origin "https://wiesejan.github.io"
        header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PROPFIND, MKCOL, OPTIONS"
        header Access-Control-Allow-Headers "Authorization, Content-Type, OCS-APIRequest, Depth, Accept"
        header Access-Control-Max-Age "1728000"
        respond "" 204
    }

    header Access-Control-Allow-Origin "https://wiesejan.github.io"
    header Access-Control-Allow-Credentials "true"

    reverse_proxy nextcloud:80 {
        header_down Strict-Transport-Security "max-age=15552000; includeSubDomains; preload"
    }
}
```

Reload with:
```bash
docker exec $(docker ps -qf "name=caddy") caddy reload --config /etc/caddy/Caddyfile
```

> **Note:** Section 6 (Server Relocation) references Nginx for CORS. The actual infrastructure uses Caddy. The Caddy config above supersedes those Nginx instructions.

---

## 2. Improved Error Messages for Network Failures

### Problem
When `fetch()` throws a `TypeError` (CORS block, DNS failure, SSL error, offline), the previous code forwarded the raw browser error message — "Load failed" on Safari, "Failed to fetch" on Chrome — which gives the user no actionable information.

### Fix
`testConnection()` in `src/nextcloud-api.js` now:
1. Detects mixed content (HTTPS app + HTTP Nextcloud URL) before making any request
2. Catches `TypeError` from `fetch()` separately from HTTP errors
3. Shows a structured error message with the specific possible causes and the app's own origin

### Files changed
- `src/nextcloud-api.js` — mixed-content pre-check, try/catch around `fetch()`, diagnostic error message

---

## 3. Multi-User Readiness — Updated Status

| Priority | Item | Status |
|----------|------|--------|
| Required | Generic categories (no personal data) | ✅ Done |
| Required | Single registered Dropbox app (one Client ID for all) | ✅ Done |
| Required | Nextcloud WebDAV integration | ✅ Done |
| Required | CORS configured on Nextcloud server | ✅ Done (Caddy) |
| Recommended | Backend proxy to protect API keys | Future |
| Recommended | User accounts / per-user settings | Future |
| Recommended | Privacy notice / Datenschutzerklärung | Required if public |
| Nice to have | User-defined custom categories | Future |
| Nice to have | Multi-language support (app is German-only) | Future |

---

## Commits in this session

| Hash | Message |
|------|---------|
| `3e62aa0` | fix: Improve Nextcloud connection error messages for CORS and mixed content |
