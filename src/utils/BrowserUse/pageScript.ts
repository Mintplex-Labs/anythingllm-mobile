/**
 * The in-page half of the browser driver - a port of the desktop page script
 * (electron/main/utils/BrowserUse/pageScript.ts). The snapshot, blocker detection and element
 * helpers are unchanged so the agent sees pages exactly as it does on desktop.
 *
 * Android differences:
 * - Android WebView has no isolated worlds, so this runs in the page's own JS context
 *   (window.__bu). Pages could see or overwrite it; element references still live in memory.
 * - Agent WebViews never take focus (no keyboard pops up), so there is no trusted keyboard input:
 *   text goes in with `insertText` and keys with `pressKey`, both plain DOM.
 * - `locate` / `scrollTarget` also return the CSS viewport width so native taps can be scaled
 *   to view pixels.
 * - Requests the page sends are recorded by NETWORK_WATCH_SCRIPT (Android has no CDP network
 *   events) and read back with `netSince`.
 *
 * Kept as a plain string so no bundler transform can inject helpers into it.
 */
export const PAGE_SCRIPT = String.raw`
if (!window.__bu) window.__bu = (function () {
  var refs = [];
  var textRefs = [];
  var INTERACTIVE_TAGS = { A: 1, BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, SUMMARY: 1 };
  var INTERACTIVE_ROLES = { button: 1, link: 1, menuitem: 1, menuitemcheckbox: 1, menuitemradio: 1, tab: 1, checkbox: 1, radio: 1, switch: 1, option: 1, combobox: 1, textbox: 1, searchbox: 1, slider: 1, spinbutton: 1, treeitem: 1 };
  var TEXT_TAGS = { P: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, LI: 1, TD: 1, TH: 1, BLOCKQUOTE: 1, FIGCAPTION: 1, CAPTION: 1, PRE: 1, DD: 1, DT: 1 };
  var INTERACTIVE_SELECTOR = 'a[href],button,input:not([type=hidden]),select,textarea,[contenteditable="true"],[contenteditable=""],[role=button],[role=link],[role=textbox],[role=searchbox],[role=combobox],[role=menuitem],[role=tab],[role=checkbox],[role=radio],[role=switch]';
  var LEAF_TEXT_TAGS = { DIV: 1, SPAN: 1, SECTION: 1, ARTICLE: 1, STRONG: 1, B: 1, EM: 1, TIME: 1 };
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, SVG: 1, META: 1, LINK: 1, BR: 1, HR: 1, TEMPLATE: 1, IFRAME: 0 };

  function clean(s, max) {
    s = (s || '').replace(/\s+/g, ' ').trim();
    return max && s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  // innerText glues inline siblings together ("United$129"); fall back to joining text nodes.
  function textOf(el) {
    var text = el.innerText || '';
    if (/\s/.test(text.trim()) || el.children.length < 2) return text;
    var parts = [], walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { var v = walker.currentNode.nodeValue.trim(); if (v) parts.push(v); }
    return parts.join(' ');
  }

  // Offset of an element's frame relative to the top-level viewport (same-origin iframes only).
  function frameOffset(el) {
    var x = 0, y = 0, win = el.ownerDocument.defaultView;
    while (win && win.frameElement) {
      var r = win.frameElement.getBoundingClientRect();
      x += r.left + (win.frameElement.clientLeft || 0);
      y += r.top + (win.frameElement.clientTop || 0);
      win = win.parent;
    }
    return { x: x, y: y };
  }

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    var o = frameOffset(el);
    return { x: r.left + o.x, y: r.top + o.y, w: r.width, h: r.height };
  }

  function isShown(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    var s = el.ownerDocument.defaultView.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse') return false;
    if (hidesChildren(el, s, r)) return false;
    return true;
  }

  // Styled buttons often lay a transparent native control over their visible label - every Amazon
  // button ("Add to cart") is an opacity .01 input on top of a span. Those are real, clickable buttons.
  // Transparent text fields are not included: invisible fields are usually bot traps.
  function transparentControl(el, r) {
    var t = el.tagName;
    if (!(t === 'BUTTON' || t === 'A' || (t === 'INPUT' && /^(submit|button|image|reset|checkbox|radio|file)$/i.test(el.type)))) return false;
    var p = el.parentElement;
    if (!p) return false;
    var pr = p.getBoundingClientRect();
    var ix = Math.max(0, Math.min(r.right, pr.right) - Math.max(r.left, pr.left));
    var iy = Math.max(0, Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top));
    if (ix * iy < 0.5 * r.width * r.height) return false;
    return /[\p{L}\p{N}]/u.test(p.textContent || '') || !!p.querySelector('img,svg,i');
  }

  // Hidden in a way that hides everything inside too: transparent, or the screen-reader-only pattern
  // (a 1px box with overflow hidden / clip). Children of these are never visible, whatever their own size.
  function hidesChildren(el, s, r) {
    s = s || el.ownerDocument.defaultView.getComputedStyle(el);
    r = r || el.getBoundingClientRect();
    if (parseFloat(s.opacity) < 0.05 && !transparentControl(el, r)) return true;
    var tiny = r.width <= 2 || r.height <= 2;
    if (tiny && (s.overflow === 'hidden' || s.overflowX === 'hidden' || (s.clip && s.clip !== 'auto'))) return true;
    if (/inset\(\s*50%/.test(s.clipPath || '')) return true;
    return false;
  }

  // Parked outside the screen sideways - skip links and shortcut menus sit at left:-10000px until focused.
  function offscreenSideways(rect, vw) {
    return rect.x + rect.w <= 0 || rect.x >= vw;
  }

  // In-viewport elements whose center is covered by something else (modal, banner) are not actionable.
  function isCovered(el, rect, vw, vh) {
    var cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    if (cx < 0 || cy < 0 || cx > vw || cy > vh) return false;
    if (el.ownerDocument !== document) return false;
    var top = document.elementFromPoint(cx, cy);
    if (!top) return false;
    while (top && top.shadowRoot && top.shadowRoot.elementFromPoint) {
      var inner = top.shadowRoot.elementFromPoint(cx, cy);
      if (!inner || inner === top) break;
      top = inner;
    }
    if (top === el || el.contains(top) || top.contains(el)) return false;
    var root = top.getRootNode && top.getRootNode();
    if (root && root.host && (root.host === el || el.contains(root.host))) return false;
    var label = el.closest && el.closest('label');
    if (label && (label === top || label.contains(top))) return false;
    return true;
  }

  function isInteractive(el) {
    if (INTERACTIVE_TAGS[el.tagName]) {
      if (el.tagName === 'INPUT' && el.type === 'hidden') return false;
      if (el.tagName === 'A' && !el.hasAttribute('href') && !el.getAttribute('role')) return !!el.onclick;
      return true;
    }
    var role = el.getAttribute('role');
    if (role && INTERACTIVE_ROLES[role]) return true;
    if (el.isContentEditable && (!el.parentElement || !el.parentElement.isContentEditable)) return true;
    if (el.hasAttribute('onclick')) return true;
    var tab = el.getAttribute('tabindex');
    if (tab !== null && tab !== '-1') return true;
    var s = el.ownerDocument.defaultView.getComputedStyle(el);
    if (s.cursor === 'pointer') {
      // Only the outermost pointer element counts, otherwise every child span of a card is "clickable".
      var p = el.parentElement;
      if (p && p.ownerDocument.defaultView.getComputedStyle(p).cursor === 'pointer') return false;
      return true;
    }
    return false;
  }

  function labelOf(el) {
    var doc = el.ownerDocument;
    var label = el.getAttribute('aria-label');
    if (!label && el.getAttribute('aria-labelledby')) {
      label = el.getAttribute('aria-labelledby').split(/\s+/).map(function (id) {
        var n = doc.getElementById(id); return n ? n.innerText : '';
      }).join(' ');
    }
    if (!label && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
      if (el.id) {
        var l = doc.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]');
        if (l) label = l.innerText;
      }
      if (!label && el.closest('label')) label = el.closest('label').innerText;
      if (!label) label = el.getAttribute('placeholder');
      if (!label && (el.type === 'submit' || el.type === 'button')) label = el.value;
    }
    if (!label && el.tagName !== 'SELECT') label = textOf(el);
    if (!label) label = el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('name') || '';
    if (!label) {
      var img = el.querySelector && el.querySelector('img[alt],svg[aria-label],[title]');
      if (img) label = img.getAttribute('alt') || img.getAttribute('aria-label') || img.getAttribute('title');
    }
    return clean(label, 80);
  }

  function stateOf(el) {
    var parts = [];
    var tag = el.tagName;
    var role = el.getAttribute('role');
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      var t = tag === 'TEXTAREA' ? 'textarea' : (el.getAttribute('type') || 'text');
      if (tag === 'INPUT') parts.push(t);
      if (t === 'checkbox' || t === 'radio') { if (el.checked) parts.push('checked'); }
      else if (el.value) parts.push(t === 'password' ? 'value=•••' : 'value="' + clean(el.value, 40) + '"');
      var ph = el.getAttribute('placeholder');
      if (ph && !el.value && labelOf(el) !== clean(ph, 80)) parts.push('placeholder="' + clean(ph, 40) + '"');
      if (el.readOnly) parts.push('readonly');
    } else if (tag === 'SELECT') {
      var opt = el.options[el.selectedIndex];
      parts.push('selected="' + clean(opt ? opt.text : '', 40) + '"');
      var opts = [];
      for (var i = 0; i < el.options.length && i < 12; i++) opts.push(clean(el.options[i].text, 30));
      parts.push('options: ' + opts.join(' | ') + (el.options.length > 12 ? ' | …' : ''));
    } else if (role && !INTERACTIVE_TAGS[tag]) {
      parts.push(role);
    }
    var checked = el.getAttribute('aria-checked') || el.getAttribute('aria-selected') || el.getAttribute('aria-pressed');
    if (checked === 'true') parts.push('selected');
    if (el.getAttribute('aria-expanded') === 'true') parts.push('expanded');
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') parts.push('disabled');
    if (el === el.ownerDocument.activeElement) parts.push('focused');
    return parts.join(' ');
  }

  function shortHref(el) {
    if (el.tagName !== 'A' || !el.href || el.href.indexOf('javascript:') === 0) return '';
    var href = el.href;
    try {
      var u = new URL(href);
      if (u.origin === location.origin) href = u.pathname + u.search + u.hash;
    } catch (e) {}
    return clean(href, 90);
  }

  function hasDirectText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && /[\p{L}\p{N}$€£¥]/u.test(n.nodeValue)) return true;
    }
    return false;
  }

  // Sign-in walls, bot checks and verification codes. One field on a page proves nothing (a header
  // login box on an article), so several signals are scored. A confident wall makes the server pause
  // and ask the user; a weaker match only tells the model the form is there.
  // Returns null or { kind: 'login'|'captcha'|'verification', wall: boolean, score: number }.
  var LOGIN_PATH = /(^|[\/_-])(log-?in|sign-?in|sign_in|auth|authenticate|sso|oauth2?|authorize|session\/new|ap\/signin)([\/_.?-]|$)/i;
  var LOGIN_HOST = /^(accounts?|login|auth|signin|sso|id|idp|identity)\./i;
  var REDIRECT_PARAM = /[?&](return_?to|redirect(_?ur[il])?|next|continue|returnurl|goto|dest)=/i;
  var SIGN_IN_TEXT = /\b(sign ?in|log ?in|login|welcome back|enter your password|continue with (google|apple|microsoft|email))\b/i;
  var DISMISS_TEXT = /^(×|✕|x|close|not now|maybe later|skip|no thanks|continue as guest|continue without)/i;
  var CAPTCHA_FRAME = 'iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="challenges.cloudflare.com"],iframe[src*="arkoselabs"],iframe[src*="funcaptcha"],iframe[title*="captcha" i]';
  var CHALLENGE_PAGE = '#challenge-form,#cf-challenge-running,#challenge-stage,.cf-turnstile';
  // Bot-management vendors. Any of these on screen means a human has to step in:
  // HUMAN/PerimeterX ("Press & Hold"), DataDome, AWS WAF, GeeTest, Akamai, Imperva/Incapsula, Kasada.
  var BOT_VENDOR = '#px-captcha,[id^="px-captcha"],.px-captcha-container,iframe[src*="px-cdn.net"],iframe[src*="px-cloud.net"],iframe[src*="perimeterx"],iframe[src*="captcha-delivery.com"],iframe[src*="awswaf"],#aws-waf-captcha,awswaf-captcha,.geetest_holder,.geetest_panel,[class^="geetest_"],#sec-if-cpt-container,#sec-cpt-if,iframe[src*="_Incapsula_Resource"],iframe[src*="kasada"]';
  var CAPTCHA_TEXT = /verify (that )?you('| a)re (a )?human|are you a (robot|human)|i'?m not a robot|not a bot|checking (your browser|if the site connection)|press (and|&) hold|slide to (verify|continue|complete)|drag the slider|unusual (traffic|activity)|complete the security check|confirm you('| a)re (a )?human|before we continue|pardon our interruption|access (to this page )?(has been |is )?denied|request unsuccessful/i;
  var OTP_SELECTOR = 'input[autocomplete="one-time-code"],input[name*="otp" i],input[id*="otp" i],input[name*="2fa" i],input[name*="totp" i],input[name*="mfa" i]';
  var OTP_TEXT = /verification code|security code|enter (the|your) code|we (sent|texted|emailed)|two-factor|2-step|one-time (pass)?code|authenticator app/i;
  var USER_SELECTOR = 'input[autocomplete="username"],input[autocomplete="email"],input[type="email"],input[name*="user" i],input[name*="email" i],input[name="login" i],input[id*="login" i]';

  function firstShown(doc, selector) {
    var els = doc.querySelectorAll(selector);
    for (var i = 0; i < els.length; i++) if (isShown(els[i])) return els[i];
    return null;
  }

  // The block of UI around a field: its form or dialog, else a few levels up.
  function containerOf(el) {
    var box = el.closest('form,[role=dialog],[aria-modal="true"],dialog');
    if (box) return box;
    box = el;
    for (var i = 0; i < 4 && box.parentElement && box.parentElement !== el.ownerDocument.body; i++) box = box.parentElement;
    return box;
  }

  // How much readable content the page has besides this block (main content only, not header/nav).
  function contentOutside(box) {
    var root = document.querySelector('main,[role=main],article') || document.body;
    if (!root) return 0;
    var total = (root.innerText || '').replace(/\s+/g, ' ').length;
    var inside = box && root.contains(box) ? (box.innerText || '').replace(/\s+/g, ' ').length : 0;
    return Math.max(0, total - inside);
  }

  function coversViewport(box) {
    if (box.ownerDocument !== document) return false;
    var top = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return !!top && (box === top || box.contains(top));
  }

  function isDismissible(box) {
    var buttons = box.querySelectorAll('button,[role=button],a');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var label = clean(b.getAttribute('aria-label') || b.innerText || b.getAttribute('title') || '', 40);
      if (DISMISS_TEXT.test(label) || /close|dismiss/i.test(b.getAttribute('aria-label') || '')) return true;
    }
    return false;
  }

  function viewportShare(box) {
    var r = rectOf(box);
    var w = Math.max(0, Math.min(r.x + r.w, window.innerWidth) - Math.max(r.x, 0));
    var h = Math.max(0, Math.min(r.y + r.h, window.innerHeight) - Math.max(r.y, 0));
    return (w * h) / (window.innerWidth * window.innerHeight);
  }

  // Visible buttons/links that start a sign-in or sign-up.
  function countSignInActions() {
    var count = 0;
    var els = document.querySelectorAll('a,button,[role=button]');
    for (var i = 0; i < els.length && count < 5; i++) {
      var label = clean(els[i].innerText || els[i].getAttribute('aria-label') || '', 40);
      if (/^(sign ?in|log ?in|login|sign ?up|create (an )?account|join( now| today)?)\b/i.test(label) && isShown(els[i])) count++;
    }
    return count;
  }

  // Text of a fixed overlay / dialog sitting over the middle of the screen, if any.
  function overlayText() {
    var el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    for (var i = 0; i < 12 && el && el !== document.body && el !== document.documentElement; i++) {
      var s = window.getComputedStyle(el);
      if (s.position === 'fixed' || el.matches('[role=dialog],[role=alertdialog],[aria-modal="true"],dialog')) return (el.innerText || '').slice(0, 1000);
      el = el.parentElement;
    }
    return '';
  }

  function detectBlocker(hints) {
    hints = hints || {};
    var docs = [document];
    var frames = document.querySelectorAll('iframe');
    for (var f = 0; f < frames.length; f++) {
      try { if (frames[f].contentDocument && isShown(frames[f])) docs.push(frames[f].contentDocument); } catch (e) {}
    }
    var find = function (selector) {
      for (var d = 0; d < docs.length; d++) { var el = firstShown(docs[d], selector); if (el) return el; }
      return null;
    };
    var text = ((document.body && document.body.innerText) || '').slice(0, 5000);
    var urlSignal = LOGIN_PATH.test(location.pathname) || LOGIN_HOST.test(location.hostname) ||
      location.hostname === 'login.microsoftonline.com' || (REDIRECT_PARAM.test(location.search) && LOGIN_PATH.test(location.pathname + location.search));
    var headings = [document.title];
    document.querySelectorAll('h1,h2,legend').forEach(function (h) { if (headings.length < 6 && isShown(h)) headings.push(h.innerText); });
    var headingSignal = headings.some(function (h) { return SIGN_IN_TEXT.test(h || ''); });

    // Bot checks. The invisible reCAPTCHA badge and a captcha at the end of a contact form are not walls,
    // but a vendor challenge or challenge wording in an overlay covering the page always is.
    var captchaScore = 0;
    if (find(CHALLENGE_PAGE) || /^(just a moment|attention required|access denied)/i.test(document.title)) captchaScore += 3;
    if (find(BOT_VENDOR)) captchaScore += 3;
    if (CAPTCHA_TEXT.test(overlayText())) captchaScore += 3;
    else if (CAPTCHA_TEXT.test(text)) captchaScore += 2;
    var captchaFrame = find(CAPTCHA_FRAME);
    if (captchaFrame && !captchaFrame.closest('.grecaptcha-badge')) {
      captchaScore += 1;
      if (coversViewport(containerOf(captchaFrame))) captchaScore += 1;
    }
    if (captchaScore && contentOutside(null) < 500) captchaScore += 1;
    if (captchaScore >= 1) return { kind: 'captcha', wall: captchaScore >= 3, score: captchaScore };

    // Verification codes
    var otp = find(OTP_SELECTOR);
    if (otp) {
      var otpScore = 2 + (OTP_TEXT.test(text) ? 2 : 0) + (contentOutside(containerOf(otp)) < 600 ? 1 : 0);
      return { kind: 'verification', wall: otpScore >= 3, score: otpScore };
    }

    // Sign-in
    var field = find('input[type="password"]') || (urlSignal ? find(USER_SELECTOR) : null);
    // Asked for a page, got bounced to a landing page with only "Sign in / Create account" (x.com/home).
    var bounced = !field && (urlSignal || hints.redirected) && countSignInActions() > 0;
    if (!field && !bounced && !(urlSignal && headingSignal)) return null;
    var box = field ? containerOf(field) : document.body;
    var score = 0;
    if (urlSignal || hints.redirected) score += 2;
    if (headingSignal || SIGN_IN_TEXT.test((box.querySelector('h1,h2,h3,legend') || {}).innerText || '')) score += 1;
    var submit = box.querySelector('button[type=submit],input[type=submit],button');
    if (submit && /sign ?in|log ?in|continue|next/i.test(submit.innerText || submit.value || '')) score += 1;
    if (bounced) score += 1;
    if (field && viewportShare(box) >= 0.12) score += 1;
    var modal = !!field && box !== document.body && (box.matches('[role=dialog],[aria-modal="true"],dialog') || coversViewport(box));
    // A closable sign-in popup over a content page is skippable; on a sign-in URL it is the page.
    if (modal) score += isDismissible(box) && !urlSignal ? -1 : 3;
    var outside = contentOutside(field ? box : null);
    if (outside < 600) score += 2;
    else if (outside > 2000 && !modal) score -= 2;
    return { kind: 'login', wall: score >= 4, score: score };
  }

  function snapshot(opts) {
    opts = opts || {};
    var budget = opts.maxChars || 8000;
    var vw = window.innerWidth, vh = window.innerHeight;
    var rangeTop = -0.25 * vh, rangeBottom = (opts.viewports || 2.5) * vh;
    refs = []; textRefs = [];
    var items = []; // { kind, order, line }
    var below = 0, seen = new Set();

    function visit(root, inText) {
      var children = root.children;
      if (!children) return;
      for (var i = 0; i < children.length; i++) {
        var el = children[i];
        if (SKIP_TAGS[el.tagName]) continue;
        if (el.tagName === 'IFRAME') {
          try { if (el.contentDocument && el.contentDocument.body && isShown(el)) visit(el.contentDocument.body, false); } catch (e) {}
          continue;
        }
        if (!isShown(el)) {
          // display:contents and zero-size wrappers can still hold visible children.
          if (hidesChildren(el)) continue;
          if (el.children.length) visit(el, inText);
          if (el.shadowRoot) visit(el.shadowRoot, inText);
          continue;
        }
        var rect = rectOf(el);
        if (offscreenSideways(rect, vw)) continue;
        if (rect.y + rect.h < rangeTop) { if (el.children.length) visit(el, inText); continue; }
        if (rect.y > rangeBottom) { below += (isInteractive(el) ? 1 : 0) + el.querySelectorAll(INTERACTIVE_SELECTOR).length; continue; }

        if (isInteractive(el) && !seen.has(el)) {
          // A clickable wrapper around real controls (a post composer, a card with links) must not
          // swallow them - list the controls inside instead of one giant element.
          if (!INTERACTIVE_TAGS[el.tagName] && !el.isContentEditable && el.querySelector(INTERACTIVE_SELECTOR)) {
            visit(el, inText);
            if (el.shadowRoot) visit(el.shadowRoot, inText);
            continue;
          }
          var label = labelOf(el);
          var editable = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
          if (!label && !editable) { visit(el, inText); if (el.shadowRoot) visit(el.shadowRoot, inText); continue; }
          if (isCovered(el, rect, vw, vh)) continue;
          seen.add(el);
          var tag = el.isContentEditable && !INTERACTIVE_TAGS[el.tagName] ? 'editable' : el.tagName.toLowerCase();
          var state = stateOf(el);
          var href = shortHref(el);
          items.push({ y: rect.y, x: rect.x, el: el, body: ' ' + tag + (state ? ' (' + state + ')' : '') + ' "' + (label || '') + '"' + (href ? ' -> ' + href : '') });
          if (el.shadowRoot) visit(el.shadowRoot, true);
          continue;
        }

        if (!inText && (TEXT_TAGS[el.tagName] || (LEAF_TEXT_TAGS[el.tagName] && hasDirectText(el)))) {
          var text = clean(textOf(el), 300);
          var minLen = TEXT_TAGS[el.tagName] && !/^H\d$/.test(el.tagName) ? 8 : 2;
          if (text.length >= minLen && /[\p{L}\p{N}]/u.test(text)) {
            items.push({ y: rect.y, x: rect.x, el: el, text: true, body: ' ' + text });
            // Still walk inside so links/buttons in the block get ids, but don't re-capture nested text.
            visit(el, true);
            if (el.shadowRoot) visit(el.shadowRoot, true);
            continue;
          }
        }
        visit(el, inText);
        if (el.shadowRoot) visit(el.shadowRoot, inText);
      }
    }
    visit(document.body || document.documentElement, false);

    // Items are numbered and emitted in reading order (rows top to bottom, then left to right).
    // Text on the same row merges into one line so related facts stay together ("United · 7:05 AM · $238").
    // The char budget truncates from the bottom of the page.
    items.sort(function (a, b) { return (Math.round(a.y / 12) - Math.round(b.y / 12)) || (a.x - b.x); });
    var lines = [], used = 0, dropped = 0, prev = null;
    for (var k = 0; k < items.length; k++) {
      var item = items[k];
      if (item.text && prev && prev.text && Math.abs(item.y - prev.y) < 12 && prev.length + item.body.length < 300) {
        var merged = lines[lines.length - 1] + ' ·' + item.body;
        if (used + item.body.length + 3 > budget) { dropped++; continue; }
        used += merged.length - lines[lines.length - 1].length;
        lines[lines.length - 1] = merged;
        textRefs[textRefs.length - 1].push(item.el);
        prev.length += item.body.length;
        continue;
      }
      if (used + item.body.length + 8 > budget) { dropped++; prev = null; continue; }
      if (item.text) textRefs.push([item.el]);
      else refs.push(item.el);
      var line = '[' + (item.text ? 'T' + textRefs.length : refs.length) + ']' + item.body;
      lines.push(line);
      used += line.length + 1;
      prev = { text: !!item.text, y: item.y, length: item.body.length };
    }
    var se = document.scrollingElement || document.documentElement;
    var maxY = Math.max(0, se.scrollHeight - vh);
    return {
      url: location.href,
      title: document.title,
      scrollY: Math.round(se.scrollTop),
      maxScrollY: Math.round(maxY),
      lines: lines,
      truncated: dropped,
      belowFold: below,
      blocker: detectBlocker(opts.hints),
    };
  }

  // Scrolls the element into view and returns its center in viewport coordinates.
  function locate(id) {
    var el = refs[id - 1];
    if (!el || !el.isConnected) return { error: 'Element [' + id + '] no longer exists on the page. Use the latest page state.' };
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    var r = rectOf(el);
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight)
      return { error: '[' + id + '] is hidden off-screen, so it cannot be clicked. Use a visible element from the latest page state.' };
    return {
      x: Math.round(r.x + r.w / 2),
      y: Math.round(r.y + r.h / 2),
      tag: el.tagName.toLowerCase(),
      label: labelOf(el),
      editable: el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable,
      isSelect: el.tagName === 'SELECT',
      vw: window.innerWidth,
    };
  }

  function isEditable(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return !el.disabled && !el.readOnly;
    if (el.tagName === 'INPUT') return !el.disabled && !el.readOnly && !/^(button|submit|reset|checkbox|radio|file|image|hidden|range|color)$/i.test(el.type);
    return !!el.isContentEditable;
  }

  // The element that really has keyboard focus, through shadow roots and same-origin iframes.
  function focusedElement() {
    var el = document.activeElement;
    for (var i = 0; i < 10 && el; i++) {
      if (el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
      else if (el.tagName === 'IFRAME') {
        try { el = el.contentDocument.activeElement; } catch (e) { break; }
      } else break;
    }
    return el;
  }

  // Only focus the target when it is a text field. Clicking a "Start a post" button often moves
  // focus into the editor it opens - refocusing the button would throw the keystrokes away.
  function prepareType(id, clear) {
    var el = id ? refs[id - 1] : null;
    if (id && (!el || !el.isConnected)) return { error: 'Element [' + id + '] no longer exists on the page.' };
    if (el && isEditable(el) && focusedElement() !== el) el.focus();
    var target = focusedElement();
    if (!isEditable(target)) return { error: (el ? '[' + id + '] is ' + describe(el) + ', not a text field.' : 'No text field has focus.') + ' ' + textFieldHint() };
    if (clear) {
      if (typeof target.select === 'function' && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) target.select();
      else if (target.isContentEditable) target.ownerDocument.execCommand('selectAll');
    }
    return { ok: true };
  }

  function describe(el) {
    var tag = el.isContentEditable ? 'an editor' : el.tagName === 'A' ? 'a link' : el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' ? 'a button' : 'a ' + el.tagName.toLowerCase();
    var label = labelOf(el);
    return tag + (label ? ' "' + label + '"' : '');
  }

  // Small models pick the wrong id for text fields a lot - tell them which ids actually take text.
  function textFieldHint() {
    var fields = [];
    for (var i = 0; i < refs.length && fields.length < 8; i++) {
      if (refs[i] && refs[i].isConnected && isEditable(refs[i])) fields.push('[' + (i + 1) + '] "' + (labelOf(refs[i]) || refs[i].tagName.toLowerCase()) + '"');
    }
    return fields.length
      ? 'Text fields on this page: ' + fields.join(', ') + '.'
      : 'There are no text fields in the latest page state - click the button that opens the field or editor first.';
  }

  // Did the text actually land? Read the focused field back instead of trusting the keystrokes.
  function typedInto(id, text) {
    var target = focusedElement();
    if (!isEditable(target)) return { ok: false, reason: 'no text field has focus anymore' };
    var value = target.isContentEditable ? target.innerText : target.value;
    var want = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    var got = String(value || '').replace(/\s+/g, ' ');
    var other = id && refs[id - 1] && refs[id - 1] !== target && !refs[id - 1].contains(target);
    return {
      ok: !want || got.indexOf(want) !== -1,
      password: target.type === 'password',
      value: target.type === 'password' ? '•••' : clean(value, 80),
      field: other ? labelOf(target) || target.tagName.toLowerCase() : null,
      reason: 'the field does not contain the text',
    };
  }

  // What "scroll" should move: the element's scrollable ancestor, else the window, else the largest
  // scrolling panel (e.g. Zillow's results list, where the middle of the screen is a map).
  var scrollEl = null;
  function canScroll(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    var s = window.getComputedStyle(el);
    return /(auto|scroll|overlay)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 40;
  }
  function scrollTarget(id) {
    scrollEl = null;
    var el = id ? refs[id - 1] : null;
    for (var a = el; a && !scrollEl; a = a.parentElement) if (canScroll(a)) scrollEl = a;
    var se = document.scrollingElement || document.documentElement;
    if (!scrollEl && se.scrollHeight <= window.innerHeight + 40) {
      var best = 0, all = document.querySelectorAll('body *');
      for (var i = 0; i < all.length; i++) {
        if (!canScroll(all[i]) || !isShown(all[i])) continue;
        var r = all[i].getBoundingClientRect();
        var area = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
        if (area > best) { best = area; scrollEl = all[i]; }
      }
    }
    var box = scrollEl ? scrollEl.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + Math.min(box.height, window.innerHeight) / 2), panel: scrollEl ? clean(scrollEl.getAttribute('aria-label') || 'side', 40) : null, pos: scrollPos(), vw: window.innerWidth };
  }
  function scrollPos() {
    return Math.round(scrollEl ? scrollEl.scrollTop : (document.scrollingElement || document.documentElement).scrollTop);
  }
  function scrollByJs(delta) {
    if (scrollEl) scrollEl.scrollBy(0, delta);
    else window.scrollBy(0, delta);
    return scrollPos();
  }

  // Cheap signature of the page, to tell when an action changed nothing.
  function fingerprint() {
    var active = focusedElement();
    return location.href + '|' + domSize() + '|' + (active ? active.tagName + (active.id || '') : '');
  }

  function valueOf(id) {
    var el = refs[id - 1];
    if (!el) return '';
    if (el.type === 'password') return '•••';
    return clean(el.value !== undefined ? el.value : el.innerText, 80);
  }

  function selectOption(id, option) {
    var el = refs[id - 1];
    if (!el || el.tagName !== 'SELECT') return { error: 'Element [' + id + '] is not a dropdown (select). Click it instead.' };
    var want = String(option).toLowerCase().trim();
    var match = null;
    for (var i = 0; i < el.options.length; i++) {
      var o = el.options[i];
      if (o.text.toLowerCase().trim() === want || o.value.toLowerCase() === want) { match = o; break; }
    }
    if (!match) for (var j = 0; j < el.options.length; j++) {
      if (el.options[j].text.toLowerCase().indexOf(want) !== -1) { match = el.options[j]; break; }
    }
    if (!match) return { error: 'No option matching "' + option + '". Options: ' + Array.prototype.map.call(el.options, function (o) { return clean(o.text, 30); }).slice(0, 30).join(' | ') };
    el.value = match.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, selected: clean(match.text, 40) };
  }

  function read(ids, maxChars) {
    maxChars = maxChars || 6000;
    var out = [];
    if (ids && ids.length) {
      for (var i = 0; i < ids.length && i < 80; i++) {
        var group = (textRefs[ids[i] - 1] || []).filter(function (el) { return el.isConnected; });
        out.push('[T' + ids[i] + '] ' + (group.length ? clean(group.map(textOf).join(' · '), 2000) : '(not on page anymore)'));
      }
    } else {
      var main = document.querySelector('main, [role=main], article') || document.body;
      out.push((main.innerText || '').replace(/\n{3,}/g, '\n\n').trim());
    }
    var text = out.join('\n\n');
    return text.length > maxChars ? text.slice(0, maxChars) + '\n…(truncated)' : text;
  }

  function favicon() {
    var l = document.querySelector('link[rel~="icon"]');
    try { return l ? new URL(l.getAttribute('href'), location.href).href : location.origin + '/favicon.ico'; } catch (e) { return ''; }
  }

  function domSize() {
    return document.body ? document.body.innerHTML.length : 0;
  }

  // ---- Android additions (no trusted keyboard input on a WebView that cannot take focus) ----

  // Types into the focused field. execCommand('insertText') goes through the editor like real typing
  // (input events, undo, frameworks see it); when a page swallows it, the value is set through the
  // native setter so React-style controlled inputs still notice the change.
  function insertText(text) {
    var target = focusedElement();
    if (!isEditable(target)) return { error: 'No text field has focus. ' + textFieldHint() };
    var doc = target.ownerDocument;
    var view = doc.defaultView || window;
    text = String(text == null ? '' : text);
    var inserted = false;
    try { inserted = doc.execCommand('insertText', false, text); } catch (e) {}
    var value = target.isContentEditable ? target.innerText : target.value;
    var want = text.replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!inserted || (want && String(value || '').replace(/\s+/g, ' ').indexOf(want) === -1)) {
      if (target.isContentEditable) {
        target.textContent = text;
      } else {
        var proto = target.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
        var descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) descriptor.set.call(target, text);
        else target.value = text;
      }
      try { target.dispatchEvent(new view.InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })); }
      catch (e) { target.dispatchEvent(new view.Event('input', { bubbles: true })); }
      target.dispatchEvent(new view.Event('change', { bubbles: true }));
    }
    return { ok: true };
  }

  var KEYS = {
    enter: ['Enter', 13], 'return': ['Enter', 13], tab: ['Tab', 9], escape: ['Escape', 27], esc: ['Escape', 27],
    backspace: ['Backspace', 8], 'delete': ['Delete', 46], space: [' ', 32], arrowup: ['ArrowUp', 38], up: ['ArrowUp', 38],
    arrowdown: ['ArrowDown', 40], down: ['ArrowDown', 40], arrowleft: ['ArrowLeft', 37], left: ['ArrowLeft', 37],
    arrowright: ['ArrowRight', 39], right: ['ArrowRight', 39], pageup: ['PageUp', 33], pagedown: ['PageDown', 34],
    home: ['Home', 36], end: ['End', 35]
  };

  function tabbables() {
    var all = document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[tabindex],[contenteditable="true"],[contenteditable=""]');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.disabled || el.getAttribute('tabindex') === '-1' || !isShown(el)) continue;
      out.push(el);
    }
    return out;
  }

  function moveFocus(step) {
    var list = tabbables();
    if (!list.length) return;
    var index = list.indexOf(focusedElement());
    var next = list[(index + step + list.length) % list.length];
    if (next && next.focus) next.focus();
  }

  // Key presses are dispatched as DOM events, then the browser's default action for the key is
  // applied by hand (submitting a form on Enter, moving focus on Tab...) unless the page prevented it.
  function pressKey(name) {
    var k = KEYS[String(name || '').toLowerCase().replace(/\s+/g, '')];
    if (!k) return { error: 'Unknown key "' + name + '". Use Enter, Tab, Escape, Backspace, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, PageDown or PageUp.' };
    var key = k[0];
    var el = focusedElement() || document.body;
    var view = el.ownerDocument.defaultView || window;
    var init = { key: key, code: key === ' ' ? 'Space' : key, keyCode: k[1], which: k[1], bubbles: true, cancelable: true, composed: true };
    var proceed = el.dispatchEvent(new view.KeyboardEvent('keydown', init));
    if (key === 'Enter' || key === ' ') proceed = el.dispatchEvent(new view.KeyboardEvent('keypress', init)) && proceed;
    if (proceed) {
      var editable = isEditable(el);
      var doc = el.ownerDocument;
      if (key === 'Enter') {
        if (el.tagName === 'INPUT' && el.form) { if (el.form.requestSubmit) el.form.requestSubmit(); else el.form.submit(); }
        else if (el.tagName === 'TEXTAREA' || el.isContentEditable) { if (!doc.execCommand('insertLineBreak')) doc.execCommand('insertText', false, '\n'); }
        else if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link') el.click();
      } else if (key === ' ') {
        if (!editable && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || (el.tagName === 'INPUT' && /^(checkbox|radio|button|submit)$/i.test(el.type)))) el.click();
        else if (!editable) window.scrollBy(0, window.innerHeight * 0.85);
      } else if (key === 'Tab') moveFocus(1);
      else if (key === 'Backspace' && editable) doc.execCommand('delete');
      else if (key === 'Delete' && editable) doc.execCommand('forwardDelete');
      else if (key === 'PageDown' || key === 'PageUp') window.scrollBy(0, (key === 'PageDown' ? 1 : -1) * window.innerHeight * 0.85);
      else if ((key === 'Home' || key === 'End') && !editable) window.scrollTo(0, key === 'Home' ? 0 : (document.scrollingElement || document.documentElement).scrollHeight);
      else if ((key === 'ArrowDown' || key === 'ArrowUp') && !editable && el.tagName !== 'SELECT') window.scrollBy(0, (key === 'ArrowDown' ? 1 : -1) * 80);
    }
    el.dispatchEvent(new view.KeyboardEvent('keyup', init));
    return { ok: true, key: key };
  }

  // Requests the page sent (see NETWORK_WATCH_SCRIPT). The page clock marks where an action started.
  function netMark() {
    return Date.now();
  }

  function netSince(mark) {
    var log = window.__allmNet;
    if (!log) return null;
    var out = [];
    for (var i = 0; i < log.length; i++) if (log[i].at >= mark) out.push(log[i]);
    return out;
  }

  return { snapshot: snapshot, locate: locate, prepareType: prepareType, typedInto: typedInto, textFieldHint: textFieldHint, scrollTarget: scrollTarget, scrollPos: scrollPos, scrollByJs: scrollByJs, fingerprint: fingerprint, valueOf: valueOf, selectOption: selectOption, read: read, favicon: favicon, domSize: domSize, insertText: insertText, pressKey: pressKey, netMark: netMark, netSince: netSince };
})();
`;

/**
 * Records requests that change something (POST/PUT/PATCH/DELETE, websocket sends) in
 * `window.__allmNet` so the agent can tell whether a post or message really went out - the
 * stand-in for the desktop's CDP Network events. Only metadata plus the first KB of a string
 * body (for GraphQL operation names) is kept, and only the last 50 entries.
 * The wrapped functions report the originals' source so pages that check for tampering do not trip.
 */
export const NETWORK_WATCH_SCRIPT = String.raw`
(function () {
  if (window.__allmNet) return;
  var log = [];
  try { Object.defineProperty(window, '__allmNet', { value: log, enumerable: false }); } catch (e) { return; }
  var add = function (entry) { log.push(entry); if (log.length > 50) log.shift(); return entry; };
  var absolute = function (url) { try { return new URL(String(url), location.href).href; } catch (e) { return String(url); } };
  var snippet = function (body) {
    try {
      if (typeof body === 'string') return body.slice(0, 1024);
      if (body && typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return body.toString().slice(0, 1024);
    } catch (e) {}
    return '';
  };
  var disguise = function (wrapped, original) {
    try { wrapped.toString = function () { return Function.prototype.toString.call(original); }; } catch (e) {}
    return wrapped;
  };
  var writes = /^(POST|PUT|PATCH|DELETE)$/;

  var originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = disguise(function (input, init) {
      var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var promise = originalFetch.apply(this, arguments);
      if (writes.test(method)) {
        var entry = add({ at: Date.now(), method: method, url: absolute(typeof input === 'string' ? input : (input && input.url) || input), body: snippet(init && init.body), status: null, ok: null });
        promise.then(function (response) { entry.status = response.status; entry.ok = response.status < 400; }, function () { entry.ok = false; });
      }
      return promise;
    }, originalFetch);
  }

  var proto = window.XMLHttpRequest && XMLHttpRequest.prototype;
  if (proto) {
    var requests = new WeakMap();
    var open = proto.open, send = proto.send;
    proto.open = disguise(function (method, url) {
      requests.set(this, { method: String(method || 'GET').toUpperCase(), url: absolute(url) });
      return open.apply(this, arguments);
    }, open);
    proto.send = disguise(function (body) {
      var request = requests.get(this);
      if (request && writes.test(request.method)) {
        var entry = add({ at: Date.now(), method: request.method, url: request.url, body: snippet(body), status: null, ok: null });
        this.addEventListener('loadend', function () { entry.status = this.status || null; entry.ok = this.status ? this.status < 400 : false; });
      }
      return send.apply(this, arguments);
    }, send);
  }

  var socket = window.WebSocket && WebSocket.prototype;
  if (socket) {
    var socketSend = socket.send;
    socket.send = disguise(function () {
      add({ at: Date.now(), method: 'WS', url: absolute(this.url), body: '', status: null, ok: true });
      return socketSend.apply(this, arguments);
    }, socketSend);
  }
})();
`;

/**
 * Turns passkeys (WebAuthn) off before any page script runs, same as desktop: sites fall back to
 * passwords instead of handing the request to the system passkey sheet.
 */
export const PASSKEY_BLOCK_SCRIPT = String.raw`
(function () {
  try {
    var deny = function () { return Promise.reject(new DOMException('Passkeys are turned off in this browser.', 'NotAllowedError')); };
    if (navigator.credentials) {
      var get = navigator.credentials.get.bind(navigator.credentials);
      var create = navigator.credentials.create.bind(navigator.credentials);
      navigator.credentials.get = function (options) { return options && options.publicKey ? deny() : get(options); };
      navigator.credentials.create = function (options) { return options && options.publicKey ? deny() : create(options); };
    }
    if (window.PublicKeyCredential) {
      var no = function () { return Promise.resolve(false); };
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = no;
      PublicKeyCredential.isConditionalMediationAvailable = no;
      if (PublicKeyCredential.getClientCapabilities) PublicKeyCredential.getClientCapabilities = function () { return Promise.resolve({}); };
    }
  } catch (e) {}
})();
`;

/**
 * Injected at document start in every frame (androidx.webkit addDocumentStartJavaScript).
 * Dialogs (alert/confirm/prompt) are handled natively by the WebChromeClient, so unlike desktop
 * they are not stubbed here.
 */
export const INIT_SCRIPT = NETWORK_WATCH_SCRIPT + PASSKEY_BLOCK_SCRIPT;
