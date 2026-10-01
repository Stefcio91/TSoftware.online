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
| 2 | Hero | `#top` | boot-intro raz na sesję, scena 3D w WebGL (huby systemów wokół rdzenia AI, impulsy, zdarzenia na żywo), neonowa siatka perspektywiczna, post-processing (aberracja chromatyczna, scanlines, glitch), HUD z zegarem i logiem, glitch hasła „Nudną robotę oddaj automatom.” |
| 3 | Narzędzia | — | przesuwający się pasek narzędzi i systemów (n8n, Make, Comarch, SAP, …) |
| 4 | Usługi | `#uslugi` | 8 kart, każda z własną animowaną ilustracją (SVG) i jednym zdaniem opisu: automatyzacja procesów, wdrażanie AI, asystenci AI, treści graficzne AI, filmy AI, strony WWW, integracje ERP, skrypty |
| 5 | Jak to działa | `#jak-to-dziala` | **scena sterowana scrollem**: ekran się „przykleja”, a przewijanie uruchamia automatyzację krok po kroku (webhook → AI → ERP → faktura → zespół), pakiet danych wędruje po połączeniach, log dopisuje linie, na końcu licznik 26 min → 1 min |
| 6 | Zastosowania | `#zastosowania` | 6 obszarów firmy, każdy jako wizualny przepływ z ikonami (wyzwalacz → AI → system → efekt) i jednym zdaniem efektu |
| 7 | Integracje | `#integracje` | animowana mapa: sklep, ERP, CRM, e-mail, magazyn i księgowość połączone z hubem TSoftware, pakiety danych krążą po połączeniach |
| 8 | Realizacje | `#realizacje` | trzy wdrożenia z suwakiem „przed / po”: e-mail checker, WhatsApp checker, agent firmowy; **liczby orientacyjne, do potwierdzenia** |
| 9 | Kalkulator | `#kalkulator` | suwaki: minuty, razy dziennie, dni, stawka; liczy godziny, złotówki i dni w roku; presety; „Wyślij mi to wyliczenie” wpisuje wynik do formularza |
| 10 | Konfigurator | `#konfigurator` | wybór wyzwalacza, systemów i akcji; rysuje schemat SVG na żywo i podaje widełki ceny oraz czasu; „Wyceń to dokładnie” przekazuje konfigurację do formularza |
| 11 | Cennik | `#cennik` | Start od 1 500 zł, Firma od 4 900 zł, Opieka od 490 zł/mies.; kwoty edytowalne w panelu |
| 11a | Darmowy PDF | `#lista` | lead magnet „30 procesów, które da się zautomatyzować w tydzień”: e-mail → PDF (`assets/dl/`), zapisy widoczne w panelu |
| 12 | Współpraca | `#wspolpraca` | 4 kroki z ikonami i linią postępu wypełnianą podczas przewijania + 4 zasady z ikonami |
| 13 | FAQ | `#faq` | 6 najczęstszych pytań (rozwijane) |
| 14 | Kontakt | `#kontakt` | dane kontaktowe (do uzupełnienia) + formularz zapytania |
| 15 | Stopka | — | skrót oferty, linki, dane rejestrowe (do uzupełnienia) |

## Efekty

- **Intro** raz na sesję: dekodujące się logo, a scena 3D składa się z pyłu.
- **Kinetyczna typografia**: grubość liter hasła podąża za kursorem (font zmienny).
- **Zmiana motywu** jako fala od klikniętego przycisku (View Transitions API).
- **Natywne animacje scrollowe** (CSS `animation-timeline`) tam, gdzie przeglądarka je ma; w innych zostaje IntersectionObserver.
- **Interaktywna mapa integracji**: klik w system podświetla połączenie i pokazuje trzy typowe automaty.
- **Easter egg**: klik w rdzeń AI albo kod Konami rozsadza sieć, która sprężyście wraca.
- **Adaptacyjna jakość** sceny: przy spadku klatek wyłącza pył i obniża rozdzielczość.
- **Kursor** z kropką i pierścieniem (desktop), przyciski magnetyczne, karty spotlight, marquee.

## Pod maską

- **Fonty lokalnie** (`assets/fonts/`, `assets/css/fonts.css`): zero połączeń z Google, RODO bez ryzyka.
- **Formularz**: wysyła JSON na `/api/lead` (źródło i metadane z kalkulatora/konfiguratora); bez backendu otwiera pocztę. Pole-pułapka na boty.
- **Analityka bez ciasteczek**: zakomentowany snippet Plausible/Umami w `index.html`.
- **Polityka prywatności**: `polityka-prywatnosci.html`, napisana po ludzku, z danymi administratora.
- **SEO i AI**: `robots.txt`, `sitemap.xml`, `llms.txt`, JSON-LD, obrazek OG.
- **Wdrożenie**: `.github/workflows/deploy.yml` wysyła repo na VPS przez rsync/SSH po pushu do `main` i restartuje usługę (sekrety: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PATH`). `preview.yml` uruchamia test dymny Playwright na pull requestach.
- **Nagłówki bezpieczeństwa** ustawia serwer (`server/`); `_headers` zostaje na wypadek hostingu statycznego.

## Wydajność

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

Domyślny motyw to **Granat**. Użytkownik może zmienić go ikoną palety w nagłówku
na **Ciemny**, **Jasny** albo **Ciepły**; wybór zapamiętuje się w przeglądarce.
Motyw domyślny i widoczność przełącznika ustawisz w panelu (Ustawienia → Motyw).
Każdy wariant to blok `:root[data-theme="…"]` na początku `assets/css/styles.css`;
kolory strony, poświaty i paleta sceny w hero biorą się z tych tokenów.

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

## Dane firmy

Tomasz Stachowiak · TSoftware · ul. Sportowa 10E, 58-130 Mrowiny · NIP 8842684500 ·
kontakt@tsoftware.online · +48 503 844 406 (WhatsApp). Wpisane w: sekcja Kontakt,
zgoda w formularzu, stopka, JSON-LD, `llms.txt`, `polityka-prywatnosci.html`,
PDF lead magnetu i domyślne ustawienia serwera (`server/`). Dane kontaktowe na
stronie można nadpisać w panelu (Ustawienia → Kontakt).

## Do potwierdzenia

- [ ] **Liczby w realizacjach** (`#realizacje`): czas na skrzynkę 2 h → 15 min, +8 h/tydz.; odpowiedź 20 s, 70% spraw przez AI; 5 kanałów, +15 h/tydz. — podmień na prawdziwe wartości z wdrożeń
- [ ] **Ceny** pakietów i parametry widełek w konfiguratorze — zmienisz w panelu bez ruszania kodu
- [ ] **Logo** — obecnie znak „T” w SVG (`index.html`, `assets/img/favicon.svg`)
- [ ] **Sekcja „O mnie”** ze zdjęciem, jeśli chcesz
- [ ] **Messenger** — jest WhatsApp; link do Messengera dojdzie, gdy podasz nazwę strony na Facebooku

## Backend i panel admina (VPS)

Strona ma własny, bezzależnościowy serwer Node (`server/`), który:

- serwuje stronę i panel pod `/admin/`,
- przyjmuje zgłoszenia (`POST /api/lead`: formularz, kalkulator, konfigurator)
  i zapisy na PDF (`POST /api/magnet`), z honeypotem i limitem prób,
- wysyła powiadomienie o nowym zgłoszeniu na webhook (np. n8n) i/lub Telegram,
- udostępnia `GET /api/config`, z którego strona bierze ceny, dane kontaktowe,
  motyw domyślny i przełączniki funkcji (intro, PDF, WhatsApp) — zmieniasz je
  w panelu, bez deployu.

Panel (`/admin/`): logowanie hasłem z `.env`, lista zgłoszeń ze statusami
i notatkami, statystyki, zapisy na PDF, ustawienia. Instrukcja uruchomienia
na VPS (systemd + Caddy z automatycznym HTTPS, albo Docker) jest w
`deploy/README.md`; zmienne środowiskowe w `.env.example`.

Bez działającego backendu (np. statyczny podgląd) strona nadal działa:
formularz otwiera program pocztowy, a PDF pobiera się bezpośrednio.

## Następne kroki (propozycje)

1. Uzupełnienie danych z checklisty i korekta treści.
2. Podstrona polityki prywatności (i ewentualnie baner cookies, jeśli dojdzie
   analityka, np. Google Analytics / Plausible).
3. Sekcja „O mnie / o firmie” ze zdjęciem i krótką historią.
4. Realizacje / case studies, gdy będą gotowe pierwsze wdrożenia do pokazania.
5. Wersja angielska strony (opcjonalnie).
