// What the person sees and hears: the panel's text, spoken replies, the Yes/No box, and captions on the page.
import { app } from "./state.js";
import { page } from "./browser.js";

export const $ = (id) => document.getElementById(id);

export function show(id, text) {
  $(id).textContent = text;
}

const STATUS_TEXT = {
  listening: "Listening",
  asleep: "Asleep — say “wake up”",
  off: "Microphone off",
  working: "Working…",
  nomic: "Microphone not allowed",
};

// status: listening, asleep, off, working or nomic
export function setStatus(status) {
  document.body.dataset.state = status;
  // a green dot on the toolbar icon while the microphone is on
  chrome.action?.setBadgeText?.({ text: app.listening && status !== "asleep" ? "●" : "" });
  chrome.action?.setBadgeBackgroundColor?.({ color: "#2e7d32" });
  if (status !== "working") caption({ state: status === "listening" || status === "asleep" ? status : "" });

  show("state", status === "listening" && app.dictating ? "Dictating — say “stop dictation” when done" : STATUS_TEXT[status] || status);
  $("mic").textContent = app.listening ? "Stop listening" : "Start listening";
}

// back to listening / asleep / off after a command
export function setIdleStatus() {
  setStatus(!app.listening ? "off" : app.asleep ? "asleep" : "listening");
}

// show the same words on the web page itself, at the bottom
export function caption(data) {
  if (app.settings.captions) page("bar", data).catch(() => {});
}

// show a reply and say it out loud
export function say(text) {
  show("reply", text);
  caption({ reply: text });
  if (!app.settings.speak) return;
  app.speaking = true;
  chrome.tts.stop();
  chrome.tts.speak(text, {
    rate: app.settings.rate,
    onEvent: (event) => {
      if (["end", "interrupted", "cancelled", "error"].includes(event.type)) {
        app.speaking = false;
        app.quietUntil = Date.now() + 450;   // the last word can still be echoing
      }
    },
  });
}

// ask before something risky; "yes" (or the Yes button) does it
export function ask(question, whatToDo) {
  app.pending = whatToDo;
  $("confirm").hidden = false;
  show("confirmText", question);
  say(question + " Say yes or no.");
}

export function clearAsk() {
  app.pending = null;
  $("confirm").hidden = true;
}
