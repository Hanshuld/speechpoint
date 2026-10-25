// What each command does. act(command) looks up command.kind in ACTIONS below.
import { app } from "./state.js";
import { $, show, say, ask, clearAsk, setStatus } from "./ui.js";
import { frontTab, canUse, page, pageAnyFrame, items, go, waitForLoad, switchTab, findBookmark, shortTitle, hostOf } from "./browser.js";
import { bestMatch, siteUrl, dictate, norm, DICTATION_CONTROL, SEARCH, RISKY } from "./commands.js";
import { addMyCommand, forgetMyCommand } from "./mycommands.js";

// what the panel shows straight away, until something more specific replaces it
const WORKING_ON = { scroll: "Scrolling.", back: "Going back.", forward: "Going forward.", reload: "Reloading.",
  newtab: "New tab.", newwindow: "New window.", closetab: "Closing the tab.", reopen: "Bringing the tab back.",
  tab: "Switching tabs.", tabstep: "Switching tabs.", tabnamed: "Switching tabs.", fullscreen: "Done.", zoom: "Zoomed.",
  media: "Done.", type: "Typed.", clear: "Cleared.", key: "Pressed.", open: "Opening…", click: "Done.", nth: "Opening…",
  openbookmark: "Opening the bookmark…", search: "Searching…" };

export async function act(command, said = "") {
  const tab = await frontTab();
  if (WORKING_ON[command.kind]) show("reply", WORKING_ON[command.kind]);
  const action = ACTIONS[command.kind] || ACTIONS.unknown;
  await action(command, { tab, said });
}

// on Chrome's own pages (new tab, settings) extensions can't do anything: say so, and return true
async function cantUseThisPage() {
  const tab = await frontTab();
  if (tab && !canUse(tab.url)) {
    say("Chrome doesn't let extensions use this page. Say “go to” and a website, or “new tab with” a website.");
    return true;
  }
  return false;
}

// click something on the page (asking first if it looks risky, like Send or Buy)
export async function clickItem(item, { askFirst = true, quiet = false } = {}) {
  if (askFirst && RISKY.test(norm(item.title))) {
    ask(`Click “${item.title}”?`, { item });
    return;
  }
  const result = await page("click", item.lp, 1);
  if (!result || !result.ok) { say("That's gone from the page. Try again."); return; }
  if (result.open) await chrome.tabs.create({ url: result.open });   // a link that opens a new tab
  if (app.numbered) await hideNumbers();
  if (result.field && !quiet) say(`Ready to type in ${item.title || "the box"}. Say “type” and the words, or “start dictation”.`);
  else show("reply", `Clicked ${item.title}.`);
}

const ACTIONS = {
  none: async () => {},

  // ================================================================ control

  stop: async () => {
    chrome.tts.stop();
    clearAsk();
    if (app.numbered) await hideNumbers();
    show("reply", "Okay.");
  },
  sleep: async () => { app.asleep = true; say("Going to sleep. Say “wake up” when you need me."); },
  wake: async () => { app.asleep = false; say("I'm listening."); },
  help: async ({ topic }) => help(topic),

  yes: async () => {
    const waiting = app.pending;
    clearAsk();
    if (!waiting) { say("There's nothing to confirm."); return; }
    if (waiting.key) await page("key", waiting.key);
    else if (waiting.item) await clickItem(waiting.item, { askFirst: false });
  },
  no: async () => {
    if (!app.pending) return;
    clearAsk();
    say("Okay, I didn't.");
  },

  voice: async ({ op }) => {
    const settings = app.settings;
    if (op === "faster") settings.rate = Math.min(2, settings.rate + 0.2);
    if (op === "slower") settings.rate = Math.max(0.6, settings.rate - 0.2);
    if (op === "off") settings.speak = false;
    if (op === "on") settings.speak = true;
    $("speak").checked = settings.speak;
    chrome.storage.local.set({ rate: settings.rate, speak: settings.speak });
    say(op === "off" ? "Okay, I'll stay quiet and show my answers here." : "Okay, like this?");
  },

  // ================================================================ the person's own phrases

  teach: async ({ phrase, action }) => {
    addMyCommand(phrase, action);
    say(`Got it. When you say “${phrase}”, I'll ${action}.`);
  },
  forget: async ({ phrase }) => {
    say(forgetMyCommand(phrase) ? `Forgot “${phrase}”.` : `I don't have a command called “${phrase}”.`);
  },
  mycommands: async () => {
    say(app.myCommands.length
      ? "Your commands: " + app.myCommands.map((c) => `${c.phrase}: ${c.action}`).join(". ")
      : "You haven't made any yet. Say, for example, “when I say homework, go to classroom.google.com”.");
  },

  // ================================================================ tabs and windows

  back: async (_, { tab }) => { await chrome.tabs.goBack(tab.id).catch(() => say("There's no page to go back to.")); },
  forward: async (_, { tab }) => { await chrome.tabs.goForward(tab.id).catch(() => say("There's no page to go forward to.")); },
  reload: async (_, { tab }) => { await chrome.tabs.reload(tab.id); },
  newtab: async ({ arg }) => {
    const url = arg ? siteUrl(arg) || SEARCH.google + encodeURIComponent(arg) : undefined;
    await chrome.tabs.create(url ? { url } : {});
  },
  newwindow: async () => { await chrome.windows.create({}); },
  closetab: async (_, { tab }) => { await chrome.tabs.remove(tab.id); },
  reopen: async () => {
    try { await chrome.sessions.restore(); } catch (e) { say("There's no closed tab to bring back."); }
  },
  tab: async ({ n }) => {   // "tab 2", "the last tab"
    const tabs = await chrome.tabs.query({ currentWindow: true });
    await switchToTabNumber(tabs, n === -1 ? tabs.length - 1 : n - 1);
  },
  tabstep: async ({ d }, { tab }) => {   // "next tab", "previous tab"
    const tabs = await chrome.tabs.query({ currentWindow: true });
    await switchToTabNumber(tabs, (tab.index + d + tabs.length) % tabs.length);
  },
  tabnamed: async ({ arg }) => {
    if (!(await switchTab(arg))) say(`I can't find a ${arg} tab.`);
  },
  listtabs: async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    say(`${tabs.length} tabs: ` + tabs.map((t, i) => `${i + 1}, ${shortTitle(t.title)}`).join(". "));
  },
  fullscreen: async ({ on }) => {
    const window = await chrome.windows.getCurrent();
    await chrome.windows.update(window.id, { state: on ? "fullscreen" : "maximized" });
  },
  zoom: async ({ d }, { tab }) => {
    const zoom = await chrome.tabs.getZoom(tab.id);
    await chrome.tabs.setZoom(tab.id, d === 0 ? 0 : Math.min(5, Math.max(0.25, zoom + d * 0.25)));
  },
  bookmark: async (_, { tab }) => {
    await chrome.bookmarks.create({ title: tab.title, url: tab.url });
    say(`Bookmarked ${shortTitle(tab.title)}.`);
  },
  openbookmark: async ({ arg }) => {
    const bookmark = await findBookmark(arg);
    if (bookmark) await go(bookmark.url); else say(`I can't find a bookmark called ${arg}.`);
  },

  // ================================================================ moving around the page

  scroll: async ({ how }) => {
    if (await cantUseThisPage()) return;
    if (!(await page("scroll", how))) say("I can't scroll this page.");
    if (app.numbered) setTimeout(() => showNumbers(), 700);   // move the numbers with the page
  },
  nextpage: async () => {
    if (await cantUseThisPage()) return;
    const next = bestMatch((await items(true)).filter((e) => !e.ad), "next page", 0.8);
    if (next) await clickItem(next, { askFirst: false }); else await page("scroll", "down");
  },
  find: async ({ arg }) => {
    if (await cantUseThisPage()) return;
    const found = await page("findText", arg);
    say(found && found.ok ? `Found it: ${found.text}` : `I can't find “${arg}” on this page.`);
  },

  // ================================================================ going places

  open: async ({ arg }, { tab }) => {
    const url = siteUrl(arg);
    if (url) { await go(url); return; }
    const bookmark = await findBookmark(arg, 0.85);
    if (bookmark) { await go(bookmark.url); return; }
    if (await switchTab(arg, 0.8)) return;
    const onPage = canUse(tab.url) && bestMatch(await items(true), arg, 0.78);
    if (onPage) { await clickItem(onPage); return; }
    await go(SEARCH.google + encodeURIComponent(arg) + "&btnI=1");   // Google's "I'm feeling lucky": the site itself
    show("reply", `Opening ${arg}.`);
  },

  search: async ({ site, q, play }, { tab }) => {
    if (!site) {
      // search the site you're on (YouTube, Amazon…) if SpeechPoint knows it, otherwise Google
      const host = tab ? hostOf(tab.url) : "";
      const thisSite = Object.keys(SEARCH).find((name) => host.includes(name.replace(" ", "")));
      await go((thisSite ? SEARCH[thisSite] : SEARCH.google) + encodeURIComponent(q));
      show("reply", `Searching for ${q}.`);
      return;
    }
    await go(SEARCH[site] + encodeURIComponent(q));
    if (play) {   // "watch funny cats": search, then play the first video
      await waitForLoad();
      await openNth(1, "video");
      return;
    }
    show("reply", `Searching ${site} for ${q}.`);
  },

  email: async ({ to, subject, body }) => {
    let address = to;
    if (!/@/.test(address)) {
      // a name: look for a saved phrase like "mom" -> "mom@example.com"
      const contact = app.myCommands.find((c) => c.phrase === norm(address) && /@/.test(c.action));
      address = contact ? contact.action.replace(/^.*?([\w.+-]+@[\w-]+(\.[\w-]+)+).*$/, "$1") : "";
    }
    const fields = new URLSearchParams({ view: "cm", fs: "1", to: address, su: subject, body });
    await go("https://mail.google.com/mail/?" + fields.toString());   // Gmail's "new message" page, filled in
    say(address ? `Writing an email to ${address}. Say “click send” when it's ready.`
      : `I opened a new email. I don't know ${to}'s address, so say “type” and their email.`);
  },

  // ================================================================ clicking

  click: async ({ arg, choose }, { said }) => {
    if (await cantUseThisPage()) return;
    if (choose) {   // "choose Canada" from a drop-down list
      const chosen = await page("chooseOption", arg);
      if (chosen && chosen.ok) { show("reply", `Chose ${chosen.option}.`); return; }
    }
    const hit = bestMatch(await items(true), arg);
    if (hit) { await clickItem(hit); return; }
    if (await switchTab(arg, 0.85)) return;
    if (await askAI(said)) return;
    say(`I can't find “${arg}” on this page. Try other words, or say “show numbers”.`);
  },

  nth: async ({ n, noun }) => {
    if (!(await cantUseThisPage())) await openNth(n, noun);
  },

  check: async ({ arg, on }, { said }) => {   // tick boxes and switches
    if (await cantUseThisPage()) return;
    const boxes = (await items(true)).filter((e) => e.checked !== undefined);
    const box = bestMatch(boxes, arg, 0.7);
    if (!box) { await act({ kind: "click", arg }, said); return; }
    if (box.checked === on) { say(`${box.title} is already ${on ? "on" : "off"}.`); return; }
    await clickItem(box, { askFirst: false });
  },

  hover: async ({ arg }) => {
    if (await cantUseThisPage()) return;
    const hit = bestMatch(await items(true), arg);
    if (!hit) { say(`I can't find “${arg}” on this page.`); return; }
    await page("hover", hit.lp);
  },

  numbers: async ({ on }) => {
    if (!on) { await hideNumbers(); return; }
    if (await cantUseThisPage()) return;
    await showNumbers(true);
  },
  pick: async ({ n }) => {   // a number, after "show numbers"
    if (!app.numbered) { say("Say “show numbers” first, then a number."); return; }
    if (n > app.numbered.length) { say(`Say a number from 1 to ${app.numbered.length}.`); return; }
    await clickItem(app.numbered[n - 1]);
  },

  // ================================================================ typing

  type: async ({ text, field, maybeField }, { said }) => {
    if (await cantUseThisPage()) return;
    let boxId = null;
    if (field) {   // "type John in the name box"
      const boxes = (await items()).filter((e) => e.kind === "field");
      const box = bestMatch(boxes, field, maybeField ? 0.8 : 0.6);
      if (box) boxId = box.lp;
      else if (!maybeField) { say(`I can't find a ${field} box.`); return; }
    }
    // "type I'm in the kitchen": "the kitchen" wasn't a box after all, so type all of it
    const words = field && !boxId ? said.replace(/^(?:type|write|enter|put)[\s,:]+/i, "") : text;
    const typed = boxId ? await page("type", words, boxId) : await pageAnyFrame("type", words, null);
    if (!typed || !typed.ok) say("Click a box to type in first, for example “click search”.");
  },

  spell: async ({ text }) => {
    if (await cantUseThisPage()) return;
    const typed = await pageAnyFrame("type", text, null);
    if (!typed || !typed.ok) say("Click a box to type in first."); else show("reply", `Typed ${text}`);
  },

  clear: async () => {
    if (!(await page("clearField"))?.ok) say("Click into a box first.");
  },

  selectall: async () => {
    const result = await page("selectAll");
    if (!result) await cantUseThisPage();
    else show("reply", result.field ? "Selected everything in the box." : "Selected the page's text.");
  },

  undo: async () => undoOrRedo(false),
  redo: async () => undoOrRedo(true),

  key: async ({ key, confirm }) => {
    if (key === "enter") {
      // in a message box, Enter usually sends: ask first
      const focused = await page("focusInfo");
      if (focused && focused.field && (confirm || /message|reply|chat|comment|post|tweet|send/.test(norm(focused.name)))) {
        ask("Press Enter? This may send it.", { key: "enter" });
        return;
      }
    }
    if (!(await page("key", key))) await cantUseThisPage();
  },

  copy: async ({ what }, { tab }) => {
    let text = tab.url;
    if (what === "selection") {
      const selected = await page("selectionText");
      text = selected && selected.text;
      if (!text) { say("Nothing is selected. Say “find” and some words to select them first."); return; }
    }
    try {
      await navigator.clipboard.writeText(text);
      say(what === "url" ? "Copied the page's address." : "Copied.");
    } catch (e) {
      say("Chrome didn't let me copy. Click the SpeechPoint panel once, then try again.");
    }
  },

  paste: async () => {
    if (await cantUseThisPage()) return;
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch (e) { /* Chrome didn't allow it */ }
    if (!text) { say("There's nothing to paste, or Chrome didn't let me read it."); return; }
    const typed = await pageAnyFrame("type", text, null);
    if (!typed || !typed.ok) say("Click a box to paste into first.");
  },

  dictation: async ({ on }) => {
    if (!on) { stopDictation(); return; }
    if (await cantUseThisPage()) return;
    const focused = await pageAnyFrame("focusInfo");
    if (!focused || !focused.field) {
      // nothing to type into yet: click the first text box (outside the site's header if possible)
      const box = (await items()).find((e) => e.kind === "field" && !e.header) || (await items()).find((e) => e.kind === "field");
      if (!box) { say("Click a box to write in first, for example “click message”."); return; }
      await page("click", box.lp, 1);
    }
    app.dictating = true;
    app.dictated = [];
    say("Dictation on. Talk, and I'll type. Say “comma”, “period”, “new line”, “scratch that”, or “stop dictation”.");
  },

  // ================================================================ video and sound

  media: async ({ op }, { tab }) => {
    if (op === "mute" || op === "unmute") {
      await chrome.tabs.update(tab.id, { muted: op === "mute" });
      return;
    }
    const result = await page("media", op);
    if (!result || !result.ok) {
      // no video on the page (Spotify and others have their own buttons): press the button with that name
      const button = bestMatch(await items(), op === "forward" ? "skip" : op, 0.85);
      if (button) await clickItem(button, { askFirst: false }); else say("There's no video or music on this page.");
    }
  },

  // ================================================================ reading and questions

  read: async ({ what }) => {
    if (await cantUseThisPage()) return;
    if (what === "headings") {
      const result = await page("headings");
      say(result && result.list.length ? "Headings: " + result.list.join(". ") : "This page has no headings.");
    } else if (what === "selection") {
      const result = await page("selectionText");
      say(result && result.text ? result.text.slice(0, 4000) : "Nothing is selected. Say “find” and some words to select them.");
    } else if (what === "more") {
      if (app.readRest) readInParts(app.readRest); else say("That's the end.");
    } else {
      const result = await page("text");
      if (result && result.text) readInParts(result.text); else say("I can't read this page.");
    }
  },

  summarize: async () => summarize(),

  describe: async () => {   // "what can I click"
    if (await cantUseThisPage()) return;
    // one name per destination (a video's picture and its title go to the same place), and no bare times like "10:23"
    const byDestination = new Map();
    for (const item of await items()) {
      if (item.header || item.ad || !item.title || /^[\d:.\s]+$/.test(item.title)) continue;
      const key = item.href || item.lp;
      if (!byDestination.has(key) || byDestination.get(key).title.length < item.title.length) byDestination.set(key, item);
    }
    const names = [...byDestination.values()].slice(0, 10).map((e) => e.title.slice(0, 40));
    say(names.length ? "On this page you can say: " + names.join(", ") + ". Or say “show numbers”." : "I don't see anything to click here.");
  },

  time: async () => say(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })),
  date: async () => say(new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })),
  where: async (_, { tab }) => {
    const host = hostOf(tab.url).replace(/^www\./, "");
    say(`You're on ${shortTitle(tab.title)}${host ? ", at " + host : ""}.`);
  },

  // ================================================================ anything else

  // a name on its own ("subscribe"), else Chrome's built-in AI, else say so honestly
  unknown: async ({ text }, { tab, said }) => {
    const words = text || said;
    if (tab && canUse(tab.url)) {
      const hit = bestMatch(await items(true), words, 0.84);
      if (hit) { await clickItem(hit); return; }
    }
    if (await askAI(said)) return;
    // a long sentence that isn't a command is probably someone talking nearby (or a TV): don't answer it out loud
    if (words.split(" ").length > 8) { show("reply", "That didn't sound like a command, so I ignored it."); return; }
    say("Sorry, I can't do that. Please clarify your request.");
  },
};

// ==================================================================== helpers for the actions above

async function switchToTabNumber(tabs, index) {
  if (index < 0 || index >= tabs.length) { say(`There are only ${tabs.length} tabs.`); return; }
  await chrome.tabs.update(tabs[index].id, { active: true });
}

async function undoOrRedo(redo) {
  const result = await pageAnyFrame("undo", redo);
  if (!result || !result.ok) say("Undo works inside a text box. To go back a page, say “go back”.");
}

// label everything clickable with a number
async function showNumbers(announce = false) {
  const list = (await items()).slice(0, 120);
  if (!list.length) { if (announce) say("I can't see anything to click on this page."); return; }
  app.numbered = list;
  await page("numbers", list.map((e) => e.lp));
  if (announce) say(`${list.length} things. Say a number.`);
}

async function hideNumbers() {
  app.numbered = null;
  await page("numbers", null);
}

// long pages are read a part at a time: "read more" continues, "stop" stops
function readInParts(text) {
  let cut = text.length;
  if (text.length > 1400) {
    const lastSentenceEnd = text.slice(0, 1400).search(/[.!?]\s[^.!?]*$/);
    cut = lastSentenceEnd > 400 ? lastSentenceEnd + 1 : 1400;
  }
  app.readRest = text.slice(cut).trim();
  say(text.slice(0, cut) + (app.readRest ? " … Say “read more” to continue." : ""));
}

// "the second video": links in the page's main part (not its menus or ads), in reading order
async function openNth(n, noun) {
  const all = (await items()).filter((e) => !e.header && !e.ad);
  let choices = all.filter((e) => e.kind === "link" && e.title && e.title.length > 2);
  const rows = all.filter((e) => e.kind === "row" && e.title);

  if (["email", "message", "item", "row", "thing", "file"].includes(noun) && rows.length) choices = rows;
  else if (noun === "button") choices = all.filter((e) => e.kind === "button");
  else if (noun === "box" || noun === "field") choices = all.filter((e) => e.kind === "field");
  else if (noun === "checkbox") choices = all.filter((e) => e.checked !== undefined);
  else if (noun === "video" || noun === "song") {
    const videos = choices.filter((e) => /\/watch|\/shorts\/|vimeo\.com\/\d|\/video\/|\/track\//.test(e.href || ""));
    if (videos.length) choices = videos;
  } else if (["result", "", "one", "link"].includes(noun)) {
    // on Google's results, skip Google's own links
    const tab = await frontTab();
    if (/google\.[a-z.]+\/search/.test(tab.url)) choices = choices.filter((e) => e.href && !/google\./.test(hostOf(e.href)));
  }

  // one per destination: a video's picture and its title go to the same place
  const destination = (e) => {
    try { const url = new URL(e.href); return url.searchParams.get("v") || url.origin + url.pathname; } catch (x) { return e.title + e.lp; }
  };
  const seen = new Set();
  choices = choices
    .filter((e) => !/^(?:watch|visit site|learn more|shop now|install|sponsored)$/i.test(e.title))
    .filter((e) => { const key = destination(e); if (seen.has(key)) return false; seen.add(key); return true; });

  if (!choices.length) { say(`I can't see any ${noun || "results"} here.`); return; }
  const index = n === -1 ? choices.length - 1 : n - 1;
  if (index >= choices.length) { say(`I can only see ${choices.length}.`); return; }

  // prefer the link with the real title over one that's just a picture or a time ("10:23")
  const chosen = choices[index];
  const better = chosen.title.length > 8 || !chosen.href ? chosen
    : all.find((e) => e.href && destination(e) === destination(chosen) && e.title.length > chosen.title.length);
  await clickItem(better || chosen);
}

// ==================================================================== dictation

// while dictating, everything heard is typed, except these few commands
export async function dictateStep(said) {
  const words = norm(said);
  if (DICTATION_CONTROL.stop.test(words) || words === "stop") { stopDictation(); return; }
  if (DICTATION_CONTROL.undo.test(words)) {   // "scratch that"
    const last = app.dictated.pop();
    if (last) await pageAnyFrame("backspace", last.length);
    show("reply", last ? "Removed that." : "Nothing to remove.");
    return;
  }
  if (DICTATION_CONTROL.enter.test(words)) { await act({ kind: "key", key: "enter", confirm: true }, said); return; }

  const focused = await pageAnyFrame("focusInfo");
  if (!focused || !focused.field) { stopDictation(); say("The box I was typing in is gone, so dictation is off."); return; }
  const text = dictate(said, focused.before || "");
  const typed = await pageAnyFrame("type", text, null);
  if (typed && typed.ok) app.dictated.push(text);
}

function stopDictation() {
  app.dictating = false;
  app.dictated = [];
  say("Dictation off.");
  setStatus(app.listening ? "listening" : "off");
}

// ==================================================================== help

const HELP_TOPICS = {
  typing: "Click a box, for example “click search”. Then say “type” and the words, or “start dictation” to talk freely. " +
    "Say “press enter” to send, “clear it” to empty the box.",
  video: "Say “watch” and what you want, like “watch cooking videos”. Then “pause”, “play”, “skip”, “mute”, or “the second video”.",
  tabs: "Say “new tab”, “close tab”, “next tab”, “tab 2”, “go to the Gmail tab”, “reopen tab”, or “list tabs”.",
  shortcuts: "Teach me a phrase: “when I say homework, go to classroom.google.com”. Say “my commands” to hear them.",
};

function help(topic) {
  const t = norm(topic);
  const match = Object.keys(HELP_TOPICS).find((name) => t.includes(name) || (name === "video" && /youtube|music/.test(t)));
  $("things").open = true;
  say(match ? HELP_TOPICS[match] : "Say things like: go to YouTube, watch funny cat videos, the second video, click Subscribe, " +
    "scroll down, type hello, press enter, new tab, read this page, summarize this page, show numbers. " +
    "You can chain them with “and”. Say “help with typing”, “help with video”, “help with tabs”, or “help with shortcuts”.");
}

// ==================================================================== Chrome's built-in AI (runs on this computer, if it can)

async function aiReady() {
  try {
    return "LanguageModel" in self && (await LanguageModel.availability()) === "available";
  } catch (e) {
    return false;
  }
}

async function summarize() {
  if (await cantUseThisPage()) return;
  const pageText = await page("text");
  if (!pageText || !pageText.text) { say("There's nothing to summarize here."); return; }
  show("reply", "Reading the page…");
  const text = pageText.text.slice(0, 12000);
  try {
    if ("Summarizer" in self && (await Summarizer.availability()) === "available") {
      const summarizer = await Summarizer.create({ type: "tldr", length: "short", format: "plain-text" });
      say(await summarizer.summarize(text));
      summarizer.destroy();
      return;
    }
    if (await aiReady()) {
      const session = await LanguageModel.create();
      say(await session.prompt("Summarize this web page in three short sentences for someone listening:\n\n" + text.slice(0, 6000)));
      session.destroy();
      return;
    }
  } catch (e) { /* no AI: describe the page instead */ }
  const sections = await page("headings");
  say(`This is ${shortTitle(pageText.title)}.` +
    (sections && sections.list.length ? " Its sections are: " + sections.list.slice(0, 8).join(", ") + "." : "") +
    " Say “read this page” to hear all of it.");
}

// A vague request ("reply to grandma saying thanks"): the AI picks one step at a time, looking at the page again
// after each, for up to four steps. Risky buttons still need a yes. Returns true if it did something.
const AI_INSTRUCTIONS = "You control a web browser for a person who can't use their hands. Reply with the ONE next step " +
  "toward their request. click: the number of an item in the list. type: text to type into the focused box. " +
  "press_enter: press Enter. open_site: a web address. search: words to search for. scroll: up or down. " +
  "done: the request is finished (text: a short message). none: it can't be done here.";
const AI_ANSWER_SHAPE = { type: "object", required: ["action"], properties: {
  action: { type: "string", enum: ["click", "type", "press_enter", "open_site", "search", "scroll", "done", "none"] },
  number: { type: "integer" }, text: { type: "string" } } };
let aiSession = null;

async function askAI(said) {
  if (!(await aiReady())) return false;
  const stepsDone = [];
  try {
    aiSession = aiSession || await LanguageModel.create({ initialPrompts: [{ role: "system", content: AI_INSTRUCTIONS }] });
    for (let step = 1; step <= 4; step++) {
      const list = (await items(true)).filter((e) => !e.ad && e.title).slice(0, 80);
      const tab = await frontTab();
      const question = `Request: ${said}\nSteps so far: ${stepsDone.join("; ") || "none"}\nPage: ${tab.title}\n` +
        `Items:\n${list.map((e, i) => `${i + 1}. ${e.kind}: ${e.title}`).join("\n")}`;
      const conversation = await aiSession.clone();
      const answer = JSON.parse(await conversation.prompt(question, { responseConstraint: AI_ANSWER_SHAPE }));
      conversation.destroy();

      show("reply", `Step ${step}: ${answer.action}${answer.text ? " " + answer.text : ""}`);
      const item = list[answer.number - 1];
      if (answer.action === "none") return stepsDone.length > 0;
      if (answer.action === "done") { say(answer.text || "Done."); return true; }
      if (answer.action === "click" && item) {
        stepsDone.push(`clicked ${item.title}`);
        await clickItem(item, { quiet: true });
      } else if (answer.action === "type" && answer.text) {
        stepsDone.push(`typed ${answer.text}`);
        await pageAnyFrame("type", answer.text, null);
      } else if (answer.action === "press_enter") {
        stepsDone.push("pressed Enter");
        await act({ kind: "key", key: "enter", confirm: true }, said);
      } else if (answer.action === "open_site" && answer.text) {
        stepsDone.push(`opened ${answer.text}`);
        await go(siteUrl(answer.text) || "https://" + answer.text.replace(/^https?:\/\//, ""));
      } else if (answer.action === "search" && answer.text) {
        stepsDone.push(`searched ${answer.text}`);
        await go(SEARCH.google + encodeURIComponent(answer.text));
      } else if (answer.action === "scroll") {
        stepsDone.push("scrolled");
        await page("scroll", /up/.test(answer.text || "") ? "up" : "down");
      } else {
        return stepsDone.length > 0;
      }
      if (app.pending) return true;   // waiting for a yes
      await waitForLoad();
    }
    return true;
  } catch (e) {
    return stepsDone.length > 0;
  }
}
