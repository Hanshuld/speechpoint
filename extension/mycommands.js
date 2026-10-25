// The person's own phrases: "when I say homework, go to classroom.google.com".
import { app } from "./state.js";
import { $, show } from "./ui.js";
import { norm, similarity, siteUrl } from "./commands.js";

// the saved phrase that matches what was said, or null
export function findMyCommand(said) {
  const words = norm(said);
  let best = null, bestScore = 0;
  for (const command of app.myCommands) {
    const sameLength = Math.abs(words.length - command.phrase.length) < 4;
    const score = command.phrase === words ? 1 : similarity(words, command.phrase) * (sameLength ? 1 : 0.8);
    if (score > bestScore) { best = command; bestScore = score; }
  }
  return bestScore >= 0.86 ? best : null;
}

export function addMyCommand(phrase, action) {
  app.myCommands = app.myCommands.filter((c) => c.phrase !== phrase).concat([{ phrase, action }]);
  saveMyCommands();
}

// remove a phrase (and any very close to it); true if something was removed
export function forgetMyCommand(phrase) {
  const before = app.myCommands.length;
  app.myCommands = app.myCommands.filter((c) => c.phrase !== phrase && similarity(phrase, c.phrase) < 0.9);
  saveMyCommands();
  return app.myCommands.length < before;
}

export function saveMyCommands() {
  chrome.storage.local.set({ myCommands: app.myCommands });
  drawMyCommands();
}

// the list in the panel's "My commands" section, each with a Remove button
export function drawMyCommands() {
  const list = $("mineList");
  list.textContent = "";
  for (const command of app.myCommands) {
    const remove = Object.assign(document.createElement("button"), { textContent: "Remove", className: "small-btn" });
    remove.setAttribute("aria-label", `Remove the command ${command.phrase}`);
    remove.onclick = () => {
      app.myCommands = app.myCommands.filter((c) => c !== command);
      saveMyCommands();
    };
    const row = document.createElement("li");
    row.append(Object.assign(document.createElement("b"), { textContent: `“${command.phrase}”` }),
               document.createTextNode(` → ${command.action} `), remove);
    list.append(row);
  }
  $("mineEmpty").hidden = app.myCommands.length > 0;
}

// the "Add command" button
export function addFromForm() {
  const phrase = norm($("minePhrase").value);
  let action = $("mineAction").value.trim();
  if (!phrase || !action) return;
  // just a website ("classroom.google.com") means "go to" it
  if (siteUrl(action) && !/^(go to|open|search|play|watch|click|type|email)\b/i.test(action)) action = "go to " + action;
  addMyCommand(phrase, action);
  $("minePhrase").value = $("mineAction").value = "";
  show("reply", `Saved. Say “${phrase}”.`);
}
