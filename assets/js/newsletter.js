// Zapis na newsletter: formularze .nl (strona główna, blog) → POST /api/newsletter/subscribe.
// Teksty pl/en lokalnie (skrypt działa też na stronach bloga renderowanych na serwerze).
(function () {
  'use strict';
  var lang = (document.documentElement.getAttribute('lang') || 'pl').slice(0, 2) === 'en' ? 'en' : 'pl';
  var S = {
    pl: {
      email: 'Wpisz poprawny adres e-mail.',
      consent: 'Zaznacz zgodę, bez niej nie mogę wysyłać.',
      sending: 'Zapisuję…',
      pending: 'Prawie gotowe. Sprawdź skrzynkę (także spam) i kliknij link potwierdzający.',
      active: 'Ten adres już jest na liście. Dzięki!',
      unconfirmed: 'Zapisane. Dzięki!',
      error: 'Nie udało się zapisać. Spróbuj za chwilę albo napisz na kontakt@tsoftware.online.',
      tooMany: 'Za dużo prób naraz. Odczekaj minutę.',
      offline: 'Brak połączenia z serwerem. Spróbuj ponownie.',
    },
    en: {
      email: 'Enter a valid email address.',
      consent: 'Tick the consent box, I cannot send without it.',
      sending: 'Signing you up…',
      pending: 'Almost done. Check your inbox (and spam) and click the confirmation link.',
      active: 'This address is already on the list. Thanks!',
      unconfirmed: 'Saved. Thanks!',
      error: 'Could not sign you up. Try again in a moment or write to kontakt@tsoftware.online.',
      tooMany: 'Too many attempts at once. Wait a minute.',
      offline: 'No connection to the server. Please try again.',
    },
  }[lang];
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function setStatus(form, text, kind) {
    var el = form.querySelector('.nl__status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('is-ok', 'is-err');
    if (kind) el.classList.add(kind);
  }

  function track(name, params) {
    try {
      if (typeof window.tsTrack === 'function') window.tsTrack(name, params || {});
    } catch (e) {
      /* brak analityki */
    }
  }

  function bind(form) {
    if (form.dataset.nlBound) return;
    form.dataset.nlBound = '1';
    var busy = false;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (busy) return;
      var emailEl = form.querySelector('input[name="email"]');
      var consentEl = form.querySelector('input[name="consent"]');
      var hpEl = form.querySelector('input[name="website"]');
      var email = emailEl ? emailEl.value.trim() : '';
      if (!EMAIL_RE.test(email)) {
        setStatus(form, S.email, 'is-err');
        if (emailEl) emailEl.focus();
        return;
      }
      if (consentEl && !consentEl.checked) {
        setStatus(form, S.consent, 'is-err');
        consentEl.focus();
        return;
      }
      busy = true;
      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      setStatus(form, S.sending, '');
      var payload = {
        email: email,
        consent: true,
        lang: form.dataset.lang || lang,
        source: form.dataset.source || (lang === 'en' ? 'en' : 'other'),
        website: hpEl ? hpEl.value : '',
      };
      fetch(form.getAttribute('action') || '/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (data) {
              return { status: res.status, data: data };
            });
        })
        .then(function (r) {
          if (r.status === 429) return setStatus(form, S.tooMany, 'is-err');
          if (r.status >= 400 || !r.data.ok) return setStatus(form, (r.data && r.data.error) || S.error, 'is-err');
          var st = r.data.status;
          setStatus(form, st === 'active' ? (r.data.existing ? S.active : S.unconfirmed) : S.pending, 'is-ok');
          if (!r.data.existing) track('newsletter_signup', { source: payload.source, lang: payload.lang });
          if (emailEl) emailEl.value = '';
          if (consentEl) consentEl.checked = false;
        })
        .catch(function () {
          setStatus(form, S.offline, 'is-err');
        })
        .then(function () {
          busy = false;
          if (btn) btn.disabled = false;
        });
    });
  }

  function init() {
    var forms = document.querySelectorAll('form.nl');
    for (var i = 0; i < forms.length; i++) bind(forms[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('reveal:refresh', init);
})();
