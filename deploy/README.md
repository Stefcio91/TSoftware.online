# Wdrożenie tsoftware.online na własnym VPS

Serwer to jeden proces Node (`server/server.js`) bez zależności npm. Robi cztery rzeczy:

1. serwuje stronę (`index.html`, `assets/`, panel `admin/`),
2. przyjmuje zgłoszenia z formularza (`POST /api/lead`) i zapisy na lead magnet (`POST /api/magnet`),
3. udostępnia API panelu (`/api/admin/*`, logowanie hasłem, sesja w ciasteczku),
4. wystawia publiczną konfigurację (`GET /api/config`), z której strona bierze ceny, dane kontaktowe i przełączniki.

Dane leżą w plikach JSON w `server/data/` (ten katalog **nie** jest w repozytorium).
Przed serwerem stoi Caddy: terminuje HTTPS (certyfikat Let's Encrypt sam się odnawia) i przekazuje ruch na `127.0.0.1:3000`.

```
internet ──HTTPS──▶ Caddy (:443) ──HTTP──▶ node server/server.js (127.0.0.1:3000)
                                                  │
                                                  └─▶ server/data/{leads,magnet,settings}.json
```

Poniżej: instalacja na Ubuntu 22.04/24.04 krok po kroku, potem aktualizacje, backup, GitHub Actions i wariant z Dockerem.

## 0. Założenia

- VPS z Ubuntu, dostęp `ssh` jako użytkownik z `sudo`.
- Domena `tsoftware.online` (i `www`) wskazuje rekordem **A** na adres IP serwera – Caddy wystawi certyfikat tylko wtedy.
- Porty **80** i **443** otwarte na świat (Let's Encrypt wchodzi po 80/443).

## 1. Node 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git rsync
node --version   # v22.x
```

## 2. Użytkownik i katalog aplikacji

Serwer działa jako osobny użytkownik `tsoftware` (bez uprawnień roota), w katalogu `/opt/tsoftware`.

```bash
sudo useradd --system --create-home --home-dir /opt/tsoftware --shell /bin/bash tsoftware
sudo -u tsoftware git clone https://github.com/<TWÓJ-LOGIN>/TSoftware.online.git /opt/tsoftware
```

(Jeśli `/opt/tsoftware` już istnieje po `useradd`, `git clone` do niepustego katalogu nie zadziała – wtedy
`sudo -u tsoftware git clone … /tmp/ts && sudo -u tsoftware cp -a /tmp/ts/. /opt/tsoftware/`.)

## 3. Plik `.env`

```bash
cd /opt/tsoftware
sudo -u tsoftware cp .env.example .env
sudo -u tsoftware nano .env
sudo chmod 600 .env
```

Minimum do zmiany:

- `ADMIN_PASSWORD` – hasło do panelu. Bezpieczniej trzymać hash zamiast hasła:
  `node server/server.js --hash 'twoje-haslo'` wypisze wartość do `ADMIN_PASSWORD_HASH`
  (wtedy `ADMIN_PASSWORD` zostaw puste).
- `TRUST_PROXY=1` – bo przed serwerem stoi Caddy (limity per IP i ciasteczko `Secure` działają poprawnie).
- opcjonalnie `NOTIFY_WEBHOOK_URL` oraz `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` – powiadomienia o nowych zgłoszeniach
  (można też wpisać później w panelu).

Pozostałe zmienne są opisane w `.env.example`.

Próba ręczna (Ctrl+C kończy):

```bash
sudo -u tsoftware bash -c 'set -a; . ./.env; set +a; node server/server.js'
# w drugim terminalu:
curl -s http://127.0.0.1:3000/api/health
```

## 4. Usługa systemd

```bash
sudo cp /opt/tsoftware/deploy/tsoftware.service /etc/systemd/system/tsoftware.service
sudo systemctl daemon-reload
sudo systemctl enable --now tsoftware
sudo systemctl status tsoftware
```

Unit uruchamia `node /opt/tsoftware/server/server.js` jako `tsoftware`, czyta `/opt/tsoftware/.env`,
restartuje proces po awarii (`Restart=always`) i pozwala mu pisać tylko do `server/data/`
(`ProtectSystem=strict` + `ReadWritePaths`). Jeśli zmienisz `DATA_DIR` w `.env`, dopisz ten katalog
do `ReadWritePaths=` w unicie.

## 5. Caddy (HTTPS automatycznie)

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

sudo cp /opt/tsoftware/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

`deploy/Caddyfile`: `tsoftware.online` → `reverse_proxy 127.0.0.1:3000` z kompresją (`encode zstd gzip`),
`www.tsoftware.online` → przekierowanie 301 na domenę bez `www`. Certyfikat Let's Encrypt Caddy pobiera sam
przy pierwszym żądaniu (patrz `journalctl -u caddy -f`, gdyby coś nie szło – najczęściej DNS jeszcze nie wskazuje na serwer).

Firewall (opcjonalnie, ale warto):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Sprawdzenie: `https://tsoftware.online/` pokazuje stronę, `https://tsoftware.online/api/health` zwraca `{"ok":true,…}`,
`https://tsoftware.online/admin/` prosi o hasło.

## 6. Logi

- Serwer: `journalctl -u tsoftware -f` (jedna linia na żądanie: metoda, ścieżka, status, czas; bez danych osobowych).
  Błędy 500 mają ślad stosu w tym samym logu.
- Caddy: `journalctl -u caddy -f` oraz plik `/var/log/caddy/tsoftware.online.log` (log dostępu, JSON).

## 7. Aktualizacja

Ręcznie na serwerze:

```bash
cd /opt/tsoftware
sudo -u tsoftware git pull
sudo systemctl restart tsoftware
```

Albo automatycznie przez GitHub Actions (rozdział 9) lub z własnego komputera skryptem `deploy/deploy.sh`:

```bash
VPS_HOST=1.2.3.4 VPS_USER=tsoftware VPS_PATH=/opt/tsoftware deploy/deploy.sh
```

Skrypt robi `rsync` repozytorium (pomijając `.git`, `.env`, `server/data`, `node_modules`) i `sudo systemctl restart tsoftware`.

Po restarcie serwer wczytuje `server/data/*.json` z dysku, więc zgłoszenia i ustawienia z panelu zostają.

## 8. Backup `server/data/`

Cały stan serwisu to katalog `server/data/`: `leads.json` (zgłoszenia), `magnet.json` (zapisy na PDF),
`settings.json` (ustawienia z panelu) i `secret` (klucz podpisujący sesje panelu). Zapis jest atomowy
(plik tymczasowy + `rename`), więc kopię można robić w dowolnym momencie, bez zatrzymywania serwera.

Codzienna kopia (cron, jako root; trzyma 30 ostatnich archiwów):

```bash
sudo mkdir -p /var/backups/tsoftware
sudo tee /etc/cron.daily/tsoftware-backup >/dev/null <<'SH'
#!/bin/sh
set -e
dest=/var/backups/tsoftware
tar -czf "$dest/data-$(date +%F).tar.gz" -C /opt/tsoftware/server data
ls -1t "$dest"/data-*.tar.gz | tail -n +31 | xargs -r rm --
SH
sudo chmod +x /etc/cron.daily/tsoftware-backup
```

Warto kopiować `/var/backups/tsoftware` poza serwer (np. `rsync` na własny komputer, S3/B2, Hetzner Storage Box).

Przywracanie:

```bash
sudo systemctl stop tsoftware
sudo tar -xzf /var/backups/tsoftware/data-2026-01-31.tar.gz -C /opt/tsoftware/server
sudo chown -R tsoftware:tsoftware /opt/tsoftware/server/data
sudo systemctl start tsoftware
```

## 9. Automatyczne wdrożenie z GitHub Actions

`.github/workflows/deploy.yml` po każdym pushu do `main` (albo ręcznie: Actions → Deploy → Run workflow):

1. `check` – `node --check` na każdym pliku `.js`/`.mjs` w `assets/js/` i `server/` oraz `node --test server/test.mjs`,
2. `deploy` – `rsync` repozytorium na serwer przez SSH i `sudo systemctl restart tsoftware`.

### Klucz SSH do wdrożeń

Na swoim komputerze:

```bash
ssh-keygen -t ed25519 -C "github-deploy tsoftware" -f ~/.ssh/tsoftware-deploy -N ""
cat ~/.ssh/tsoftware-deploy.pub
```

Na serwerze dopisz klucz publiczny użytkownikowi `tsoftware`:

```bash
sudo -u tsoftware mkdir -p /opt/tsoftware/.ssh
echo "ssh-ed25519 AAAA… github-deploy tsoftware" | sudo -u tsoftware tee -a /opt/tsoftware/.ssh/authorized_keys
sudo chmod 700 /opt/tsoftware/.ssh && sudo chmod 600 /opt/tsoftware/.ssh/authorized_keys
```

### Restart bez hasła

Użytkownik `tsoftware` może bez hasła wykonać tylko restart/status tej jednej usługi:

```bash
echo 'tsoftware ALL=(root) NOPASSWD: /usr/bin/systemctl restart tsoftware, /usr/bin/systemctl status tsoftware' | sudo tee /etc/sudoers.d/tsoftware
sudo chmod 440 /etc/sudoers.d/tsoftware
```

### Sekrety w repozytorium

GitHub → Settings → Secrets and variables → Actions → New repository secret:

| Sekret        | Wartość                                                     |
|---------------|-------------------------------------------------------------|
| `VPS_SSH_KEY` | zawartość **prywatnego** klucza `~/.ssh/tsoftware-deploy`   |
| `VPS_HOST`    | adres IP serwera (albo nazwa, np. `tsoftware.online`)       |
| `VPS_USER`    | `tsoftware`                                                 |
| `VPS_PATH`    | `/opt/tsoftware`                                            |

`rsync --delete` usuwa na serwerze pliki, których nie ma już w repozytorium, ale pomija `.env`,
`server/data/`, `.git` i `node_modules`, więc dane i konfiguracja zostają.

Jeśli wolisz oddzielnego użytkownika do wdrożeń (np. `deploy`), musi on mieć prawo zapisu do `/opt/tsoftware`
(poza `server/data/`) i tę samą regułę w sudoers.

## 10. Wariant z Dockerem

Zamiast Node + systemd (Caddy zostaje jak wyżej – kontener słucha tylko na `127.0.0.1:3000`):

```bash
cd /opt/tsoftware
cp .env.example .env && nano .env            # jak w kroku 3
mkdir -p server/data && sudo chown 1000:1000 server/data   # użytkownik `node` w kontenerze
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f
```

- `deploy/Dockerfile`: `node:22-alpine`, kopiuje repozytorium (lista pominięć: `deploy/Dockerfile.dockerignore`),
  uruchamia `node server/server.js` jako użytkownik `node`, ma `HEALTHCHECK` na `/api/health`.
- `deploy/docker-compose.yml`: `env_file: ../.env`, wolumen `../server/data` → `/app/server/data`,
  port `127.0.0.1:3000:3000`, `restart: unless-stopped`.

Aktualizacja: `git pull && docker compose -f deploy/docker-compose.yml up -d --build`.
Backup: ten sam katalog `server/data/`.

## 11. Najczęstsze problemy

| Objaw | Przyczyna / rozwiązanie |
|-------|-------------------------|
| `/api/admin/*` zwraca **503** „Panel nieaktywny” | brak `ADMIN_PASSWORD` / `ADMIN_PASSWORD_HASH` w `.env`; po dopisaniu `sudo systemctl restart tsoftware` |
| po zalogowaniu panel od razu wylogowuje | ciasteczko ma flagę `Secure`, a strona jest otwarta po HTTP – wejdź przez `https://`; albo `TRUST_PROXY=0` przy testach bez Caddy |
| **403** „Brak nagłówka X-Requested-With” | żądania zmieniające stan panelu wymagają nagłówka `X-Requested-With: fetch` (ochrona CSRF) – `admin/admin.js` go wysyła |
| **429** przy testowaniu formularza | limit 10 zgłoszeń/min z jednego IP (logowanie: 5 nieudanych/15 min); poczekaj minutę |
| `EADDRINUSE` w logu | port 3000 zajęty – zmień `PORT` w `.env` i w `Caddyfile` |
| `EACCES` przy zapisie `leads.json` | `server/data` nie należy do `tsoftware`: `sudo chown -R tsoftware:tsoftware /opt/tsoftware/server/data` |
| Caddy nie wystawia certyfikatu | DNS nie wskazuje jeszcze na serwer albo port 80/443 zamknięty – `journalctl -u caddy -f` |

## 12. Skrót API (dla porządku)

Publiczne (JSON, bez ciasteczek):

- `GET /api/config` – publiczne ustawienia: `plans`, `configurator`, `contact`, `features`, `theme`, `magnet` (cache 60 s).
- `POST /api/lead` – `{name, email, company?, topic?, message, source?, meta?, website?}` → `{ok:true, id}`; `website` to pole-pułapka.
- `POST /api/magnet` – `{email, name?, website?}` → `{ok:true, url}`.
- `GET /api/health` – `{ok, uptime, leads}`.

Panel (ciasteczko `ts_admin`; żądania POST/PUT/PATCH/DELETE wymagają nagłówka `X-Requested-With: fetch`):

- `POST /api/admin/login {password}`, `POST /api/admin/logout`, `GET /api/admin/me`
- `GET /api/admin/leads?status=&q=&source=&limit=&offset=`, `GET|PATCH|DELETE /api/admin/leads/:id`
- `GET /api/admin/magnet?limit=&offset=`, `DELETE /api/admin/magnet/:id`
- `GET|PUT /api/admin/settings`, `GET /api/admin/stats`, `GET /api/admin/export.csv`

Odpowiedzi błędów mają postać `{ok:false, error:"…"}` (walidacja: dodatkowo `field`).
