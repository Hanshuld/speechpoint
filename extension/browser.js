// Tabs, and talking to the web page through page.js.
import { similarity, norm } from "./commands.js";
import { app } from "./state.js";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function frontTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// extensions may not touch Chrome's own pages or the Web Store
export function canUse(url) {
  return /^(https?|file):/.test(url || "") && !/^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/.test(url);
}

// run one of page.js's functions in the page in front: page("click", 12) -> its answer (or null)
export async function page(name, ...args) {
  const tab = await frontTab();
  if (!tab || !canUse(tab.url)) return null;
  try {
    const [answer] = await callInFrames(tab, name, args, false);
    return answer;
  } catch (e) {
    return null;   // the page is still loading, or won't let extensions in
  }
}

// the same, trying the page's inner frames too (Google Docs and some editors type into a hidden frame)
export async function pageAnyFrame(name, ...args) {
  const answer = await page(name, ...args);
  if (answer && (answer.ok || answer.field)) return answer;
  const tab = await frontTab();
  if (!tab || !canUse(tab.url)) return answer;
  try {
    const answers = await callInFrames(tab, name, args, true);
    return answers.find((a) => a && (a.ok || a.field)) || answer;
  } catch (e) {
    return answer;
  }
}

async function callInFrames(tab, name, args, allFrames) {
  const target = { tabId: tab.id, allFrames };
  await chrome.scripting.executeScript({ target, files: ["page.js"] });
  const results = await chrome.scripting.executeScript({
    target, func: (name, args) => window.__speechpoint[name](...args), args: [name, args],
  });
  return results.map((r) => (r ? r.result : null));
}

// everything you could click on the page (withText: plain words too)
export async function items(withText = false) {
  const answer = await page("collect", withText);
  return answer ? answer.items : [];
}

export async function go(url, newTab = false) {
  const tab = await frontTab();
  if (newTab || !tab) await chrome.tabs.create({ url });
  else await chrome.tabs.update(tab.id, { url });
}

// wait for the page to load (and a little longer, for pages that fill in their results afterwards)
export async function waitForLoad() {
  const stopsAtStart = app.stops;
  await sleep(300);
  for (let i = 0; i < 40 && app.stops === stopsAtStart; i++) {
    const tab = await frontTab();
    if (tab && tab.status === "complete") break;
    await sleep(250);
  }
  await sleep(700);
}

// switch to the tab whose title or site best matches the name; false if none is close enough
export async function switchTab(name, threshold = 0.7) {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  let best = null, bestScore = 0;
  for (const tab of tabs) {
    const site = siteName(tab.url);
    const score = Math.max(similarity(name, tab.title || ""), similarity(name, site));
    if (score > bestScore) { best = tab; bestScore = score; }
  }
  if (!best || bestScore < threshold) return false;
  await chrome.tabs.update(best.id, { active: true });
  return true;
}

// "https://www.youtube.com/watch" -> "youtube"
function siteName(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").split(".")[0]; } catch (e) { return ""; }
}

export function hostOf(url) {
  try { return new URL(url).hostname; } catch (e) { return ""; }
}

// the bookmark whose title best matches the name, or null
export async function findBookmark(name, threshold = 0.75) {
  try {
    // Chrome's bookmark search wants exact words ("grandma's" isn't "grandmas"), so search word by word, longest first
    const words = norm(name).split(" ").filter((w) => w.length > 2).sort((a, b) => b.length - a.length);
    let found = [];
    for (const word of words.slice(0, 3)) {
      found = found.concat(await chrome.bookmarks.search(word));
      if (found.length > 50) break;
    }
    let best = null, bestScore = 0;
    for (const bookmark of found) {
      if (!bookmark.url) continue;
      const score = similarity(name, bookmark.title || "");
      if (score > bestScore) { best = bookmark; bestScore = score; }
    }
    return bestScore >= threshold ? best : null;
  } catch (e) {
    return null;
  }
}

// "Funny Cats - YouTube" -> "Funny Cats"
export function shortTitle(title) {
  return (title || "this page").split(/ [-|–—•] /)[0].slice(0, 60);
}
