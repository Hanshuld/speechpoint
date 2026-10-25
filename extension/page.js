// SpeechPoint's helper inside the web page.
//
// The panel injects this file into the page you're on, then calls the functions
// at the bottom (window.__speechpoint.click(...), .type(...) and so on). It runs
// in Chrome's private extension world, so the website can't see or change it.

if (!window.__speechpoint || window.__speechpoint.version !== 4) {
  (() => {
    // ================================================================ remembering elements
    // Every button/link we report gets a number; the panel sends the number back to click it.

    let nextId = 1;
    const idOf = new WeakMap();      // element -> number
    let elementById = new Map();     // number -> element

    function idFor(el) {
      if (!idOf.has(el)) idOf.set(el, nextId++);
      return idOf.get(el);
    }

    // ================================================================ small helpers

    const tidy = (s) => (s || "").replace(/\s+/g, " ").trim();

    // the parent of a node, stepping out of "shadow" components too
    const parentOf = (node) => node.parentNode || node.host || null;

    function isInside(outer, node) {
      for (; node; node = parentOf(node)) if (node === outer) return true;
      return false;
    }

    function isShown(el) {
      const style = getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none" && parseFloat(style.opacity || "1") > 0.05;
    }

    function isOnScreen(r) {
      return r.width >= 4 && r.height >= 4 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    }

    function isTextBox(el) {
      if (!el || el.nodeType !== 1) return false;
      if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
      const notText = ["button", "submit", "reset", "checkbox", "radio", "image", "file", "color", "range", "hidden"];
      return el.tagName === "INPUT" && !notText.includes(el.type);
    }

    // the text box that has the keyboard focus (looking inside components)
    function focusedElement() {
      let el = document.activeElement;
      while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
      return el;
    }

    // set an input's value so websites (including React ones) notice the change
    function setValue(el, value, inputType = "insertText", data = undefined) {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType, data }));
    }

    // ================================================================ finding clickable things

    const CLICKABLE = [
      "a[href]", "button", "input:not([type=hidden])", "textarea", "select", "summary",
      "[role=button]", "[role=link]", "[role=tab]", "[role=menuitem]", "[role=menuitemcheckbox]", "[role=menuitemradio]",
      "[role=option]", "[role=checkbox]", "[role=radio]", "[role=switch]", "[role=textbox]", "[role=combobox]",
      "[role=searchbox]", "[role=treeitem]", "[role=row]",
      '[contenteditable=""]', '[contenteditable="true"]', "[onclick]", '[tabindex="0"]',
    ].join(",");

    // every clickable element, including ones inside components ("shadow roots")
    function* allClickable(root = document) {
      for (const el of root.querySelectorAll(CLICKABLE)) yield el;
      for (const host of root.querySelectorAll("*")) if (host.shadowRoot) yield* allClickable(host.shadowRoot);
    }

    // the element really under a point, looking inside components
    function elementAt(x, y) {
      let el = document.elementFromPoint(x, y);
      while (el && el.shadowRoot) {
        const inner = el.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === el) break;
        el = inner;
      }
      return el;
    }

    // would a click at (x, y) reach this element, or is something covering it?
    function clickReaches(el, x, y) {
      const hit = elementAt(x, y);
      if (!hit) return false;
      if (isInside(el, hit) || isInside(hit, el)) return true;
      return hit.tagName === "LABEL" && hit.control === el;
    }

    // a visible spot on the element that a click would reach (its middle, else near an edge), or null
    function clickPoint(el, r) {
      const left = Math.max(r.left, 1), right = Math.min(r.right, innerWidth - 1);
      const top = Math.max(r.top, 1), bottom = Math.min(r.bottom, innerHeight - 1);
      if (right - left < 2 || bottom - top < 2) return null;
      const midX = (left + right) / 2, midY = (top + bottom) / 2;
      const spots = [
        [midX, midY],
        [left + Math.min(12, (right - left) / 3), midY],
        [midX, top + Math.min(8, (bottom - top) / 3)],
        [right - Math.min(12, (right - left) / 3), midY],
        [midX, bottom - Math.min(8, (bottom - top) / 3)],
      ];
      return spots.find(([x, y]) => clickReaches(el, x, y)) || null;
    }

    // ================================================================ describing an element

    // the name a person would use for it: its label, its text, its placeholder…
    function nameOf(el) {
      let name = tidy(el.getAttribute("aria-label"));
      if (!name && el.getAttribute("aria-labelledby")) {
        const root = el.getRootNode();
        name = tidy(el.getAttribute("aria-labelledby").split(/\s+/)
          .map((id) => ((root.getElementById && root.getElementById(id)) || document.getElementById(id) || {}).textContent || "")
          .join(" "));
      }
      if (!name && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
        if (["button", "submit", "reset"].includes(el.type)) name = tidy(el.value);
        if (!name && el.labels && el.labels[0]) name = tidy(el.labels[0].innerText);
        if (!name) name = tidy(el.placeholder || el.getAttribute("title") || el.name);
      }
      if (!name) name = tidy(el.innerText).slice(0, 80);
      if (!name) name = tidy(el.getAttribute("title"));
      if (!name) name = tidy(el.querySelector("img[alt]")?.getAttribute("alt"));
      if (!name) name = tidy(el.querySelector("svg title")?.textContent);
      return name.slice(0, 80);
    }

    // link, button, field (text box), tab, menuitem, row (an email in a list) or other
    function kindOf(el) {
      const role = el.getAttribute("role") || "";
      const tag = el.tagName;
      if (role === "tab") return "tab";
      if (role === "row") return "row";
      if (["menuitem", "menuitemcheckbox", "menuitemradio", "option", "treeitem"].includes(role)) return "menuitem";
      if (tag === "A" || role === "link") return "link";
      if (tag === "INPUT") {
        const buttonTypes = ["button", "submit", "reset", "checkbox", "radio", "image", "file", "color", "range"];
        return buttonTypes.includes(el.type) ? "button" : "field";
      }
      if (tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return "field";
      if (["textbox", "combobox", "searchbox"].includes(role)) return "field";
      if (tag === "BUTTON" || tag === "SUMMARY" || ["button", "checkbox", "radio", "switch"].includes(role)) return "button";
      return "other";
    }

    // true/false for checkboxes and switches, undefined for everything else
    function checkedState(el) {
      if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) return el.checked;
      const state = el.getAttribute("aria-checked") || el.getAttribute("aria-pressed") || el.getAttribute("aria-selected");
      if (state === "true") return true;
      if (state === "false") return false;
      return undefined;
    }

    // is it in the site's header, menu or sidebar? ("the first video" skips those)
    const HEADER_TAGS = ["HEADER", "NAV", "ASIDE", "FOOTER", "YTD-MASTHEAD", "YTD-GUIDE-RENDERER",
                         "YTD-MINI-GUIDE-RENDERER", "TP-YT-APP-DRAWER"];
    const HEADER_ROLES = ["banner", "navigation", "complementary", "contentinfo"];

    function isInHeader(el) {
      for (let n = el; n; n = parentOf(n)) {
        if (n.nodeType !== 1) continue;
        if (HEADER_TAGS.includes(n.tagName) || HEADER_ROLES.includes(n.getAttribute("role"))) return true;
        if (/^(masthead|guide|sidebar|topbar|navbar|top-nav|header)$/i.test(n.id || "")) return true;
      }
      return false;
    }

    // is it an ad or a sponsored result?
    function isAd(el) {
      for (let n = el; n; n = parentOf(n)) {
        if (n.nodeType !== 1) continue;
        if (/(^|-)ADS?(-|$)|PROMOTED|SPONSOR/.test(n.tagName)) return true;
        if (n.hasAttribute("data-text-ad") || n.hasAttribute("data-ad-slot")) return true;
        if (/^(ad|ads|tads|bottomads|google_ads|sponsored)([-_]|$)/i.test(n.id || "")) return true;
        if (/\b(sponsored|promoted)\b/i.test(n.getAttribute("aria-label") || "")) return true;
      }
      return false;
    }

    function describe(el, r, name, kind) {
      const item = { lp: idFor(el), kind, title: name, header: isInHeader(el), ad: isAd(el),
                     href: el.tagName === "A" ? el.href : "", x: r.left, y: r.top, w: r.width, h: r.height };
      const checked = kind === "text" ? undefined : checkedState(el);
      if (checked !== undefined) item.checked = checked;   // tick boxes and switches
      return item;
    }

    // ================================================================ collect: everything you could click

    // plain words that have no button of their own (menus made of divs, labels, headings)
    function plainTextElements(alreadyFound, limit) {
      const out = [];
      const seen = new Set();
      const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node && out.length < limit; node = walker.nextNode()) {
        const text = tidy(node.textContent);
        if (text.length < 2 || text.length > 60) continue;
        const el = node.parentElement;
        if (!el || seen.has(el) || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION)$/.test(el.tagName)) continue;
        seen.add(el);
        let insideAButton = false;
        for (let p = el; p; p = parentOf(p)) if (alreadyFound.has(p)) { insideAButton = true; break; }
        if (insideAButton) continue;
        const r = el.getBoundingClientRect();
        if (!isOnScreen(r) || !isShown(el) || !clickPoint(el, r)) continue;
        out.push({ el, r, text });
      }
      return out;
    }

    // everything visible you could click, in reading order. withText: also plain words.
    function collect(withText) {
      const found = [];
      const foundSet = new Set();
      for (const el of allClickable()) {
        if (foundSet.has(el) || el.disabled || el.getAttribute("aria-hidden") === "true") continue;
        const r = el.getBoundingClientRect();
        if (!isOnScreen(r) || !isShown(el) || !clickPoint(el, r)) continue;
        foundSet.add(el);
        found.push({ el, r });
        if (found.length > 600) break;
      }

      const names = new Map(found.map(({ el }) => [el, nameOf(el)]));
      const items = [];
      const fresh = new Map();
      for (const { el, r } of found) {
        // skip a wrapper's duplicate (a button inside a link with the same name)
        let parent = parentOf(el);
        while (parent && !foundSet.has(parent)) parent = parentOf(parent);
        const name = names.get(el);
        if (parent && (!name || names.get(parent) === name)) continue;
        items.push(describe(el, r, name, kindOf(el)));
        fresh.set(idFor(el), el);
      }
      if (withText) {
        for (const { el, r, text } of plainTextElements(foundSet, 250)) {
          items.push(describe(el, r, text, "text"));
          fresh.set(idFor(el), el);
        }
      }
      // keep recent elements (so a number shown a moment ago can still be clicked)
      elementById = new Map([...elementById].filter(([, el]) => el.isConnected).slice(-1500).concat([...fresh]));

      items.sort((a, b) => (Math.round(a.y / 24) - Math.round(b.y / 24)) || (a.x - b.x));
      return { items: items.slice(0, withText ? 650 : 400) };
    }

    // ================================================================ clicking and hovering

    function scrollIntoViewIfNeeded(el) {
      let r = el.getBoundingClientRect();
      if (!clickPoint(el, r)) {
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
        r = el.getBoundingClientRect();
      }
      return r;
    }

    function click(id, count = 1) {
      const el = elementById.get(id);
      if (!el || !el.isConnected) return { ok: false };
      const r = scrollIntoViewIfNeeded(el);
      flash(el);
      // a link that opens a new tab: the panel opens it (pop-up blockers stop clicks made by code)
      if (el.tagName === "A" && el.target === "_blank" && /^https?:/.test(el.href)) return { ok: true, open: el.href };

      const [x, y] = clickPoint(el, r) || [r.left + r.width / 2, r.top + r.height / 2];
      const target = elementAt(x, y) || el;
      const opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window, button: 0 };
      if (el.focus) el.focus({ preventScroll: true });
      for (let i = 1; i <= count; i++) {
        target.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerType: "mouse", isPrimary: true }));
        target.dispatchEvent(new MouseEvent("mousedown", { ...opts, detail: i }));
        target.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerType: "mouse", isPrimary: true }));
        target.dispatchEvent(new MouseEvent("mouseup", { ...opts, detail: i }));
        if (target !== el && isInside(el, target)) target.click(); else el.click();
      }
      if (count === 2) target.dispatchEvent(new MouseEvent("dblclick", { ...opts, detail: 2 }));
      return { ok: true, field: isTextBox(el) };
    }

    // for menus that open when the mouse moves over them
    function hover(id) {
      const el = elementById.get(id);
      if (!el || !el.isConnected) return { ok: false };
      const r = el.getBoundingClientRect();
      const opts = { bubbles: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, view: window };
      for (const type of ["pointerover", "pointerenter", "mouseover", "mouseenter", "pointermove", "mousemove"]) {
        const event = type.startsWith("pointer") ? new PointerEvent(type, { ...opts, pointerType: "mouse" }) : new MouseEvent(type, opts);
        el.dispatchEvent(event);
      }
      flash(el);
      return { ok: true };
    }

    // ================================================================ typing

    function firstVisibleTextBox() {
      for (const el of allClickable()) {
        if (!isTextBox(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 20 && r.height > 8 && r.bottom > 0 && r.top < innerHeight && isShown(el)) return el;
      }
      return null;
    }

    // type into a text box (the one numbered `id`, else the focused one, else the first on the page)
    function type(text, id) {
      let el = id ? elementById.get(id) : focusedElement();
      if (!isTextBox(el)) el = firstVisibleTextBox();
      if (!el) return { ok: false };
      el.focus();
      flash(el);

      if (el.isContentEditable) {
        text.split("\n").forEach((line, i) => {
          if (i > 0) document.execCommand("insertLineBreak");
          if (line) document.execCommand("insertText", false, line);
        });
        return { ok: true, name: nameOf(el) };
      }

      if (el.tagName === "INPUT") text = text.replace(/\n+/g, " ");   // one-line boxes have no new lines
      // the browser's own "insert text": real input events, and Undo works
      const before = el.value;
      if (document.execCommand("insertText", false, text) && el.value !== before) return { ok: true, name: nameOf(el) };

      // otherwise put it in directly, at the cursor
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      setValue(el, el.value.slice(0, start) + text + el.value.slice(end), "insertText", text);
      el.dispatchEvent(new Event("change", { bubbles: true }));
      try { el.setSelectionRange(start + text.length, start + text.length); } catch (e) { /* some inputs have no cursor */ }
      return { ok: true, name: nameOf(el) };
    }

    function clearField() {
      const el = focusedElement();
      if (!isTextBox(el)) return { ok: false };
      if (el.isContentEditable) {
        document.execCommand("selectAll");
        document.execCommand("delete");
      } else {
        setValue(el, "", "deleteContentBackward");
      }
      return { ok: true };
    }

    // delete the last n characters before the cursor ("scratch that" in dictation)
    function backspace(n) {
      const el = focusedElement();
      if (!isTextBox(el)) return { ok: false };
      if (el.isContentEditable) {
        for (let i = 0; i < n; i++) document.execCommand("delete");
        return { ok: true };
      }
      const end = el.selectionEnd ?? el.value.length;
      const start = Math.max(0, end - n);
      setValue(el, el.value.slice(0, start) + el.value.slice(end), "deleteContentBackward");
      try { el.setSelectionRange(start, start); } catch (e) { /* some inputs have no cursor */ }
      return { ok: true };
    }

    function undo(redo) {
      if (!isTextBox(focusedElement())) return { ok: false };
      document.execCommand(redo ? "redo" : "undo");
      return { ok: true };
    }

    function selectAll() {
      const el = focusedElement();
      if (isTextBox(el)) {
        if (el.isContentEditable) document.execCommand("selectAll"); else el.select();
      } else {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector("article, main, [role=main]") || document.body);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      }
      return { ok: true, field: isTextBox(el) };
    }

    // what's focused, and the text just before the cursor (dictation uses it to add capitals and spaces)
    function focusInfo() {
      const el = focusedElement();
      if (!isTextBox(el)) return { field: false, name: "", before: "" };
      const cursor = el.selectionStart ?? (el.value || "").length;
      const before = el.isContentEditable ? (el.innerText || "").slice(-200) : el.value.slice(Math.max(0, cursor - 200), cursor);
      return { field: true, name: nameOf(el), before };
    }

    // drop-down lists: "choose Canada"
    function chooseOption(said) {
      const want = tidy(said).toLowerCase();
      let best = null, bestScore = 0;
      for (const select of allClickable()) {
        if (select.tagName !== "SELECT" || select.disabled || !isShown(select)) continue;
        for (const option of select.options) {
          const text = tidy(option.textContent).toLowerCase();
          const score = text === want ? 1 : text.startsWith(want) ? 0.9 : text.includes(want) ? 0.8 : 0;
          if (score > bestScore) { best = { select, option }; bestScore = score; }
        }
      }
      if (!best) return { ok: false };
      const { select, option } = best;
      select.scrollIntoView({ block: "center", behavior: "instant" });
      select.value = option.value;
      option.selected = true;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      flash(select);
      return { ok: true, option: tidy(option.textContent), list: nameOf(select) };
    }

    // ================================================================ keys

    const KEYS = { enter: ["Enter", 13], tab: ["Tab", 9], escape: ["Escape", 27], space: [" ", 32],
                   backspace: ["Backspace", 8], delete: ["Delete", 46], up: ["ArrowUp", 38], down: ["ArrowDown", 40],
                   left: ["ArrowLeft", 37], right: ["ArrowRight", 39] };

    function key(name) {
      if (!KEYS[name]) return { ok: false };
      const [keyName, keyCode] = KEYS[name];
      const el = focusedElement() || document.body;
      const opts = { key: keyName, code: keyName === " " ? "Space" : keyName, keyCode, which: keyCode,
                     bubbles: true, cancelable: true, composed: true };
      const notCancelled = el.dispatchEvent(new KeyboardEvent("keydown", opts));
      el.dispatchEvent(new KeyboardEvent("keypress", opts));
      el.dispatchEvent(new KeyboardEvent("keyup", opts));

      // pretend key presses don't do the browser's normal thing, so do it here
      // (Enter and Tab only if the website didn't handle the key itself)
      if (name === "enter" && notCancelled && el.form) {   // submit search boxes and forms
        const isSearchBox = el.tagName === "TEXTAREA" && (el.name === "q" || el.closest("[role=search]"));
        if (el.tagName === "INPUT" || isSearchBox) {
          if (el.form.requestSubmit) el.form.requestSubmit(); else el.form.submit();
        }
      }
      if (name === "tab" && notCancelled) {   // move to the next box or button
        const focusable = [...allClickable()].filter((x) => x.tabIndex >= 0 && !x.disabled && isShown(x) &&
                                                           x.getBoundingClientRect().width > 0);
        const next = focusable[(focusable.indexOf(el) + 1) % focusable.length];
        if (next) { next.focus(); flash(next); }
      }
      if (name === "backspace" && isTextBox(el)) {
        if (el.isContentEditable) document.execCommand("delete");
        else setValue(el, el.value.slice(0, -1), "deleteContentBackward");
      }
      return { ok: true };
    }

    // ================================================================ scrolling

    // usually the page scrolls; apps like Gmail scroll a big box inside the page instead
    function scrollingBox() {
      const page = document.scrollingElement || document.documentElement;
      if (page.scrollHeight > innerHeight + 20) return null;
      let best = null, bestArea = 0;
      for (const el of document.querySelectorAll("div,main,section,article")) {
        if (el.scrollHeight <= el.clientHeight + 20) continue;
        if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
        const area = el.clientWidth * el.clientHeight;
        if (area > bestArea) { best = el; bestArea = area; }
      }
      return best;
    }

    // how: up, down, up-lot, down-lot, up-bit, down-bit, top, bottom
    function scroll(how) {
      const box = scrollingBox();
      const target = box || window;
      if (how === "top" || how === "bottom") {
        const top = how === "top" ? 0 : (box || document.scrollingElement).scrollHeight;
        target.scrollTo({ top, behavior: "instant" });   // a long way: jump, don't glide
        setTimeout(() => target.scrollTo({ top, behavior: "instant" }), 450);   // again, after any glide still going
        return { ok: true };
      }
      const screenful = (box ? box.clientHeight : innerHeight) * 0.8;
      const amount = { down: 1, up: -1, "down-lot": 3, "up-lot": -3, "down-bit": 1 / 3, "up-bit": -1 / 3 }[how];
      target.scrollBy({ top: screenful * amount, behavior: "smooth" });
      return { ok: true };
    }

    // ================================================================ reading

    function text() {
      const main = document.querySelector("article, main, [role=main]") || document.body;
      return { title: document.title, text: tidy(main ? main.innerText : "").slice(0, 30000) };
    }

    function headings() {
      const list = [...document.querySelectorAll("h1,h2,h3,[role=heading]")]
        .filter((h) => isShown(h) && h.getBoundingClientRect().height > 0)
        .map((h) => tidy(h.innerText))
        .filter(Boolean);
      return { list: [...new Set(list)].slice(0, 25) };
    }

    function selectionText() {
      return { text: tidy(String(getSelection() || "")) };
    }

    // "find pricing on this page": scroll to the words and select them
    function findText(said) {
      const want = tidy(said).toLowerCase();
      if (!want) return { ok: false };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent.toLowerCase().indexOf(want);
        const el = node.parentElement;
        if (at < 0 || !el || !isShown(el) || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + want.length);
        el.scrollIntoView({ block: "center", behavior: "instant" });
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        flash(el);
        return { ok: true, text: tidy(el.textContent).slice(0, 120) };
      }
      return { ok: false };
    }

    // ================================================================ video and music

    function media(action) {
      const players = [...document.querySelectorAll("video,audio")];
      const biggest = players.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
      if (!biggest) return { ok: false };
      if (action === "pause") biggest.pause();
      if (action === "play") biggest.play().catch(() => {});
      if (action === "mute") biggest.muted = true;
      if (action === "unmute") biggest.muted = false;
      if (action === "forward") biggest.currentTime += 10;
      if (action === "rewind") biggest.currentTime -= 10;
      return { ok: true, paused: biggest.paused };
    }

    // ================================================================ things SpeechPoint draws on the page

    // a blue outline around what was just clicked or typed in
    function flash(el) {
      const r = el.getBoundingClientRect();
      const box = document.createElement("speechpoint-flash");
      box.style.cssText = `all:initial; position:fixed; z-index:2147483647; pointer-events:none;
        left:${r.left - 4}px; top:${r.top - 4}px; width:${r.width + 8}px; height:${r.height + 8}px;
        border:3px solid #2f81f7; border-radius:0; box-shadow:0 0 0 3px rgba(47,129,247,.25); transition:opacity .5s`;
      document.documentElement.appendChild(box);
      setTimeout(() => { box.style.opacity = "0"; }, 700);
      setTimeout(() => box.remove(), 1300);
    }

    // "show numbers": a numbered label on each item (ids in order), or none (null)
    let numberLayer = null;
    function numbers(ids) {
      if (numberLayer) { numberLayer.remove(); numberLayer = null; }
      if (!ids) return { ok: true };
      numberLayer = document.createElement("speechpoint-numbers");
      numberLayer.style.cssText = "all:initial; position:fixed; inset:0; z-index:2147483646; pointer-events:none;";
      let html = `<style>b { position:fixed; font:700 13px/1 ui-monospace,Menlo,monospace; color:#fff; background:#1d3577;
                  border:2px solid #1c1c1c; padding:2px 4px; box-shadow:2px 2px 0 rgba(0,0,0,.35) }</style>`;
      ids.forEach((id, i) => {
        const el = elementById.get(id);
        if (!el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        html += `<b style="left:${Math.max(0, r.left - 4)}px; top:${Math.max(0, r.top - 6)}px">${i + 1}</b>`;
      });
      numberLayer.attachShadow({ mode: "closed" }).innerHTML = html;
      document.documentElement.appendChild(numberLayer);
      return { ok: true };
    }

    // captions at the bottom of the page: what SpeechPoint heard and what it's doing
    let caption = null, fadeTimer = null;
    function bar(data) {
      if (!caption || !caption.host.isConnected) {
        const host = document.createElement("speechpoint-bar");
        host.style.cssText = "all:initial; position:fixed; z-index:2147483647; bottom:22px; left:50%;" +
                             "transform:translateX(-50%); pointer-events:none;";
        const root = host.attachShadow({ mode: "closed" });
        root.innerHTML = `<style>
          .bar { font:15px ui-monospace,Menlo,monospace; color:#fff; background:#1c1c1c; border:3px solid #1c1c1c;
                 padding:7px 14px; display:flex; gap:10px; align-items:center; max-width:70vw;
                 box-shadow:4px 4px 0 rgba(0,0,0,.25); transition:opacity .4s }
          .dot { width:10px; height:10px; background:#8b949e; flex:none }
          .dot.listening { background:#3fb950 } .dot.asleep { background:#6e7681 }
          .heard { color:#c9d1d9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:30vw }
          .reply { white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
          .heard:empty, .reply:empty { display:none }</style>
          <div class="bar"><span class="dot"></span><span class="heard"></span><span class="reply"></span></div>`;
        document.documentElement.appendChild(host);
        caption = { host, bar: root.querySelector(".bar"), dot: root.querySelector(".dot"),
                    heard: root.querySelector(".heard"), reply: root.querySelector(".reply") };
      }
      if (data.hide) { caption.host.style.display = "none"; return true; }
      caption.host.style.display = "";
      if (data.state !== undefined) caption.dot.className = "dot " + data.state;
      if (data.heard !== undefined) { caption.heard.textContent = data.heard ? `“${data.heard}”` : ""; caption.reply.textContent = ""; }
      if (data.reply !== undefined) caption.reply.textContent = data.reply;
      caption.bar.style.opacity = "1";
      // fade away when nothing is happening, so it never covers the page for long
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => {
        caption.bar.style.opacity = "0";
        setTimeout(() => { caption.heard.textContent = ""; caption.reply.textContent = ""; }, 500);
      }, 8000);
      return true;
    }

    window.__speechpoint = {
      version: 4,
      collect, click, hover, type, clearField, backspace, undo, selectAll, focusInfo, chooseOption, key,
      scroll, text, headings, selectionText, findText, media, numbers, bar,
    };
  })();
}
