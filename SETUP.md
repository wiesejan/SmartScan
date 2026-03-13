# SmartScan Setup-Anleitung

Diese Anleitung beschreibt die vollständige Einrichtung von SmartScan für die Produktion.

---

## Schritt 1: Dropbox App erstellen

### 1.1 App Console öffnen
1. Gehe zu **[Dropbox App Console](https://www.dropbox.com/developers/apps)**
2. Melde dich mit deinem Dropbox-Account an
3. Klicke auf **"Create app"**

### 1.2 App konfigurieren
Wähle folgende Optionen:

| Einstellung | Wert |
|-------------|------|
| **API** | Scoped access |
| **Access type** | Full Dropbox |
| **App name** | SmartScan (oder ein anderer Name) |

Klicke auf **"Create app"**

### 1.3 Berechtigungen setzen
Gehe zum Tab **"Permissions"** und aktiviere:

- [x] `files.metadata.write`
- [x] `files.metadata.read`
- [x] `files.content.write`
- [x] `files.content.read`
- [x] `account_info.read`

Klicke auf **"Submit"**

### 1.4 OAuth 2 Einstellungen
Gehe zum Tab **"Settings"** und konfiguriere:

#### Redirect URIs hinzufügen
Füge deine App-URLs hinzu:

```
https://wiesejan.github.io/SmartScan/
```

> **Wichtig**: URL muss mit `/` enden!

Falls du lokal testen möchtest, füge auch hinzu:
```
http://localhost:3000/
http://localhost:8080/
http://127.0.0.1:5500/
```

#### App key kopieren
Kopiere den **App key** (nicht das App secret!) - du brauchst ihn im nächsten Schritt.

---

## Schritt 2: Client ID im Code eintragen

### 2.1 config.js bearbeiten
Öffne `src/config.js` und ersetze den Platzhalter:

```javascript
// Dropbox OAuth configuration
dropbox: {
  clientId: 'DEIN_APP_KEY_HIER',  // ← Hier einfügen
  ...
}
```

### 2.2 Beispiel
```javascript
dropbox: {
  clientId: 'abc123xyz456',  // Dein echter App key
  redirectUri: '',
  authEndpoint: 'https://www.dropbox.com/oauth2/authorize',
  ...
}
```

---

---

## Schritt 3: Nextcloud einrichten (optional)

SmartScan kann Dokumente alternativ oder zusätzlich zu Dropbox in eine selbst gehostete Nextcloud-Instanz hochladen.

### 3.1 App-Passwort in Nextcloud erstellen

1. In Nextcloud einloggen → **Einstellungen** → **Sicherheit**
2. Unter **App-Passwörter** einen Namen eingeben (z. B. `SmartScan`) → **Erstellen**
3. Das angezeigte Passwort kopieren — es wird nur einmal angezeigt

> Das App-Passwort hat keinen Zugriff auf dein Hauptkonto-Passwort und kann jederzeit einzeln widerrufen werden.

### 3.2 CORS in Caddy konfigurieren

Wenn SmartScan auf einer anderen Domain läuft als Nextcloud (z. B. GitHub Pages vs. eigene Subdomain), muss der Reverse Proxy CORS-Header für die SmartScan-Domain setzen. Nextclouds eigene `cors.allowed-domains`-Einstellung ist für Browser-Preflight-Requests nicht zuverlässig.

Öffne die Caddyfile auf dem Server:
```bash
nano /opt/server/infrastructure/Caddyfile
```

Ersetze den `nextcloud.yourdomain.com`-Block durch:
```caddy
nextcloud.yourdomain.com {
    redir /.well-known/carddav /remote.php/dav 301
    redir /.well-known/caldav /remote.php/dav 301

    @cors_preflight method OPTIONS
    handle @cors_preflight {
        header Access-Control-Allow-Origin "https://deine-smartscan-domain.com"
        header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PROPFIND, MKCOL, OPTIONS"
        header Access-Control-Allow-Headers "Authorization, Content-Type, OCS-APIRequest, Depth, Accept"
        header Access-Control-Max-Age "1728000"
        respond "" 204
    }

    header Access-Control-Allow-Origin "https://deine-smartscan-domain.com"
    header Access-Control-Allow-Credentials "true"

    reverse_proxy nextcloud:80 {
        header_down Strict-Transport-Security "max-age=15552000; includeSubDomains; preload"
    }
}
```

Caddy neu laden:
```bash
docker exec $(docker ps -qf "name=caddy") caddy reload --config /etc/caddy/Caddyfile
```

### 3.3 Nextcloud in SmartScan verbinden

1. SmartScan öffnen → **Einstellungen**
2. Unter **Nextcloud** eintragen:
   - **Server-URL**: `https://nextcloud.yourdomain.com`
   - **Benutzername**: dein Nextcloud-Benutzername
   - **App-Passwort**: das in Schritt 3.1 erstellte Passwort
3. **Verbindung testen** → bei Erfolg **Speichern**

---

## Schritt 5: Änderungen committen und pushen

```bash
# Änderungen stagen
git add src/config.js

# Commit erstellen
git commit -m "Add Dropbox Client ID for production"

# Zu GitHub pushen
git push origin main
```

---

## Schritt 6: GitHub Pages aktivieren (falls noch nicht geschehen)

1. Gehe zu deinem Repository auf GitHub
2. **Settings** → **Pages**
3. Source: **Deploy from a branch**
4. Branch: **main** / **(root)**
5. Klicke **Save**

Die App ist dann unter verfügbar:
```
https://wiesejan.github.io/SmartScan/
```

---

## Schritt 7: Testen

### 5.1 Erster Test
1. Öffne die App im Browser
2. Klicke auf **"Mit Dropbox verbinden"**
3. Du wirst zu Dropbox weitergeleitet
4. Logge dich ein und erlaube den Zugriff
5. Du wirst zurück zur App geleitet
6. Status sollte zeigen: **"Bereit zum Scannen"**

### 5.2 Funktionstest
1. Klicke auf **"Einzelseite scannen"**
2. Nimm ein Dokument auf
3. Die KI analysiert das Dokument
4. Überprüfe/korrigiere die Kategorie
5. Klicke **"Speichern"**
6. Prüfe in Dropbox: `/SmartScan/[Kategorie]/`

---

## Schritt 8: Produktion (>50 Nutzer)

### Wann ist Production Status nötig?
- **Development Mode**: Bis zu 500 Nutzer
- **Nach 50 Nutzern**: 2 Wochen Zeit für Production-Antrag

### Production-Antrag stellen
1. Gehe zur [App Console](https://www.dropbox.com/developers/apps)
2. Wähle deine App
3. Klicke **"Apply for production"**
4. Fülle das Formular aus:
   - App-Beschreibung
   - Screenshots der OAuth-Consent-Seite
   - Erklärung der Datennutzung

---

## Sicherheits-Checkliste

### ✅ Bereits implementiert

| Maßnahme | Status |
|----------|--------|
| OAuth 2.0 mit PKCE | ✅ |
| Kein Client Secret im Code | ✅ |
| SHA-256 Code Challenge | ✅ |
| Kryptographisch sichere Zufallswerte | ✅ |
| Redirect URI Validierung | ✅ |
| Content Security Policy | ✅ |
| Auth Code wird aus URL entfernt | ✅ |
| Access Token nur in sessionStorage | ✅ |

### ⚠️ Deine Verantwortung

| Aufgabe | Beschreibung |
|---------|--------------|
| Redirect URI whitelisten | Nur deine Domain in der App Console eintragen |
| App name sinnvoll wählen | Wird Nutzern im Consent-Dialog angezeigt |
| Repository privat halten | Optional - Client ID ist öffentlich sicher, aber weniger Exposure ist besser |

---

## Fehlerbehebung

### "Dropbox ist nicht konfiguriert"
→ Client ID in `src/config.js` ist noch der Platzhalter

### "OAuth error: invalid_request"
→ Redirect URI stimmt nicht mit der in der App Console überein

### "CORS error"
→ Normale Dropbox-API-Calls sollten funktionieren. Prüfe die CSP-Einstellungen.

### Login-Loop (immer wieder Dropbox-Login)
→ Cookies/Storage blockiert? PWA im Private Mode? Drittanbieter-Cookies müssen erlaubt sein.

---

## Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────┐
│                        SmartScan PWA                        │
├─────────────────────────────────────────────────────────────┤
│  Browser (Client)                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Camera    │  │  Tesseract  │  │     Classifier      │ │
│  │   Module    │  │  OCR (lokal)│  │   (Regel-basiert)   │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│         │                │                    │             │
│         ▼                ▼                    ▼             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    App State (UI)                       ││
│  └─────────────────────────────────────────────────────────┘│
│                            │                                 │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Dropbox API (OAuth PKCE)                   ││
│  │  - Access Token: sessionStorage                         ││
│  │  - Refresh Token: localStorage                          ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Dropbox API                            │
│  - api.dropboxapi.com (Metadaten, Ordner)                  │
│  - content.dropboxapi.com (Datei-Upload)                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Dropbox Cloud Storage                    │
│  /SmartScan/                                                │
│  ├── Finanzen/                                              │
│  │   ├── Gehaltsabrechnung/                                │
│  │   └── Steuerdokumente/                                  │
│  ├── Versicherungen/                                        │
│  └── ...                                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Nächste Schritte (optional)

1. **Custom Domain**: Eigene Domain statt github.io
2. **Analytics**: Anonyme Nutzungsstatistiken
3. **Backup-Export**: Lokale PDF-Kopien vor Upload
4. **Batch-Scan**: Mehrere Dokumente nacheinander

---

## Support

Bei Fragen oder Problemen:
- GitHub Issues: [SmartScan Issues](https://github.com/wiesejan/SmartScan/issues)
