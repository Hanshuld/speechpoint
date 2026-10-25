// SpeechPoint's panel: hears what you say, works out what you mean, and does it.
//
//   microphone.js  listening
//   commands.js    understanding ("go to YouTube and play the first video" -> steps)
//   actions.js     doing each step
//   browser.js     tabs and the web page (through page.js, which runs inside the page)
//   ui.js          what you see and hear in the panel
//   mycommands.js  your own phrases
//   state.js       what SpeechPoint remembers right now

import { app } from "./state.js";
import { $, show, say, setStatus, setIdleStatus, caption } from "./ui.js";
import { startListening, stopListening } from "./microphone.js";
import { parse, plan, stripWake } from "./commands.js";
import { act, dictateStep } from "./actions.js";
import { page, waitForLoad, sleep } from "./browser.js";
import { findMyCommand, drawMyCommands, addFromForm } from "./mycommands.js";

// commands that may load a new page: wait for it before the next step
const LOADS_A_PAGE = new Set(["open", "search", "newtab", "click", "nth", "pick", "back", "forward", "reload", "email",
  "openbookmark", "tab", "tabnamed", "tabstep", "reopen", "newwindow"]);

// ==================================================================== hearing

// every sentence the microphone hears (or that's typed in the panel) comes here
function heard(text) {
  let said = text;

  // with the wake word on (or while asleep), only listen to sentences that start with "Hey SpeechPoint"
  if ((app.settings.wake || app.asleep) && !app.dictating && !app.pending) {
    const wake = stripWake(text);
    const justWoken = Date.now() < app.wokeAt;
    if (!wake.woke && !justWoken && !app.asleep) return;   // not meant for SpeechPoint
    said = wake.woke ? wake.rest : text;
    if (wake.woke && !said) {   // just "Hey SpeechPoint": the next sentence counts
      app.wokeAt = Date.now() + 8000;
      say("Yes?");
      return;
    }
    app.wokeAt = 0;
  }

  show("heard", `“${text}”`);
  caption({ heard: text });

  // "stop" works straight away, even in the middle of something long
  if (!app.dictating && parse(said).kind === "stop") {
    app.stops++;
    chrome.tts.stop();
    app.speaking = false;
  }

  // one command at a time, in the order they were said
  app.busy = app.busy
    .then(() => (app.dictating ? dictateStep(said) : run(said)))
    .catch((error) => say("Something went wrong: " + (error.message || error)));
}

// ==================================================================== doing

async function run(said, depth = 0) {
  if (app.asleep) {
    if (parse(said).kind === "wake") {
      app.asleep = false;
      say("I'm listening.");
      setStatus("listening");
    }
    return;
  }

  // the person's own phrases come first ("homework" -> "go to classroom.google.com")
  const mine = depth < 3 && findMyCommand(said);
  if (mine) {
    show("reply", `“${mine.phrase}” → ${mine.action}`);
    await run(mine.action, depth + 1);
    return;
  }

  const steps = plan(said);   // "go to YouTube and play the first video" -> two steps
  if (!steps.length) return;
  const stopsAtStart = app.stops;
  setStatus("working");
  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (app.stops !== stopsAtStart && step.kind !== "stop") { show("reply", "Stopped."); break; }

      if (step.kind === "again") {
        if (app.lastCommand) await repeat(app.lastCommand); else say("There's nothing to repeat yet.");
      } else {
        if (!["yes", "no", "stop", "help", "time", "date", "where"].includes(step.kind)) app.lastCommand = step;
        await repeat(step);
      }
      if (app.pending) break;   // waiting for a yes

      const isLastStep = i === steps.length - 1;
      if (!isLastStep && LOADS_A_PAGE.has(step.kind)) await waitForLoad();
      else if (!isLastStep && step.kind === "scroll") await sleep(500);   // let the scroll finish gliding
    }
  } finally {
    setIdleStatus();
  }
}

// do a command once, or several times ("scroll down 3 times")
async function repeat(command) {
  const stopsAtStart = app.stops;
  const times = command.times || 1;
  for (let i = 0; i < times; i++) {
    if (app.stops !== stopsAtStart) return;
    await act(command, command.said || "");
    if (app.pending) return;
    if (i < times - 1) await sleep(command.kind === "scroll" ? 450 : 700);
  }
}

// ==================================================================== the panel's buttons and settings

const listen = () => startListening(heard);
const toggleListening = () => (app.listening ? stopListening() : listen());

$("mic").onclick = toggleListening;
$("allow").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
$("yes").onclick = () => heard("yes");
$("no").onclick = () => heard("no");
$("typed").onkeydown = (event) => {
  const text = event.target.value.trim();
  if (event.key === "Enter" && text) { heard(text); event.target.value = ""; }
};
$("mineAdd").onclick = addFromForm;
$("mineAction").onkeydown = (event) => { if (event.key === "Enter") addFromForm(); };

$("wake").onchange = (event) => saveSetting("wake", event.target.checked);
$("speak").onchange = (event) => saveSetting("speak", event.target.checked);
$("captions").onchange = (event) => {
  saveSetting("captions", event.target.checked);
  if (!event.target.checked) page("bar", { hide: true });
};

function saveSetting(name, value) {
  app.settings[name] = value;
  chrome.storage.local.set({ [name]: value });
}

// the welcome page tells us when the microphone has been allowed
chrome.storage.onChanged.addListener((changes) => {
  if (changes.micGranted && !app.listening) listen();
});
// the keyboard shortcut (Option+Shift+S) turns listening on and off
chrome.runtime.onMessage.addListener((message) => {
  if (message === "toggle-listening") toggleListening();
});

// ==================================================================== start

chrome.storage.local.get(["wake", "speak", "captions", "rate", "myCommands"], (saved) => {
  app.settings.wake = !!saved.wake;
  app.settings.speak = saved.speak !== false;
  app.settings.captions = saved.captions !== false;
  app.settings.rate = saved.rate || app.settings.rate;
  app.myCommands = Array.isArray(saved.myCommands) ? saved.myCommands : [];
  $("wake").checked = app.settings.wake;
  $("speak").checked = app.settings.speak;
  $("captions").checked = app.settings.captions;
  drawMyCommands();
  listen();
});

// for the test bench (tests/harness.html): give commands without a microphone
self.speechpointTest = {
  heard,
  idle: () => app.busy,
  state: () => ({ pending: app.pending, dictating: app.dictating, numbered: !!app.numbered, myCommands: app.myCommands }),
};
