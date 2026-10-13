/* ProtectAll Home — form bridge
 *
 * The site ships as a single minified React bundle with no source available, so
 * the forms cannot be edited directly. This script sits alongside it and relays
 * accepted submissions to /api/contact, which sends them via Resend.
 *
 * Two things about the bundle drive the design:
 *
 *   1. Fields carry `id`, not `name`. `new FormData(form)` therefore returns
 *      nothing — values must be read by id.
 *   2. The bundle's own onSubmit validates, then swaps the form out for a
 *      confirmation panel. We let that run first and treat "the form left the
 *      DOM" as "the bundle accepted this submission", so we never send anything
 *      its validation rejected and never duplicate the validation rules here.
 */
(function () {
  'use strict';

  var ENDPOINT = '/api/contact';
  var FIELD_IDS = ['name', 'email', 'company', 'location', 'planNumber', 'phone',
                   'position', 'retailCategory', 'storeCount', 'serviceType', 'message'];

  // Routes that own a form. Anything else submitting is ignored.
  var FORM_ROUTES = ['contact/general', 'contact/partners', 'contact/partner-support',
                     'contact/planholder-support', 'contact/vendor', 'careers'];

  var MAX_ATTACHMENT = 3 * 1024 * 1024;

  // Public address to offer as a fallback if the send fails, per form. Mirrors
  // the "Sends to: …" line the bundle already displays on each form.
  var FALLBACK_EMAIL = {
    'contact/general': 'infoph@myprotectall.com',
    'contact/partners': 'partnershipsph@myprotectall.com',
    'contact/partner-support': 'partnersupportph@myprotectall.com',
    'contact/planholder-support': 'planholdersupportph@myprotectall.com',
    'contact/vendor': 'vendorsph@myprotectall.com',
    'careers': 'infoph@myprotectall.com',
  };

  /* The export shipped with a HashRouter, but the build patches it to browser
   * history (build/patch-router.js), so the route lives in the pathname and
   * location.hash is empty. Read the pathname first; keep the hash as a
   * fallback, because legacy "#/contact/general" URLs are redirected rather
   * than abandoned and one can be on screen before the redirect lands.
   */
  function currentRoute() {
    // "/contact/partners" -> "contact/partners"
    var p = (window.location.pathname || '').replace(/^\/+/, '').replace(/\/$/, '');
    if (p) return p;
    // "#/contact/partners" -> "contact/partners"
    var h = (window.location.hash || '').replace(/^#\/?/, '');
    return h.split('?')[0].replace(/\/$/, '');
  }

  function collect(form) {
    var out = {};
    FIELD_IDS.forEach(function (id) {
      var el = form.querySelector('#' + id);
      if (el && typeof el.value === 'string' && el.value.trim()) {
        out[id] = el.value.trim();
      }
    });
    return out;
  }

  /* Attachment capture.
   *
   * The careers form's file input cannot be read at submit time: as soon as a
   * file is chosen, the bundle removes the <input type="file"> from the DOM and
   * renders a filename display in its place. The File object then exists only
   * inside React's state, which we cannot reach from out here. Verified: the
   * input is present with an empty FileList on a fresh page and absent from the
   * document entirely immediately after a file is selected.
   *
   * So we grab the File when it is selected and hold it ourselves.
   */
  var pendingFile = null;   // { route: string, file: File }

  document.addEventListener('change', function (event) {
    var el = event.target;
    if (!el || el.tagName !== 'INPUT' || el.getAttribute('type') !== 'file') return;
    pendingFile = el.files && el.files[0]
      ? { route: currentRoute(), file: el.files[0] }
      : null;
  }, true);   // capture, so we run before the bundle swaps the input out

  // Leaving the page the file was chosen on discards it. Under browser history
  // `hashchange` never fires, so listen for `popstate` too. An in-app pushState
  // navigation fires neither, which is why readFile independently re-checks the
  // route and treats a present #resume input as "no file selected".
  window.addEventListener('hashchange', function () { pendingFile = null; });
  window.addEventListener('popstate', function () { pendingFile = null; });

  function readFile(form, formKey) {
    // If the input is still in the form, the bundle never swapped it out, which
    // means no file is currently selected — including the case where the user
    // chose one and then removed it.
    if (form.querySelector('#resume')) return Promise.resolve(null);
    if (!pendingFile || pendingFile.route !== formKey) return Promise.resolve(null);

    var file = pendingFile.file;
    if (file.size > MAX_ATTACHMENT) {
      return Promise.reject(new Error('Your resume is larger than 3 MB. Please attach a smaller file.'));
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        // strip the "data:...;base64," prefix
        var s = String(reader.result);
        resolve({ filename: file.name, content: s.slice(s.indexOf(',') + 1) });
      };
      reader.onerror = function () { reject(new Error('Could not read the attached file.')); };
      reader.readAsDataURL(file);
    });
  }

  // The bundle's confirmation panel replaced the form. Append an honest failure
  // notice to it, because otherwise the user is told their message was sent when
  // it was not.
  function showFailure(message, toEmail) {
    var panel = document.querySelector('main') || document.body;
    var box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.setAttribute('data-form-bridge', 'error');
    box.style.cssText = 'max-width:44rem;margin:1.25rem auto 0;padding:1rem 1.25rem;' +
      'border:1px solid #b91c1c;background:#fef2f2;color:#7f1d1d;border-radius:.75rem;' +
      'font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif';
    var addr = toEmail || 'infoph@myprotectall.com';
    var reason = /[.!?]$/.test(message) ? message : message + '.';
    box.innerHTML = '<strong>Your message was not sent.</strong><br>' + reason +
      ' You can email us directly at <a href="mailto:' + addr +
      '" style="color:#7f1d1d;font-weight:700">' + addr + '</a>.';
    var existing = panel.querySelector('[data-form-bridge="error"]');
    if (existing) existing.remove();
    panel.insertBefore(box, panel.firstChild);
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function send(formKey, fields, attachment) {
    var body = { formKey: formKey, fields: fields };
    if (attachment) body.attachment = attachment;

    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      if (r.ok) return r.json();
      return r.json().catch(function () { return {}; }).then(function (d) {
        throw new Error(d.error || 'The server could not send your message.');
      });
    });
  }

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || form.tagName !== 'FORM') return;

    var formKey = currentRoute();
    if (FORM_ROUTES.indexOf(formKey) === -1) return;

    // Read values now — the bundle removes the form as soon as it accepts.
    var fields, filePromise;
    try {
      fields = collect(form);
      filePromise = readFile(form, formKey);
    } catch (err) {
      return;
    }

    // Let the bundle's own handler run and decide. If the form is still on the
    // page afterwards, its validation rejected the submission and there is
    // nothing to send.
    var settled = false;
    var checks = 0;
    var poll = setInterval(function () {
      checks++;
      var accepted = !document.contains(form);
      if (!accepted && checks < 20) return;   // keep waiting, up to ~1s
      clearInterval(poll);
      if (settled) return;
      settled = true;
      if (!accepted) return;                  // validation rejected it

      filePromise
        .then(function (attachment) { return send(formKey, fields, attachment); })
        .then(function () { pendingFile = null; })
        .catch(function (err) {
          console.error('[form-bridge]', err);
          showFailure(err.message || 'Something went wrong.', FALLBACK_EMAIL[formKey]);
        });
    }, 50);
  }, false);
})();
