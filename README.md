# TSoftware.online — strona firmowa

Nowoczesna strona firmowa TSoftware: automatyzacja procesów biznesowych,
wdrożenia AI, asystenci AI, treści graficzne i wideo AI, strony WWW oraz
integracje ERP.

Strona jest statyczna (HTML + CSS + JS), bez frameworka, bez procesu budowania
i bez zewnętrznych bibliotek. Można ją wrzucić na dowolny hosting (GitHub Pages,
Netlify, Cloudflare Pages, zwykły serwer WWW).

## Zarys strony (sekcje)

| # | Sekcja | Id / link | Co zawiera |
|---|--------|-----------|------------|
| 1 | Nagłówek | — | logo, menu (na telefonie rozwijane), przycisk „Umów konsultację”, pasek postępu przewijania; nagłówek chowa się przy przewijaniu w dół |
| 2 | Hero | `#top` | tło WebGL (shader: „zorza danych”, iskry, światło pod kursorem), hasło wjeżdżające słowo po słowie, dekodowana etykieta, karta 3D z przykładową automatyzacją i logiem pisanym na żywo |
| 3 | Narzędzia | — | przesuwający się pasek narzędzi i systemów (n8n, Make, Comarch, SAP, …) |
| 4 | Usługi | `#uslugi` | 8 kart z efektem „spotlight” pod kursorem: automatyzacja procesów, wdrażanie AI, asystenci AI, treści graficzne AI, filmy AI, strony WWW, integracje ERP, skrypty |
| 5 | Jak to działa | `#jak-to-dziala` | **scena sterowana scrollem**: ekran się „przykleja”, a przewijanie uruchamia automatyzację krok po kroku (webhook → AI → ERP → faktura → zespół), pakiet danych wędruje po połączeniach, log dopisuje linie, na końcu licznik 26 min → 1 min |
| 6 | Współpraca | `#wspolpraca` | 4 kroki współpracy z linią postępu wypełnianą podczas przewijania + 4 zasady |
| 7 | Zastosowania | `#zastosowania` | przykłady wdrożeń w 6 obszarach firmy |
| 8 | FAQ | `#faq` | 6 najczęstszych pytań (rozwijane) |
| 9 | Kontakt | `#kontakt` | dane kontaktowe (do uzupełnienia) + formularz zapytania |
| 10 | Stopka | — | skrót oferty, linki, dane rejestrowe (do uzupełnienia) |

## Efekty i wydajność

- Tło hero to własny shader WebGL (`assets/js/hero-shader.js`): renderuje
  w obniżonej rozdzielczości (na telefonie 50%), zatrzymuje się, gdy hero
  jest poza ekranem lub karta jest w tle. Bez WebGL zostaje gradient z CSS.
- Scena „Jak to działa” (`assets/js/stage.js`) nie używa bibliotek: stan sceny
  jest funkcją postępu przewijania, więc działa w obie strony i na dotyku.
- Ujawnianie sekcji, karty „spotlight”, kursor, przyciski „magnetyczne”
  i karta 3D (`assets/js/main.js`). Efekty zależne od myszy włączają się
  tylko na urządzeniach z kursorem.
- Przy systemowym ustawieniu „ograniczony ruch” animacje są wyłączone,
  a scena pokazuje stan końcowy w zwykłym przepływie strony.
- Fonty z Google Fonts: Bricolage Grotesque (nagłówki), IBM Plex Sans (tekst),
  IBM Plex Mono (etykiety, log). Kolory i fonty to zmienne na początku
  `assets/css/styles.css`.

## Struktura plików

```
index.html                 strona (cała treść)
assets/css/styles.css      style
assets/js/hero-shader.js   tło WebGL w hero
assets/js/stage.js         scena sterowana scrollem
assets/js/main.js          menu, nagłówek, hero, ujawnianie, formularz
assets/img/favicon.svg     ikona strony
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
- [ ] **Treści**: hasło w hero, opisy usług, scenariusz w sekcji „Jak to działa”, FAQ — wszystko jest propozycją do przeredagowania
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
