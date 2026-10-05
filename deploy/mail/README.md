# Własna skrzynka kontakt@tsoftware.online na tym samym VPS

Poczta stoi obok strony, na tym samym serwerze, w jednym kontenerze Dockera
([docker-mailserver](https://github.com/docker-mailserver/docker-mailserver): Postfix, Dovecot, Rspamd, fail2ban).
Do tego webmail Roundcube pod `https://poczta.tsoftware.online`. Caddy, który już obsługuje stronę, wystawia
certyfikaty także dla poczty. Nic nie kupujesz, domena zostaje u cyber_Folks, zmieniasz tylko rekordy DNS.

```
internet ──25/465/587/993──▶ docker: mailserver (mail.tsoftware.online) ──▶ ./data/mail-data (skrzynki)
internet ──HTTPS──▶ Caddy ──▶ 127.0.0.1:3000 strona
                        └──▶ 127.0.0.1:8025 webmail (Roundcube)
```

## Zanim zaczniesz: trzy rzeczy, które decydują, czy to ma sens

1. **Port 25 na zewnątrz.** Część dostawców VPS blokuje go na nowych kontach. Sprawdź z serwera:
   ```bash
   nc -vz -w 5 gmail-smtp-in.l.google.com 25
   ```
   `succeeded` znaczy, że wysyłka działa. `timed out` znaczy blokadę: napisz do supportu dostawcy o odblokowanie
   (zwykle robią to po prośbie) albo wysyłaj przez przekaźnik (krok 10). Odbiór działa niezależnie od tego.
2. **Rewers (PTR).** W panelu dostawcy VPS adres `84.234.126.51` musi mieć ustawiony rewers na `mail.tsoftware.online`.
   Bez tego Gmail i Outlook wrzucają Twoje maile do spamu albo w ogóle ich nie przyjmują. Szukaj pozycji
   „Reverse DNS”, „rDNS” albo „PTR” przy adresie IP serwera.
3. **Pamięć.** Kontener bez antywirusa zajmuje ok. 600 MB RAM, z ClamAV ponad 1,5 GB. Strona zajmuje ok. 100 MB.
   VPS z 2 GB RAM wystarczy bez antywirusa.

Uczciwie: własna poczta działa dobrze przez lata, ale to Ty dbasz o backup, aktualizacje i reputację adresu IP.
Świeży adres bywa na listach blokujących, dlatego pierwsze maile sprawdź na mail-tester.com (krok 7).

## 1. DNS w panelu cyber_Folks

Panel Klienta → Domeny → `tsoftware.online` → Edytuj strefę DNS. Dodaj lub popraw:

| Typ | Nazwa | Wartość | Uwagi |
|-----|-------|---------|-------|
| A | `mail` | `84.234.126.51` | serwer poczty |
| A | `poczta` | `84.234.126.51` | webmail (jeśli zostawiasz usługę `webmail`) |
| MX | `@` | `mail.tsoftware.online` | priorytet `10` |
| TXT | `@` | `v=spf1 mx ~all` | SPF: wysyłać może serwer z rekordu MX |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:kontakt@tsoftware.online` | DMARC; po paru tygodniach bez problemów zmień `p=none` na `p=quarantine` |
| TXT | `mail._domainkey` | wartość z kroku 5 | DKIM, dopiszesz po wygenerowaniu klucza |

Jeśli w strefie są stare rekordy MX cyber_Folks albo TXT z `include:` ich serwerów, usuń je. Dwa rekordy MX na dwa
różne serwery sprawią, że część poczty trafi w stare miejsce. Rekordy A dla `@` i `www` zostają tak, jak ustawiłeś
dla strony.

## 2. Docker na VPS

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo docker compose version
```

## 3. Firewall

```bash
sudo ufw allow 25,465,587,993/tcp
```

## 4. Certyfikat z Caddy

Caddy musi wystawić certyfikat dla `mail.tsoftware.online` (i `poczta.tsoftware.online`), zanim ruszy poczta.
Rekordy A z kroku 1 muszą już działać (`nslookup mail.tsoftware.online` zwraca adres serwera).

```bash
sudo tee -a /etc/caddy/Caddyfile < /opt/tsoftware/deploy/mail/Caddyfile.mail
sudo systemctl reload caddy
sleep 20
sudo ls /var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/mail.tsoftware.online/
```

Masz zobaczyć `mail.tsoftware.online.crt` i `mail.tsoftware.online.key`. Jeśli katalogu nie ma, zajrzyj do
`journalctl -u caddy -n 50` (najczęściej DNS jeszcze nie wskazuje na serwer). Jeśli Caddy użył innego wystawcy
i katalog nazywa się inaczej, popraw ścieżkę w `compose.yaml`.

## 5. Start poczty i pierwsze konto

```bash
sudo mkdir -p /opt/tsoftware-mail
sudo cp -r /opt/tsoftware/deploy/mail/. /opt/tsoftware-mail/
cd /opt/tsoftware-mail

# Konto tworzysz PRZED pierwszym startem (polecenie zapyta o hasło):
sudo docker run --rm -it -v "$PWD/data/config:/tmp/docker-mailserver" \
  ghcr.io/docker-mailserver/docker-mailserver:latest setup email add kontakt@tsoftware.online

sudo docker compose up -d
sudo docker compose logs -f mailserver     # Ctrl+C, gdy zobaczysz „is up and running”

# Alias wymagany przez standardy poczty i klucz DKIM:
sudo docker exec -it mailserver setup alias add postmaster@tsoftware.online kontakt@tsoftware.online
sudo docker exec -it mailserver setup config dkim domain tsoftware.online
sudo docker compose restart mailserver
```

Polecenie `setup config dkim` wypisuje gotowy rekord DNS. Wklej go w cyber_Folks jako TXT o nazwie
`mail._domainkey` (jedna linia zaczynająca się od `v=DKIM1; k=rsa; p=...`). Klucz leży też w
`data/config/rspamd/dkim/`. Sprawdzenie po kilku minutach:

```bash
dig +short TXT mail._domainkey.tsoftware.online
dig +short MX tsoftware.online
dig -x 84.234.126.51 +short     # rewers: ma zwrócić mail.tsoftware.online.
```

Kolejne skrzynki i aliasy, kiedy będą potrzebne:

```bash
sudo docker exec -it mailserver setup email add biuro@tsoftware.online
sudo docker exec -it mailserver setup alias add faktury@tsoftware.online kontakt@tsoftware.online
sudo docker exec -it mailserver setup email list
```

## 6. Program pocztowy i telefon

| Ustawienie | Wartość |
|------------|---------|
| Login | `kontakt@tsoftware.online` (pełny adres) |
| Serwer poczty przychodzącej | IMAP `mail.tsoftware.online`, port `993`, SSL/TLS |
| Serwer poczty wychodzącej | SMTP `mail.tsoftware.online`, port `465`, SSL/TLS (albo `587` ze STARTTLS) |
| Uwierzytelnianie | zwykłe hasło, to samo co do IMAP |

Webmail: `https://poczta.tsoftware.online`, ten sam login i hasło.

## 7. Test, zanim wyślesz cokolwiek do klienta

1. Wyślij maila z Gmaila na `kontakt@tsoftware.online` i sprawdź, czy doszedł (webmail albo program pocztowy).
2. Wejdź na [mail-tester.com](https://www.mail-tester.com), skopiuj podany adres i wyślij na niego maila
   z `kontakt@tsoftware.online`. Wynik 9/10 lub 10/10 oznacza, że SPF, DKIM, DMARC i rewers są w porządku.
   Niższy wynik: strona wypisze, czego brakuje.
3. Wyślij maila na swój prywatny Gmail i otwórz „Pokaż oryginał”: przy SPF, DKIM i DMARC ma być `PASS`.

## 8. Newsletter i potwierdzenia ze strony przez własną skrzynkę

W `/opt/tsoftware/.env` strony:

```
MAIL_FROM="TSoftware <kontakt@tsoftware.online>"
SMTP_HOST=mail.tsoftware.online
SMTP_PORT=465
SMTP_USER=kontakt@tsoftware.online
SMTP_PASS=haslo-do-skrzynki
```

Potem `sudo systemctl restart tsoftware`. Panel → Newsletter → Ustawienia pokaże „SMTP: mail.tsoftware.online”,
a przycisk „wyślij test” potwierdzi, że działa.

## 9. Aktualizacje i backup

```bash
cd /opt/tsoftware-mail
sudo docker compose pull && sudo docker compose up -d
```

Cały stan poczty to katalog `/opt/tsoftware-mail/data/`: skrzynki, konta, klucze DKIM, baza webmaila.
Do codziennego backupu strony (deploy/README.md, rozdział 8) dopisz drugą linię `tar`:

```bash
tar -czf "$dest/mail-$(date +%F).tar.gz" -C /opt/tsoftware-mail data
```

## 10. Jeśli port 25 jest zablokowany: wysyłka przez Brevo

Odbiór zostaje na VPS, a wysyłka idzie przez darmowe konto Brevo (300 maili dziennie). W Brevo: Senders & IP → Domains
→ dodaj `tsoftware.online` i uzupełnij rekordy, które pokaże (ich DKIM i dopisek `include:` do rekordu SPF).
Potem na serwerze:

```bash
cd /opt/tsoftware-mail
sudo sed -i 's/^#DEFAULT_RELAY_HOST=/DEFAULT_RELAY_HOST=/' mailserver.env
sudo docker exec -it mailserver setup relay add-auth tsoftware.online 'login-smtp-z-brevo' 'klucz-smtp-z-brevo'
sudo docker compose up -d --force-recreate mailserver
```

## 11. Najczęstsze problemy

| Objaw | Co sprawdzić |
|-------|--------------|
| kontener startuje i po 2 minutach się wyłącza | brak konta: krok 5, `setup email add` przed startem |
| „certificate not found” w logu | katalog certyfikatu Caddy nie istnieje albo ma inną nazwę: krok 4 |
| program pocztowy nie łączy się | `sudo ufw status` (porty z kroku 3) i `sudo docker compose logs mailserver | tail -50` |
| maile lądują w spamie u odbiorców | mail-tester.com; najczęściej brak rewersu (PTR) albo DKIM jeszcze nie w DNS |
| nie dochodzą maile z zewnątrz | `dig +short MX tsoftware.online` ma zwrócić `mail.tsoftware.online.`; port 25 w ufw |
| webmail przestał logować wszystkich | fail2ban zablokował adres Dockera po nieudanych logowaniach: `sudo docker exec mailserver setup fail2ban unban 172.17.0.1` (adres z `setup fail2ban`) |
| po odnowieniu certyfikatu klienci zgłaszają stary certyfikat | `sudo docker compose restart mailserver`; można dodać do crona raz w miesiącu |
