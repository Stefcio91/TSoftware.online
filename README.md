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
| 2 | Hero | `#top` | scena 3D w WebGL: systemy firmy (sklep, ERP, CRM, e-mail, magazyn, księgowość) jako świetliste huby wokół rdzenia AI, impulsy danych, zdarzenia „na żywo” (nowe zamówienie, faktura, CRM…), obrót myszą/przeciąganiem, zorza w tle; hasło „Nudną robotę oddaj automatom.” |
| 3 | Narzędzia | — | przesuwający się pasek narzędzi i systemów (n8n, Make, Comarch, SAP, …) |
| 4 | Usługi | `#uslugi` | 8 kart, każda z własną animowaną ilustracją (SVG) i jednym zdaniem opisu: automatyzacja procesów, wdrażanie AI, asystenci AI, treści graficzne AI, filmy AI, strony WWW, integracje ERP, skrypty |
| 5 | Jak to działa | `#jak-to-dziala` | **scena sterowana scrollem**: ekran się „przykleja”, a przewijanie uruchamia automatyzację krok po kroku (webhook → AI → ERP → faktura → zespół), pakiet danych wędruje po połączeniach, log dopisuje linie, na końcu licznik 26 min → 1 min |
| 6 | Zastosowania | `#zastosowania` | 6 obszarów firmy, każdy jako wizualny przepływ z ikonami (wyzwalacz → AI → system → efekt) i jednym zdaniem efektu |
| 7 | Integracje | `#integracje` | animowana mapa: sklep, ERP, CRM, e-mail, magazyn i księgowość połączone z hubem TSoftware, pakiety danych krążą po połączeniach |
| 8 | Współpraca | `#wspolpraca` | 4 kroki z ikonami i linią postępu wypełnianą podczas przewijania + 4 zasady z ikonami |
| 9 | FAQ | `#faq` | 6 najczęstszych pytań (rozwijane) |
| 10 | Kontakt | `#kontakt` | dane kontaktowe (do uzupełnienia) + formularz zapytania |
| 11 | Stopka | — | skrót oferty, linki, dane rejestrowe (do uzupełnienia) |

## Efekty i wydajność

- Hero to własna scena WebGL (`assets/js/hero-scene.js`): zorza w tle plus
  sieć 3D (punkty, linie, impulsy) rysowana w jednym canvasie; etykiety hubów
  to HTML rzutowany tą samą macierzą, więc trzymają się węzłów. Renderuje
  w obniżonej rozdzielczości, zatrzymuje się poza ekranem i w ukrytej karcie.
  Bez WebGL zostaje gradient z CSS i sam tekst.
- Scena „Jak to działa” (`assets/js/stage.js`) nie używa bibliotek: stan sceny
  jest funkcją postępu przewijania, więc działa w obie strony i na dotyku.
- Ilustracje usług i mapa integracji to inline SVG animowane w CSS/SMIL,
  ikony w przepływach pochodzą z jednego sprite'a `<symbol>` na górze `index.html`.
- Ujawnianie sekcji, karty „spotlight”, kursor, przyciski „magnetyczne”
  i karta 3D (`assets/js/main.js`). Efekty zależne od myszy włączają się
  tylko na urządzeniach z kursorem.
- Przy systemowym ustawieniu „ograniczony ruch” animacje są wyłączone,
  a scena pokazuje stan końcowy w zwykłym przepływie strony.
- Fonty z Google Fonts: Bricolage Grotesque (nagłówki), IBM Plex Sans (tekst),
  IBM Plex Mono (etykiety, log). Kolory i fonty to zmienne na początku
  `assets/css/styles.css`.

## Warianty kolorystyczne

W prawym dolnym rogu jest przełącznik motywów (wersja szkicowa, do usunięcia
po wyborze): **Ciemny** (domyślny), **Granat** (jaśniejszy granat), **Jasny**
(biel + kobalt) i **Ciepły** (ciepła biel + morski + koral). Każdy wariant to
blok `:root[data-theme="…"]` na początku `assets/css/styles.css`; wszystkie
kolory strony, poświaty i paleta shadera w hero biorą się z tych tokenów.
Wybór zapamiętuje się w przeglądarce (`localStorage`).

## Struktura plików

```
index.html                 strona (cała treść)
assets/css/styles.css      style
assets/js/hero-scene.js    scena 3D w hero (WebGL)
assets/js/stage.js         scena sterowana scrollem
assets/js/main.js          menu, nagłówek, hero, ujawnianie, formularz
assets/img/favicon.svg     ikona strony
assets/img/og.png          obrazek do udostępniania (1200×630), generowany ze sceny
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
