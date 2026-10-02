/* TSoftware — i18n.js
   Słownik tekstów interfejsu, które generują skrypty (pl/en). Ładowany jako
   pierwszy skrypt. Język bierze się z <html lang> (domyślnie pl).
   API: window.TS_I18N = { lang, locale, t, dict, num, money, date }, window.t.
   t(key, vars): podstawia {nazwa} z vars; brak klucza w języku → wersja pl → klucz.
   Liczby i daty idą przez Intl (pl-PL / en-GB); waluta to PLN w obu wersjach
   („1 500 zł” / „PLN 1,500”). */
(function () {
  "use strict";

  var lang = (document.documentElement.getAttribute("lang") || "pl").slice(0, 2).toLowerCase();
  if (lang !== "en") lang = "pl";
  var LOCALE = lang === "en" ? "en-GB" : "pl-PL";
  /* po polsku tysiące rozdziela cienka spacja (tak jak w układzie strony), po angielsku przecinek z Intl */
  var GROUP = lang === "en" ? null : " ";

  var dict = { pl: {}, en: {} };

  /* ---------- Polski (wersja odniesienia) ---------- */
  dict.pl = {
    /* zgody (consent.js) */
    "consent.title.cookies": "Ciasteczka i prywatność",
    "consent.title.privacy": "Prywatność",
    "consent.desc.cookies": "Poza tym, co niezbędne do działania strony, mogę użyć narzędzi analitycznych i reklamowych, ale tylko za Twoją zgodą. Wybór zmienisz w każdej chwili w stopce. {policy}",
    "consent.desc.privacy": "Bez ciasteczek śledzących i reklam. W przeglądarce zapisuję tylko ustawienia techniczne (motyw, intro, ten komunikat). Dane z formularzy trafiają wyłącznie do mnie. {policy}",
    "consent.policy.label": "Polityka prywatności",
    "consent.policy.href": "/polityka-prywatnosci.html",
    "consent.cat.necessary.name": "Niezbędne",
    "consent.cat.necessary.desc": "Działanie strony, formularze, zapamiętanie motywu i Twojego wyboru. Zawsze włączone.",
    "consent.cat.analytics.name": "Analityka",
    "consent.cat.analytics.desc": "Jak używana jest strona (np. Google Analytics). Pomaga ją poprawiać.",
    "consent.cat.marketing.name": "Marketing",
    "consent.cat.marketing.desc": "Mierzenie skuteczności reklam (Google Ads, Meta) i dopasowanie reklam. Bez tego reklamy i tak mogą się pojawiać, tylko mniej trafne.",
    "consent.btn.all": "Akceptuję wszystko",
    "consent.btn.necessary": "Tylko niezbędne",
    "consent.btn.ok": "Rozumiem",
    "consent.btn.settings": "Ustawienia",
    "consent.btn.save": "Zapisz wybór",
    "consent.gpc": " Wykryłem sygnał „nie śledź” z Twojej przeglądarki, więc opcjonalne narzędzia są wyłączone.",

    /* intro, nawigacja, HUD (main.js) */
    "intro.line1": "> tsoftware.online",
    "intro.line2": "> łączę: sklep · erp · crm · e-mail · magazyn · księgowość",
    "intro.line3": "> automaty: 12 aktywnych",
    "intro.line4": "> ai: <em>online</em>",
    "intro.line5": "> nudna robota: <em>oddana automatom</em>",
    "intro.ok": "ok",
    "nav.open": "Otwórz menu",
    "nav.close": "Zamknij menu",
    "hud.tasks": "{n} zadań",
    "hud.hours": "{n} h",

    /* scena „Jak to działa” (stage.js) */
    "stage.status.waiting": "oczekiwanie",
    "stage.status.running": "w toku",
    "stage.status.done": "zakończono",
    "stage.hint.start": "przewiń w dół, żeby uruchomić automat",
    "stage.hint.step": "przewijaj dalej · krok {i} z 5",
    "stage.hint.done": "to wszystko · przewiń dalej",

    /* scena w hero (hero-scene.js) */
    "scene.meta.sklep": "zamówień dziś · {n}",
    "scene.meta.erp": "dokumentów · {n}",
    "scene.meta.crm": "klientów · {n}",
    "scene.meta.mail": "wysłanych · {n}",
    "scene.meta.magazyn": "stany ok · 100%",
    "scene.meta.ksiegowosc": "zaksięgowane · {n}",
    "scene.hub.sklep": "sklep",
    "scene.hub.erp": "erp",
    "scene.hub.crm": "crm",
    "scene.hub.mail": "mail",
    "scene.hub.magazyn": "magazyn",
    "scene.hub.ksiegowosc": "ksiegowosc",
    "scene.card.step": "krok {i}/{n}",
    "scene.ticker": "[{time}] {hub}: {text}",
    "scene.s1.title": "Nowe zamówienie #{n}",
    "scene.s1.r1.k": "klient", "scene.s1.r1.v": "Nowak Sp. z o.o.",
    "scene.s1.r2.k": "pozycje", "scene.s1.r2.v": "3 · 1 240 zł",
    "scene.s1.r3.k": "kanał", "scene.s1.r3.v": "sklep · webhook",
    "scene.s1.foot": "AI sprawdza NIP, adres, duplikaty",
    "scene.s1.text": "nowe zamówienie #{n}",
    "scene.s1.voice": "Nowe zamówienie #{n}. Sprawdzam NIP, adres i duplikaty… ok.",
    "scene.s2.title": "Dokument FS/{n}",
    "scene.s2.r1.k": "ERP", "scene.s2.r1.v": "Comarch Optima",
    "scene.s2.r2.k": "pozycje", "scene.s2.r2.v": "3 / 3 dopasowane",
    "scene.s2.r3.k": "czas", "scene.s2.r3.v": "1,2 s",
    "scene.s2.foot": "utworzono bez przepisywania",
    "scene.s2.text": "dokument FS/{n} gotowy",
    "scene.s2.voice": "Tworzę dokument FS/{n} w Comarch… gotowe w 1,2 s.",
    "scene.s3.title": "Rezerwacja towaru",
    "scene.s3.r1.k": "magazyn", "scene.s3.r1.v": "−3 szt. · A-12",
    "scene.s3.r2.k": "stan po", "scene.s3.r2.v": "27 szt.",
    "scene.s3.r3.k": "minimum", "scene.s3.r3.v": "nie naruszone",
    "scene.s3.foot": "stany sklep = ERP",
    "scene.s3.text": "stan: −3 szt., zgadza się",
    "scene.s3.voice": "Rezerwuję 3 sztuki w magazynie. Stany sklep i ERP się zgadzają.",
    "scene.s4.title": "Faktura FV/{n}",
    "scene.s4.r1.k": "kwota", "scene.s4.r1.v": "1 240,00 zł brutto",
    "scene.s4.r2.k": "KSeF", "scene.s4.r2.v": "wysłano",
    "scene.s4.r3.k": "termin", "scene.s4.r3.v": "14 dni",
    "scene.s4.foot": "zaksięgowana automatycznie",
    "scene.s4.text": "faktura zaksięgowana",
    "scene.s4.voice": "Wystawiam fakturę FV/{n} i wysyłam do KSeF… zaksięgowana.",
    "scene.s5.title": "Potwierdzenie do klienta",
    "scene.s5.r1.k": "do", "scene.s5.r1.v": "biuro@nowak.pl",
    "scene.s5.r2.k": "załącznik", "scene.s5.r2.v": "FV/{n}.pdf",
    "scene.s5.r3.k": "treść", "scene.s5.r3.v": "napisało AI",
    "scene.s5.foot": "wysłano · 0,8 s",
    "scene.s5.text": "potwierdzenie poszło do klienta",
    "scene.s5.voice": "Piszę potwierdzenie do klienta i dołączam fakturę… wysłane.",
    "scene.s6.title": "Karta klienta",
    "scene.s6.r1.k": "CRM", "scene.s6.r1.v": "HubSpot",
    "scene.s6.r2.k": "zamówień", "scene.s6.r2.v": "7 · LTV 9 880 zł",
    "scene.s6.r3.k": "następny krok", "scene.s6.r3.v": "follow-up za 30 dni",
    "scene.s6.foot": "handlowiec dostał info na Teams",
    "scene.s6.text": "klient zaktualizowany w CRM",
    "scene.s6.voice": "Aktualizuję CRM i daję znać handlowcowi. Całość: 4,1 s, bez człowieka.",

    /* konfiguracja z panelu, cennik, WhatsApp (features.js) */
    "plans.from": "od",
    "plans.perMonth": "/mies.",
    "wa.greeting": "Cześć, piszę ze strony tsoftware.online. ",

    /* kalkulator */
    "calc.label.min": "{n} min",
    "calc.label.times": "{n} ×",
    "calc.label.day": "{n} dzień",
    "calc.label.days": "{n} dni",
    "calc.left": "zostaje {h} h",
    "calc.message": "Policzyłem w kalkulatorze: proces zajmuje {min} min, {times} razy dziennie, {days} dni w miesiącu, stawka {rate}/h.\nWychodzi ok. {hours} h miesięcznie, czyli jakieś {money}/mies. ({year} rocznie).\n\nChcę to zautomatyzować. Proces wygląda tak: ",
    "form.topic.automation": "Automatyzacja procesów",

    /* konfigurator */
    "cfg.kind.start": "start",
    "cfg.kind.ai": "AI",
    "cfg.kind.system": "system",
    "cfg.kind.action": "akcja",
    "cfg.ai.node": "AI sprawdza",
    "cfg.empty": "wybierz start i chociaż jeden system albo akcję",
    "cfg.priceRange": "{lo}–{hi} zł",
    "cfg.time.1": "3–5 dni",
    "cfg.time.2": "1–2 tyg.",
    "cfg.time.3": "2–3 tyg.",
    "cfg.time.4": "3–5 tyg.",
    "cfg.none": "brak",
    "cfg.summary": "Start: {trigger}. Systemy: {systems}. Akcje: {actions}. Widełki z konfiguratora: {price}, czas {time}.",
    "cfg.message": "Złożyłem automat w konfiguratorze.\n{summary}\n\nU mnie wygląda to tak: ",

    /* mapa integracji */
    "map.hint": "Kliknij system, żeby zobaczyć, co z nim zwykle robimy.",
    "map.title": "{name} + TSoftware",
    "map.cta": "Złóż taki automat w konfiguratorze →",
    "map.shop.name": "Sklep",
    "map.shop.1": "Zamówienie ze sklepu od razu tworzy dokument w ERP i rezerwuje towar.",
    "map.shop.2": "Status wysyłki i numer paczki lecą do klienta mailem albo SMS-em.",
    "map.shop.3": "Opisy i zdjęcia produktów generowane z karty towaru, w kilku językach.",
    "map.erp.name": "ERP",
    "map.erp.1": "Zamówienia z maili, sklepu i B2B trafiają do ERP bez przepisywania.",
    "map.erp.2": "Stany, ceny i dokumenty synchronizują się ze sklepem i magazynem.",
    "map.erp.3": "Raport sprzedaży i należności codziennie rano na Teams albo w mailu.",
    "map.crm.name": "CRM",
    "map.crm.1": "Nowy lead z formularza lub maila ląduje w CRM z uzupełnionymi danymi firmy.",
    "map.crm.2": "AI pisze pierwszą odpowiedź i proponuje termin rozmowy.",
    "map.crm.3": "Przypomnienia o follow-upach i wygasających ofertach bez pilnowania.",
    "map.mail.name": "E-mail",
    "map.mail.1": "AI czyta maile, rozpoznaje zamówienia, faktury i reklamacje i kieruje je dalej.",
    "map.mail.2": "Odpowiedzi na powtarzalne pytania wychodzą same, trudne idą do człowieka.",
    "map.mail.3": "Załączniki lądują w dobrym folderze i w systemie, nie w skrzynce.",
    "map.wms.name": "Magazyn",
    "map.wms.1": "Stany zawsze zgodne między magazynem, ERP i sklepem.",
    "map.wms.2": "Etykiety kurierskie i listy przewozowe generują się po spakowaniu.",
    "map.wms.3": "Alert, gdy stan spada poniżej minimum, z gotowym zamówieniem do dostawcy.",
    "map.acc.name": "Księgowość",
    "map.acc.1": "Faktury kosztowe z maila i skanów odczytane przez OCR + AI, gotowe do księgowania.",
    "map.acc.2": "Faktury sprzedaży wystawiają się same z zamówień i wychodzą do klienta.",
    "map.acc.3": "Przypomnienia o płatnościach i raport należności co tydzień.",

    /* „Z bloga” na stronie głównej */
    "blog.category.default": "Wpis",
    "blog.category.ph": "wpis",
    "blog.readingTime": "{n} min czytania",
    "blog.copied": "Link skopiowany",

    /* lead magnet */
    "magnet.download": "Pobierz PDF",
    "magnet.done": "Gotowe.",
    "magnet.here": "Jest.",
    "magnet.thanks": "Dzięki! Link poszedł też na maila.",
    "magnet.btn": "Wyślij mi PDF",
    "magnet.failed": "Zapis nie przeszedł, ale PDF i tak jest Twój:",

    /* formularz kontaktowy */
    "btn.sending": "Wysyłam…",
    "btn.sent": "Wysłane ✓",
    "form.btn": "Wyślij",
    "form.thanks": "Dzięki!",
    "form.defaultTopic": "konsultacja",
    "form.sent": "Poszło. Odpiszę najpóźniej następnego dnia roboczego.",
    "form.error": "Coś nie zadziałało. Napisz bezpośrednio na {email}.",
    "form.mailto.subject": "Zapytanie ze strony: {topic}",
    "form.mailto.body": "Imię i nazwisko: {name}\nFirma: {company}\nE-mail: {email}\nTemat: {topic}\n\n{message}",
    "form.mailto.status": "Otwieram Twój program pocztowy z gotową wiadomością. Jeśli nic się nie wydarzyło, napisz na {email}."
  };

  /* ---------- English ---------- */
  dict.en = {
    "consent.title.cookies": "Cookies and privacy",
    "consent.title.privacy": "Privacy",
    "consent.desc.cookies": "Beyond what the site needs to run, I may use analytics and advertising tools, but only with your consent. You can change your choice any time in the footer. {policy}",
    "consent.desc.privacy": "No tracking cookies, no ads. Your browser only stores technical settings (theme, intro, this notice). Anything you send through the forms goes to me and nobody else. {policy}",
    "consent.policy.label": "Privacy policy",
    "consent.policy.href": "/en/privacy-policy.html",
    "consent.cat.necessary.name": "Necessary",
    "consent.cat.necessary.desc": "Keeps the site working: forms, your theme and the choice you make here. Always on.",
    "consent.cat.analytics.name": "Analytics",
    "consent.cat.analytics.desc": "How the site is used (e.g. Google Analytics). Helps me make it better.",
    "consent.cat.marketing.name": "Marketing",
    "consent.cat.marketing.desc": "Measuring how ads perform (Google Ads, Meta) and tailoring them to you. Without it you may still see ads, just less relevant ones.",
    "consent.btn.all": "Accept all",
    "consent.btn.necessary": "Necessary only",
    "consent.btn.ok": "Got it",
    "consent.btn.settings": "Settings",
    "consent.btn.save": "Save my choice",
    "consent.gpc": " Your browser sent a “do not track” signal, so the optional tools are switched off.",

    "intro.line1": "> tsoftware.online",
    "intro.line2": "> linking: shop · erp · crm · email · warehouse · accounting",
    "intro.line3": "> automations: 12 running",
    "intro.line4": "> ai: <em>online</em>",
    "intro.line5": "> boring work: <em>handed to the robots</em>",
    "intro.ok": "ok",
    "nav.open": "Open menu",
    "nav.close": "Close menu",
    "hud.tasks": "{n} tasks",
    "hud.hours": "{n} h",

    "stage.status.waiting": "waiting",
    "stage.status.running": "running",
    "stage.status.done": "done",
    "stage.hint.start": "scroll down to start the automation",
    "stage.hint.step": "keep scrolling · step {i} of 5",
    "stage.hint.done": "that's all · keep scrolling",

    "scene.meta.sklep": "orders today · {n}",
    "scene.meta.erp": "documents · {n}",
    "scene.meta.crm": "customers · {n}",
    "scene.meta.mail": "sent · {n}",
    "scene.meta.magazyn": "stock ok · 100%",
    "scene.meta.ksiegowosc": "posted · {n}",
    "scene.hub.sklep": "shop",
    "scene.hub.erp": "erp",
    "scene.hub.crm": "crm",
    "scene.hub.mail": "mail",
    "scene.hub.magazyn": "warehouse",
    "scene.hub.ksiegowosc": "accounting",
    "scene.card.step": "step {i}/{n}",
    "scene.ticker": "[{time}] {hub}: {text}",
    "scene.s1.title": "New order #{n}",
    "scene.s1.r1.k": "customer", "scene.s1.r1.v": "Nowak Sp. z o.o.",
    "scene.s1.r2.k": "items", "scene.s1.r2.v": "3 · PLN 1,240",
    "scene.s1.r3.k": "channel", "scene.s1.r3.v": "shop · webhook",
    "scene.s1.foot": "AI checks the tax ID, address and duplicates",
    "scene.s1.text": "new order #{n}",
    "scene.s1.voice": "New order #{n}. Checking the tax ID, address and duplicates… ok.",
    "scene.s2.title": "Document FS/{n}",
    "scene.s2.r1.k": "ERP", "scene.s2.r1.v": "Comarch Optima",
    "scene.s2.r2.k": "items", "scene.s2.r2.v": "3 / 3 matched",
    "scene.s2.r3.k": "time", "scene.s2.r3.v": "1.2 s",
    "scene.s2.foot": "created, nothing retyped",
    "scene.s2.text": "document FS/{n} ready",
    "scene.s2.voice": "Creating document FS/{n} in Comarch… done in 1.2 s.",
    "scene.s3.title": "Stock reserved",
    "scene.s3.r1.k": "warehouse", "scene.s3.r1.v": "−3 pcs · A-12",
    "scene.s3.r2.k": "stock after", "scene.s3.r2.v": "27 pcs",
    "scene.s3.r3.k": "minimum", "scene.s3.r3.v": "not breached",
    "scene.s3.foot": "stock levels shop = ERP",
    "scene.s3.text": "stock: −3 pcs, all matches",
    "scene.s3.voice": "Reserving 3 units in the warehouse. Shop and ERP stock levels match.",
    "scene.s4.title": "Invoice FV/{n}",
    "scene.s4.r1.k": "amount", "scene.s4.r1.v": "PLN 1,240.00 gross",
    "scene.s4.r2.k": "KSeF", "scene.s4.r2.v": "sent",
    "scene.s4.r3.k": "due in", "scene.s4.r3.v": "14 days",
    "scene.s4.foot": "posted automatically",
    "scene.s4.text": "invoice posted",
    "scene.s4.voice": "Issuing invoice FV/{n} and sending it to KSeF… posted.",
    "scene.s5.title": "Confirmation to the customer",
    "scene.s5.r1.k": "to", "scene.s5.r1.v": "biuro@nowak.pl",
    "scene.s5.r2.k": "attachment", "scene.s5.r2.v": "FV/{n}.pdf",
    "scene.s5.r3.k": "body", "scene.s5.r3.v": "written by AI",
    "scene.s5.foot": "sent · 0.8 s",
    "scene.s5.text": "confirmation sent to the customer",
    "scene.s5.voice": "Writing the customer a confirmation and attaching the invoice… sent.",
    "scene.s6.title": "Customer record",
    "scene.s6.r1.k": "CRM", "scene.s6.r1.v": "HubSpot",
    "scene.s6.r2.k": "orders", "scene.s6.r2.v": "7 · LTV PLN 9,880",
    "scene.s6.r3.k": "next step", "scene.s6.r3.v": "follow-up in 30 days",
    "scene.s6.foot": "the sales rep got a heads-up on Teams",
    "scene.s6.text": "customer updated in CRM",
    "scene.s6.voice": "Updating the CRM and giving the sales rep a heads-up. Total: 4.1 s, no human needed.",

    "plans.from": "from",
    "plans.perMonth": "/mo",
    "wa.greeting": "Hi, I'm writing from tsoftware.online. ",

    "calc.label.min": "{n} min",
    "calc.label.times": "{n} ×",
    "calc.label.day": "{n} day",
    "calc.label.days": "{n} days",
    "calc.left": "{h} h left",
    "calc.message": "I ran the numbers in your calculator: the process takes {min} min, {times} times a day, {days} days a month, at {rate}/h.\nThat comes to about {hours} h a month, roughly {money}/mo ({year} a year).\n\nI want to automate it. Here's what the process looks like: ",
    "form.topic.automation": "Process automation",

    "cfg.kind.start": "start",
    "cfg.kind.ai": "AI",
    "cfg.kind.system": "system",
    "cfg.kind.action": "action",
    "cfg.ai.node": "AI checks",
    "cfg.empty": "pick a trigger and at least one system or action",
    "cfg.priceRange": "PLN {lo}-{hi}",
    "cfg.time.1": "3-5 days",
    "cfg.time.2": "1-2 weeks",
    "cfg.time.3": "2-3 weeks",
    "cfg.time.4": "3-5 weeks",
    "cfg.none": "none",
    "cfg.summary": "Trigger: {trigger}. Systems: {systems}. Actions: {actions}. Configurator estimate: {price}, time {time}.",
    "cfg.message": "I put an automation together in your configurator.\n{summary}\n\nHere's how it works on my end: ",

    "map.hint": "Click a system to see what we usually do with it.",
    "map.title": "{name} + TSoftware",
    "map.cta": "Build one like this in the configurator →",
    "map.shop.name": "Shop",
    "map.shop.1": "An order in the shop creates the ERP document and reserves the stock straight away.",
    "map.shop.2": "Shipping status and the tracking number go to the customer by email or SMS.",
    "map.shop.3": "Product descriptions and photos generated from the product card, in several languages.",
    "map.erp.name": "ERP",
    "map.erp.1": "Orders from email, the shop and B2B land in the ERP with no retyping.",
    "map.erp.2": "Stock levels, prices and documents stay in sync with the shop and the warehouse.",
    "map.erp.3": "A sales and receivables report every morning on Teams or by email.",
    "map.crm.name": "CRM",
    "map.crm.1": "A new lead from a form or an email lands in the CRM with the company details filled in.",
    "map.crm.2": "AI writes the first reply and suggests a time for a call.",
    "map.crm.3": "Reminders about follow-ups and expiring quotes, with nobody having to keep watch.",
    "map.mail.name": "Email",
    "map.mail.1": "AI reads the inbox, spots orders, invoices and complaints and routes them on.",
    "map.mail.2": "Replies to repeat questions go out on their own, the tricky ones go to a human.",
    "map.mail.3": "Attachments land in the right folder and the right system, not in the inbox.",
    "map.wms.name": "Warehouse",
    "map.wms.1": "Stock levels always match across the warehouse, the ERP and the shop.",
    "map.wms.2": "Courier labels and shipping notes generate themselves once the parcel is packed.",
    "map.wms.3": "An alert when stock drops below the minimum, with a purchase order ready for the supplier.",
    "map.acc.name": "Accounting",
    "map.acc.1": "Purchase invoices from email and scans read by OCR + AI, ready to post.",
    "map.acc.2": "Sales invoices issue themselves from orders and go out to the customer.",
    "map.acc.3": "Payment reminders and a receivables report every week.",

    "blog.category.default": "Post",
    "blog.category.ph": "post",
    "blog.readingTime": "{n} min read",
    "blog.copied": "Link copied",

    "magnet.download": "Download the PDF",
    "magnet.done": "Done.",
    "magnet.here": "Here you go.",
    "magnet.thanks": "Thanks! The link is in your inbox too.",
    "magnet.btn": "Send me the PDF",
    "magnet.failed": "The sign-up didn't go through, but the PDF is still yours:",

    "btn.sending": "Sending…",
    "btn.sent": "Sent ✓",
    "form.btn": "Send",
    "form.thanks": "Thanks!",
    "form.defaultTopic": "consultation",
    "form.sent": "Sent. I'll reply by the next working day at the latest.",
    "form.error": "Something went wrong. Email me directly at {email}.",
    "form.mailto.subject": "Enquiry from the website: {topic}",
    "form.mailto.body": "Name: {name}\nCompany: {company}\nEmail: {email}\nTopic: {topic}\n\n{message}",
    "form.mailto.status": "Opening your email app with the message ready to go. If nothing happened, write to {email}."
  };

  function t(key, vars) {
    var s = (dict[lang] && dict[lang][key]) || (dict.pl && dict.pl[key]) || key;
    if (vars) for (var k in vars) s = s.split("{" + k + "}").join(String(vars[k]));
    return s;
  }

  /* ---------- Liczby, waluta, daty (Intl) ---------- */
  var nfCache = {};
  function nf(min, max) {
    var k = min + ":" + max;
    if (!nfCache[k]) nfCache[k] = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: min, maximumFractionDigits: max });
    return nfCache[k];
  }
  /* num(n, { min, max }) — liczba miejsc po przecinku (domyślnie 0: całkowita).
     Po polsku Intl nie grupuje liczb czterocyfrowych („1500”), a układ strony
     zawsze pisał „1 500”, więc część całkowitą grupujemy sami (cienka spacja). */
  function num(n, opts) {
    var o = opts || {}, min = o.min || 0, max = o.max != null ? o.max : min;
    var v = Number(n) || 0;
    try {
      var f = nf(min, max);
      if (!GROUP || typeof f.formatToParts !== "function") return f.format(v);
      var out = "", digits = "";
      var flush = function () { if (digits) { out += digits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP); digits = ""; } };
      f.formatToParts(v).forEach(function (p) {
        if (p.type === "integer") digits += p.value;
        else if (p.type !== "group") { flush(); out += p.value; }
      });
      flush();
      return out;
    } catch (e) {
      return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP || ",");
    }
  }
  /* waluta: zawsze PLN — „1 500 zł” / „PLN 1,500” */
  function money(n, opts) {
    var v = num(n, opts);
    return lang === "en" ? "PLN " + v : v + " zł";
  }
  /* data: „2 października 2026” / „2 October 2026” */
  function date(d, opts) {
    var dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt)) return "";
    try { return new Intl.DateTimeFormat(LOCALE, opts || { day: "numeric", month: "long", year: "numeric" }).format(dt); }
    catch (e) { return dt.toLocaleDateString(); }
  }

  window.TS_I18N = { lang: lang, locale: LOCALE, t: t, dict: dict, num: num, money: money, date: date };
  window.t = window.t || t;
})();
