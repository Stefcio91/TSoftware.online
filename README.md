# TSoftware.online — strona firmowa

Szkic (v0.1) nowoczesnej strony firmowej TSoftware: automatyzacja procesów
biznesowych, wdrożenia AI, asystenci AI, treści graficzne i wideo AI, strony WWW
oraz integracje ERP.

Strona jest statyczna (HTML + CSS + odrobina JS), bez frameworka i bez procesu
budowania. Można ją wrzucić na dowolny hosting (GitHub Pages, Netlify,
Cloudflare Pages, zwykły serwer WWW).

## Zarys strony (sekcje)

| # | Sekcja | Id / link | Co zawiera |
|---|--------|-----------|------------|
| 1 | Nagłówek | — | logo, menu (na telefonie rozwijane), przycisk „Umów konsultację” |
| 2 | Hero | `#top` | główne hasło, opis, 2 przyciski, po prawej animowany przykład automatyzacji (zamówienie → AI → ERP → faktura → zespół) z „logiem” |
| 3 | Narzędzia | — | pasek z narzędziami i systemami, z którymi pracujemy (n8n, Make, Comarch, SAP, …) |
| 4 | Usługi | `#uslugi` | 8 kart: automatyzacja procesów, wdrażanie AI, asystenci AI i chatboty, treści graficzne AI, filmy AI, strony WWW i aplikacje, integracje ERP, skrypty na zamówienie |
| 5 | Efekty | `#efekty` | porównanie „przed / po” na przykładowym procesie (zamówienie B2B → ERP) + 4 filary współpracy |
| 6 | Jak pracujemy | `#proces` | 4 kroki: konsultacja → projekt i wycena → wdrożenie i testy → szkolenie i wsparcie |
| 7 | Zastosowania | `#zastosowania` | przykłady wdrożeń w 6 obszarach: sprzedaż, obsługa klienta, finanse, logistyka, marketing, administracja/HR |
| 8 | FAQ | `#faq` | 6 najczęstszych pytań (rozwijane) |
| 9 | Kontakt | `#kontakt` | dane kontaktowe (do uzupełnienia) + formularz zapytania |
| 10 | Stopka | — | skrót oferty, linki, dane rejestrowe (do uzupełnienia) |

## Kierunek wizualny

- Ciemne, chłodne tło z lekkim odcieniem granatu („control room”), akcent
  niebieski, pomarańczowy „sygnał” dla stanów i podświetleń.
- Fonty z Google Fonts: Bricolage Grotesque (nagłówki), IBM Plex Sans (tekst),
  IBM Plex Mono (etykiety systemowe, czasy, log).
- Jeden element ruchomy: pipeline w hero (impuls przechodzący przez kolejne
  kroki). Reszta strony spokojna. Animacje są wyłączane przy ustawieniu
  „ograniczony ruch” w systemie.
- Układ responsywny: 4 → 2 → 1 kolumna, menu mobilne, brak przewijania w poziomie.

Wszystkie kolory i fonty są zdefiniowane jako zmienne na początku
`assets/css/styles.css`, więc zmiana palety to edycja kilku linijek.

## Struktura plików

```
index.html              strona (cała treść)
assets/css/styles.css   style
assets/js/main.js       menu mobilne, podświetlanie sekcji, formularz
assets/img/favicon.svg  ikona strony
```

## Uruchomienie lokalne

Wystarczy otworzyć `index.html` w przeglądarce. Jeśli wolisz lokalny serwer:

```bash
npx serve .
# albo
python3 -m http.server 8080
```

## Wdrożenie

- **GitHub Pages**: Settings → Pages → Source: branch `main`, folder `/`.
  Dodaj plik `CNAME` z treścią `tsoftware.online` i ustaw w DNS rekordy
  A/ALIAS na GitHub Pages (opis w dokumentacji GitHub).
- **Netlify / Cloudflare Pages**: podłącz repozytorium, bez komendy budowania,
  katalog publikacji `/`.
- **Zwykły hosting**: wgraj zawartość repozytorium przez FTP/SFTP.

## Dane do uzupełnienia (checklista)

Wszystkie miejsca są oznaczone w `index.html` nawiasami kwadratowymi `[...]`
lub komentarzem `TODO`. Łatwo je znaleźć: `grep -n "\[" index.html`.

- [ ] **Nazwa firmy** (pełna, rejestrowa) — sekcja Kontakt, zgoda w formularzu, stopka
- [ ] **NIP** (ewentualnie REGON / KRS) — Kontakt, stopka
- [ ] **Adres** — Kontakt
- [ ] **Telefon** — Kontakt (obecnie `+48 000 000 000`)
- [ ] **E-mail** — Kontakt oraz atrybut `data-email` formularza (obecnie `kontakt@tsoftware.online`)
- [ ] **Godziny pracy** — Kontakt (obecnie pon.–pt. 9:00–17:00)
- [ ] **Linki do social mediów** (LinkedIn, Facebook, inne) — Kontakt
- [ ] **Imię i nazwisko / zdjęcie właściciela** — jeśli chcesz sekcję „O mnie” (do dodania)
- [ ] **Logo** — obecnie prosty znak „T” w SVG; można podmienić w `index.html` i `assets/img/favicon.svg`
- [ ] **Obrazek do udostępniania** (`assets/img/og.png`, 1200×630) — odkomentować `og:image` w `<head>`
- [ ] **Dane strukturalne** (JSON-LD w `<head>`) — dopisać telefon, e-mail, adres
- [ ] **Treści**: hasło w hero, opisy usług, przykładowy scenariusz w sekcji Efekty, FAQ — wszystko jest propozycją do przeredagowania
- [ ] **Polityka prywatności** — podstrona lub plik PDF; linki w formularzu i stopce prowadzą teraz do `#`

## Formularz kontaktowy

W wersji szkicowej formularz nie ma backendu: po kliknięciu „Wyślij zapytanie”
składa treść wiadomości i otwiera program pocztowy użytkownika (`mailto:`).

Docelowo warto podłączyć usługę formularzy, np.:

- **Formspree**: w `index.html` dodaj `action="https://formspree.io/f/TWOJE_ID"`
  i `method="POST"` do `<form>`, a w `assets/js/main.js` usuń obsługę `submit`
  (lub zamień na `fetch` do tego samego adresu).
- **Netlify Forms**: dodaj atrybut `netlify` do `<form>` (działa tylko na Netlify).
- Własny endpoint (np. n8n/Make webhook), który zapisze zapytanie w CRM i wyśle
  powiadomienie — dobry przykład własnej automatyzacji.

## Następne kroki (propozycje)

1. Uzupełnienie danych z checklisty i korekta treści.
2. Podstrona polityki prywatności (i ewentualnie baner cookies, jeśli dojdzie
   analityka, np. Google Analytics / Plausible).
3. Sekcja „O mnie / o firmie” ze zdjęciem i krótką historią.
4. Realizacje / case studies, gdy będą gotowe pierwsze wdrożenia do pokazania.
5. Wersja angielska strony (opcjonalnie).
