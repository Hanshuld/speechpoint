// Understanding what was said.
//
//   parse("scroll down 3 times")           -> { kind: "scroll", how: "down", times: 3 }
//   plan("go to YouTube and play the first video")
//                                           -> [{ kind: "open", ... }, { kind: "nth", ... }]
//   bestMatch(buttons, "sign in")           -> the button most like "sign in"
//   dictate("hello comma world period")     -> "Hello, world."
//   spell("s a m at gmail dot com")         -> "sam@gmail.com"
//
// Nothing here touches Chrome, so it can be tested on its own (tests/commands.test.mjs).

// ==================================================================== word lists

export const SITES = {
  youtube: "https://www.youtube.com", google: "https://www.google.com", gmail: "https://mail.google.com",
  email: "https://mail.google.com", mail: "https://mail.google.com", "google docs": "https://docs.google.com",
  docs: "https://docs.google.com", "google drive": "https://drive.google.com", drive: "https://drive.google.com",
  "google maps": "https://maps.google.com", maps: "https://maps.google.com", calendar: "https://calendar.google.com",
  "google calendar": "https://calendar.google.com", "google classroom": "https://classroom.google.com",
  classroom: "https://classroom.google.com", wikipedia: "https://www.wikipedia.org", amazon: "https://www.amazon.com",
  netflix: "https://www.netflix.com", facebook: "https://www.facebook.com", instagram: "https://www.instagram.com",
  twitter: "https://x.com", x: "https://x.com", reddit: "https://www.reddit.com", linkedin: "https://www.linkedin.com",
  github: "https://github.com", spotify: "https://open.spotify.com", roblox: "https://www.roblox.com",
  outlook: "https://outlook.live.com", "chat gpt": "https://chatgpt.com", chatgpt: "https://chatgpt.com",
  claude: "https://claude.ai", twitch: "https://www.twitch.tv", tiktok: "https://www.tiktok.com",
  pinterest: "https://www.pinterest.com", ebay: "https://www.ebay.com", weather: "https://weather.com",
  news: "https://news.google.com", translate: "https://translate.google.com", "google translate": "https://translate.google.com",
  discord: "https://discord.com/app", whatsapp: "https://web.whatsapp.com", zoom: "https://zoom.us",
};

// search address for each site; the search words go on the end
export const SEARCH = {
  youtube: "https://www.youtube.com/results?search_query=", google: "https://www.google.com/search?q=",
  amazon: "https://www.amazon.com/s?k=", wikipedia: "https://en.wikipedia.org/w/index.php?search=",
  maps: "https://www.google.com/maps/search/", "google maps": "https://www.google.com/maps/search/",
  reddit: "https://www.reddit.com/search/?q=", github: "https://github.com/search?q=",
  ebay: "https://www.ebay.com/sch/i.html?_nkw=", spotify: "https://open.spotify.com/search/",
  images: "https://www.google.com/search?tbm=isch&q=", news: "https://news.google.com/search?q=",
  roblox: "https://www.roblox.com/discover/?Keyword=", netflix: "https://www.netflix.com/search?q=",
};

// buttons SpeechPoint asks about before pressing
export const RISKY = /\b(send|buy|purchase|order|pay|checkout|check out|delete|remove|post|publish|submit|confirm|unsubscribe|sign out|log out)\b/;

const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8,
  ninth: 9, tenth: 10, "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6, "7th": 7, "8th": 8, "9th": 9,
  "10th": 10, next: 1, top: 1, last: -1 };

// speech recognition often hears "to", "too" and "for" when people say 2 and 4
const NUMBER_WORDS = { one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50 };

// "two" -> 2, "twenty one" -> 21, "7" -> 7, anything else -> null
export function toNumber(word) {
  if (/^\d+$/.test(word)) return parseInt(word, 10);
  if (NUMBER_WORDS[word] !== undefined) return NUMBER_WORDS[word];
  const [tens, ones] = word.split(/[\s-]+/);
  if (ones && NUMBER_WORDS[tens] >= 20 && NUMBER_WORDS[ones] < 10) return NUMBER_WORDS[tens] + NUMBER_WORDS[ones];
  return null;
}

// ==================================================================== tidying up what was heard

// lower case, no punctuation: "Click 'Sign In'!" -> "click sign in"
export function norm(text) {
  return (text || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9.+ ]+/g, " ").replace(/\s+/g, " ").trim();
}

const FILLER_START = /^(?:um+|uh+|so|okay|ok|now|and|then|please|hey|alright|all right)\s+/;
const POLITE_START = /^(?:can you|could you|would you|will you|can u|i want to|i want you to|i need to|i need you to|id like to|i would like to|lets|let s|please|go ahead and|try to|help me)\s+/;
const POLITE_END = /\s+(?:please|for me|now|thanks|thank you|right now)$/;

// "um can you scroll down please" -> "scroll down"
export function clean(text) {
  let t = norm(text);
  for (let i = 0; i < 3; i++) t = t.replace(FILLER_START, "").replace(POLITE_START, "");
  return t.replace(POLITE_END, "").replace(POLITE_END, "").trim();
}

// the same, keeping capitals and symbols (for words that will be typed)
function cleanKeepingCase(raw) {
  let r = raw.trim();
  for (let i = 0; i < 3; i++) {
    r = r.replace(/^(?:um+|uh+|so|okay|ok|now|and|then|please|hey)[\s,]+/i, "")
         .replace(/^(?:can you|could you|would you|will you|i want to|i want you to|i need to|i'd like to|please|go ahead and)[\s,]+/i, "");
  }
  return r.replace(/[\s,]+(?:please|thanks|thank you)[.!]?$/i, "").trim();
}

// "youtube" or "wikipedia dot org" -> a web address; anything else -> null
export function siteUrl(name) {
  const n = norm(name).replace(/^(?:the )/, "").replace(/ (?:website|site|page|dot com|homepage|home page)$/, "");
  if (SITES[n]) return SITES[n];
  const dotted = n.replace(/ dot /g, ".").replace(/\s+/g, "");
  const looksLikeAddress = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/.test(dotted) && /\.[a-z]{2,}(\/|$)/.test(dotted);
  return looksLikeAddress ? "https://" + dotted : null;
}

// ==================================================================== the wake word

const WAKE_WORD = /^(?:hey |hi |ok |okay )?(?:speech ?point|speech ?pointe?|speechpoint|speak ?point|peach ?point|speed ?point|look ?point)[,.!?]?\s*/;

// "Hey SpeechPoint, go to YouTube" -> { woke: true, rest: "go to youtube" }
export function stripWake(text) {
  const t = norm(text);
  const m = t.match(WAKE_WORD);
  return m ? { woke: true, rest: t.slice(m[0].length) } : { woke: false, rest: t };
}

// ==================================================================== matching spoken names to buttons

// edit distance: how many letters to change to turn a into b
function editDistance(a, b) {
  if (!a.length || !b.length) return a.length || b.length;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

// "tenth grade" on screen is "10th grade"; "page two" is "page 2"
const SPOKEN_TO_WRITTEN = { first: "1st", second: "2nd", third: "3rd", fourth: "4th", fifth: "5th", sixth: "6th",
  seventh: "7th", eighth: "8th", ninth: "9th", tenth: "10th", eleventh: "11th", twelfth: "12th", one: "1", two: "2",
  three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12" };
const withDigits = (text) => text.split(" ").map((w) => SPOKEN_TO_WRITTEN[w] || w).join(" ");

// how well a spoken name matches a button's name, from 0 (not at all) to 1 (exactly)
export function similarity(said, name) {
  const a = withDigits(norm(said)), b = withDigits(norm(name));
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.startsWith(a + " ") || b.endsWith(" " + a)) return 0.93;
  if (a.length >= 4 && b.includes(a)) return 0.86;

  // spelling closeness (against the start of the name)
  const start = b.slice(0, a.length + 6);
  const spelling = 1 - editDistance(a, start) / Math.max(a.length, Math.min(b.length, a.length + 6));
  const spellingScore = spelling * (b.length > a.length * 2.5 ? 0.85 : 1);

  // shared words (allowing one-letter slips in longer words)
  const saidWords = a.split(" ");
  const nameWords = new Set(b.split(" "));
  const shared = saidWords.filter((w) => nameWords.has(w) || [...nameWords].some((x) => x.length > 3 && editDistance(w, x) <= 1)).length;
  const wordScore = (shared / saidWords.length) * (shared / Math.max(nameWords.size, 1) >= 0.5 ? 0.95 : 0.8);

  return Math.max(spellingScore, wordScore);
}

// different words for the same button
const SAME_MEANING = [
  ["sign in", "log in", "login", "signin"], ["sign up", "register", "create account", "signup"],
  ["home", "home page", "homepage"], ["settings", "preferences", "options"], ["search", "search box", "search bar"],
  ["menu", "main menu", "hamburger"], ["log out", "sign out", "logout"], ["cart", "basket", "shopping cart"],
  ["next video", "next", "next track", "skip to next"], ["previous video", "previous", "previous track"],
  ["skip ad", "skip ads", "skip"], ["next page", "next", "more results", "older posts"],
];

// the item whose name best matches what was said, or null if nothing is close enough
export function bestMatch(items, said, threshold = 0.74) {
  const name = norm(said).replace(/ (?:button|link|box|icon)$/, "");
  const sameMeaning = SAME_MEANING.find((group) => group.includes(name));
  for (const word of sameMeaning || []) {
    const hit = closest(items, word, threshold);
    if (hit) return hit;
  }
  return closest(items, name, threshold);
}

function closest(items, said, threshold) {
  let best = null, bestScore = 0;
  for (const item of items) {
    if (!item.title) continue;
    // real buttons and links beat plain text with the same words; the site's header loses ties
    const score = similarity(said, item.title) - (item.header ? 0.02 : 0) - (item.kind === "text" ? 0.04 : 0);
    if (score > bestScore + 0.001) { best = item; bestScore = score; }
  }
  return bestScore >= threshold ? best : null;
}

// ==================================================================== one command

const TIMES = /\s+(?:(\d+|two|three|four|five|six|seven|eight|nine|ten) times|(twice)|(three times))$/;

// what was said -> one command, like { kind: "scroll", how: "down" }
export function parse(raw) {
  let t = clean(raw);
  if (!t) return { kind: "none" };

  // "scroll down 3 times" (but "type I said it 3 times" types all of it)
  let times = 1;
  const m = t.match(TIMES);
  if (m && !/^(?:type|write|enter|dictate|search|google|email|send)\b/.test(t)) {
    times = m[2] ? 2 : m[3] ? 3 : toNumber(m[1]) || 1;
    t = t.slice(0, m.index).trim();
  }
  const command = parseOne(t, cleanKeepingCase(raw));
  if (times > 1) command.times = Math.min(times, 20);
  return command;
}

// t: the cleaned, lower-case words. raw: the same with capitals and symbols (for typing).
// The checks run in order; the first one that fits wins.
function parseOne(t, raw) {
  let m;

  // ---- control
  if (/^(?:stop|cancel|never ?mind|be quiet|quiet|shut up|stop talking|stop reading|stop it|enough)$/.test(t)) return { kind: "stop" };
  if (/^(?:go to sleep|sleep|stop listening|pause listening|take a break)$/.test(t)) return { kind: "sleep" };
  if (/^(?:wake up|start listening|im back|i am back)$/.test(t)) return { kind: "wake" };
  if ((m = t.match(/^(?:help|what can i say|what can you do|commands|show (?:me )?(?:the )?commands)(?: (?:with|for|about) (.+))?$/))) return { kind: "help", topic: m[1] || "" };
  if (/^(?:yes|yeah|yep|yup|sure|do it|go ahead|confirm|ok do it|correct|yes please|thats right)$/.test(t)) return { kind: "yes" };
  if (/^(?:no|nope|dont|do not|no thanks|cancel that)$/.test(t)) return { kind: "no" };
  if (/^(?:again|do (?:that|it) again|repeat(?: that)?|one more time|same again)$/.test(t)) return { kind: "again" };

  // ---- dictation
  if (/^(?:start (?:dictation|dictating|typing)|dictation(?: mode)?|take dictation|(?:start )?dictate|let me dictate)$/.test(t)) return { kind: "dictation", on: true };
  if (/^(?:stop (?:dictation|dictating)|end dictation|done dictating|dictation off)$/.test(t)) return { kind: "dictation", on: false };

  // ---- the person's own phrases: "when I say homework, go to classroom.google.com"
  if ((m = raw.match(/^(?:when|whenever|if) i say[\s,]+["“]?(.+?)["”]?[\s,]+(?:(?:you should|please)\s+)?((?:go to|open|search|play|watch|click|email|type|show|read|scroll)\b.+)$/i)))
    return { kind: "teach", phrase: norm(m[1]), action: m[2].trim() };
  if ((m = raw.match(/^(?:forget|delete|remove) (?:the )?(?:command|shortcut|phrase) ["“]?(.+?)["”]?$/i))) return { kind: "forget", phrase: norm(m[1]) };
  if (/^(?:what are my commands|list my commands|my commands|show my commands)$/.test(t)) return { kind: "mycommands" };

  // ---- scrolling
  if ((m = t.match(/^(?:scroll|page|go|move)\s+(down|up)(?:\s+(a lot|a little|a bit|more|some))?$/))) {
    const howFar = m[2] === "a lot" ? "-lot" : m[2] && !["more", "some"].includes(m[2]) ? "-bit" : "";
    return { kind: "scroll", how: m[1] + howFar };
  }
  if (/^(?:next page|go to the next page|more results|page \d+ of results)$/.test(t)) return { kind: "nextpage" };
  if (/^(?:scroll|page) ?down$|^down$|^keep scrolling$|^more$/.test(t)) return { kind: "scroll", how: "down" };
  if (/^(?:scroll|page) ?up$|^up$/.test(t)) return { kind: "scroll", how: "up" };
  if ((m = t.match(/^(?:go to |scroll to |jump to |take me to )?(?:the )?(?:very )?(top|bottom|end|start|beginning)(?: of (?:the |this )?page)?$/)))
    return { kind: "scroll", how: m[1] === "end" ? "bottom" : ["start", "beginning"].includes(m[1]) ? "top" : m[1] };

  // ---- back and forward
  if (/^(?:go back|back|previous page|go to the previous page|go back a page)$/.test(t)) return { kind: "back" };
  if (/^(?:go forward|forward)$/.test(t)) return { kind: "forward" };
  if (/^(?:reload|refresh)(?: (?:the |this )?page)?$/.test(t)) return { kind: "reload" };

  // ---- tabs and windows
  if ((m = t.match(/^(?:open |make |start )?(?:a )?new tab(?: (?:with|for|and go to|to|and open) (.+))?$/))) return { kind: "newtab", arg: m[1] || "" };
  if (/^(?:open |make )?(?:a )?new window$/.test(t)) return { kind: "newwindow" };
  if (/^close (?:this |the )?tab$|^close tab$|^close it$|^close this$/.test(t)) return { kind: "closetab" };
  if (/^(?:reopen|re open|bring back|undo close|restore)(?: the)?(?: last)?(?: closed)? tab$|^undo close tab$/.test(t)) return { kind: "reopen" };
  if (/^(?:next tab|switch tabs?|go to the next tab)$/.test(t)) return { kind: "tabstep", d: 1 };
  if (/^(?:previous tab|last tab|go to the previous tab)$/.test(t)) return { kind: "tabstep", d: -1 };
  if ((m = t.match(/^(?:go to |switch to |open )?(?:the )?(?:tab (?:number )?(\w+)|(\w+) tab)$/))) {
    const word = m[1] || m[2];
    const n = toNumber(word) ?? ORDINALS[word] ?? null;
    if (n !== null) return { kind: "tab", n };
    if (m[2]) return { kind: "tabnamed", arg: m[2] };
  }
  if ((m = t.match(/^(?:go to|switch to|open) (?:the |my )?(.+?) tab$/))) return { kind: "tabnamed", arg: m[1] };
  if (/^(?:list|what are) (?:my |the )?tabs$|^what tabs (?:are|do i have) open$/.test(t)) return { kind: "listtabs" };
  if (/^(?:go |make it |make this )?full ?screen$|^(?:enter|turn on) full ?screen$/.test(t)) return { kind: "fullscreen", on: true };
  if (/^(?:exit|leave|stop|turn off|close|escape) full ?screen$|^(?:normal|small) (?:screen|window)$/.test(t)) return { kind: "fullscreen", on: false };
  if (/^zoom in$|^bigger$|^make it bigger$|^make (?:the )?text bigger$/.test(t)) return { kind: "zoom", d: 1 };
  if (/^zoom out$|^smaller$|^make it smaller$|^make (?:the )?text smaller$/.test(t)) return { kind: "zoom", d: -1 };
  if (/^(?:reset zoom|normal size|actual size)$/.test(t)) return { kind: "zoom", d: 0 };

  // ---- video and music
  if (/^(?:pause|pause (?:the |this )?(?:video|music|song)|stop (?:the )?(?:video|music|song))$/.test(t)) return { kind: "media", op: "pause" };
  if (/^(?:play|resume|play it|resume it|unpause|play (?:the |this )?(?:video|music|song))$/.test(t)) return { kind: "media", op: "play" };
  if (/^(?:mute|mute (?:this|the) (?:tab|video|sound))$/.test(t)) return { kind: "media", op: "mute" };
  if (/^(?:unmute|unmute (?:this|the) (?:tab|video|sound))$/.test(t)) return { kind: "media", op: "unmute" };
  if (/^(?:skip|skip ahead|forward 10 seconds|fast forward|go forward 10 seconds)$/.test(t)) return { kind: "media", op: "forward" };
  if (/^(?:rewind|go back 10 seconds|back 10 seconds)$/.test(t)) return { kind: "media", op: "rewind" };

  // ---- SpeechPoint's own voice
  if (/^(?:talk|speak) faster$|^speed up$/.test(t)) return { kind: "voice", op: "faster" };
  if (/^(?:talk|speak) slower$|^slow down$/.test(t)) return { kind: "voice", op: "slower" };
  if (/^(?:dont talk|stop talking back|no talking|silent mode|be silent|dont speak)$/.test(t)) return { kind: "voice", op: "off" };
  if (/^(?:talk to me|talk back|start talking|speak to me)$/.test(t)) return { kind: "voice", op: "on" };

  // ---- questions
  if (/^(?:what time is it|whats the time|time)$/.test(t)) return { kind: "time" };
  if (/^(?:whats the date|what day is it|whats today|date|whats todays date)$/.test(t)) return { kind: "date" };
  if (/^(?:where am i|what page is this|what tab is this|what site is this|what am i looking at)$/.test(t)) return { kind: "where" };

  // ---- reading
  if (/^(?:summari[sz]e(?: (?:this|it|the page|this page|the article|this article))?|whats this (?:page|article) about|what is this (?:page|article) about|tldr|give me (?:a|the) summary)$/.test(t)) return { kind: "summarize" };
  if (/^(?:what can i (?:click|do|say here)|whats on (?:the |this )?(?:page|screen)|what do you see|list (?:the )?(?:links|buttons|options))$/.test(t)) return { kind: "describe" };
  if (/^(?:read more|keep reading|continue reading|go on|continue|next part)$/.test(t)) return { kind: "read", what: "more" };
  if (/^(?:read (?:the )?(?:headings|headlines|titles))$/.test(t)) return { kind: "read", what: "headings" };
  if (/^(?:read (?:the )?(?:selection|selected(?: text)?|highlighted(?: text)?|that))$/.test(t)) return { kind: "read", what: "selection" };
  if (/^(?:read|read (?:this|the|it|this page|the page|it to me|the article|this article|everything)|read aloud|read out loud|read to me)$/.test(t)) return { kind: "read", what: "page" };

  // ---- copy, paste, hover, bookmarks
  if (/^copy (?:the |this )?(?:link|address|url|page address|web address)$|^copy (?:this|the) page$/.test(t)) return { kind: "copy", what: "url" };
  if (/^copy(?: (?:that|this|it|the selection|selected text|the text))?$/.test(t)) return { kind: "copy", what: "selection" };
  if (/^paste(?: (?:it|that|here))?$/.test(t)) return { kind: "paste" };
  if ((m = t.match(/^(?:hover|mouse|point) (?:over |on |at )?(?:the )?(.+)$/))) return { kind: "hover", arg: m[1] };
  if (/^(?:bookmark|save|bookmark this|bookmark (?:this |the )?page|save (?:this )?page|add (?:a )?bookmark)$/.test(t)) return { kind: "bookmark" };
  if ((m = t.match(/^(?:open|go to) (?:my )?(.+?) bookmark$|^open (?:the )?bookmark (?:for |called )?(.+)$/))) return { kind: "openbookmark", arg: m[1] || m[2] };

  // ---- numbers on everything: "show numbers", then "7"
  if (/^(?:show (?:the )?numbers|numbers|number them|label everything|show labels|show (?:me )?(?:the )?options)$/.test(t)) return { kind: "numbers", on: true };
  if (/^(?:hide (?:the )?numbers|no numbers|numbers off|hide labels)$/.test(t)) return { kind: "numbers", on: false };
  if ((m = t.match(/^(?:click |press |choose |pick |select |number |option )?(?:number )?(\d+|[a-z]+(?:[ -][a-z]+)?)$/))) {
    const n = toNumber(m[1]);
    const loneLittleWord = /^(?:to|too|for)$/.test(m[1]) && t === m[1];   // "for" on its own isn't 4
    const clearlyANumber = /^\d+$/.test(m[1]) || /^(?:click|press|choose|pick|select|number|option)/.test(t) || t.split(" ").length === 1;
    if (n !== null && n > 0 && !loneLittleWord && clearlyANumber) return { kind: "pick", n };
  }

  // ---- email: "email sam@example.com saying I'll be late about tonight"
  if ((m = raw.match(/^(?:send (?:an? )?(?:email|e-mail|mail)|email|e-mail|write (?:an? )?email|compose (?:an? )?email)(?: to)?\s+(.+?)(?:[\s,]+(?:saying|that says|and say|telling (?:them|him|her)|with the message|that)\s+(.+?))?(?:[\s,]+(?:about|with the subject|subject)\s+(.+))?$/i)) &&
      !/^(?:inbox|gmail)$/i.test(m[1])) {
    const to = m[1].replace(/\s+at\s+/i, "@").replace(/\s+dot\s+/gi, ".").trim();
    return { kind: "email", to, body: m[2] || "", subject: m[3] || "" };
  }

  // ---- finding words on the page
  if ((m = t.match(/^(?:scroll|jump|go|skip) (?:down |up )?to (?:the )?(.+?) (?:section|part|heading|bit)$|^(?:scroll|jump) to (?!the top|the bottom|top|bottom)(?:the )?(.+)$/)))
    return { kind: "find", arg: m[1] || m[2] };
  if ((m = t.match(/^(?:find|search for|look for|where is|wheres|highlight) (.+?) on (?:this|the) page$|^(?:find|where is|wheres) (?:the )?(?:word|text|phrase) (.+)$/))) return { kind: "find", arg: m[1] || m[2] };

  // ---- searching the web
  if ((m = t.match(/^(?:search|look up|find) (\w+(?: \w+)?) for (.+)$/)) && SEARCH[m[1]]) return { kind: "search", site: m[1], q: m[2] };
  if ((m = t.match(/^(?:search|look up|google|look for|find)(?: for)? (.+?) on (\w+(?: \w+)?)$/)) && SEARCH[m[2]]) return { kind: "search", site: m[2], q: m[1] };
  if ((m = t.match(/^(?:play|watch|put on) (.+?) on youtube$/))) return { kind: "search", site: "youtube", q: m[1], play: true };
  if ((m = t.match(/^(?:search the web for|search google for|search for|search|google|look up)\s+(.+)$/))) return { kind: "search", site: "", q: m[1] };
  // "watch funny cats" searches YouTube and plays the first video ("play the second video" doesn't)
  if ((m = t.match(/^(?:i want to |i wanna )?(?:watch|play|put on|listen to|find me) (?:a |an |some |me )?(.+)$/)) &&
      !/^(?:the )?(?:video|music|song)$/.test(m[1]) &&
      !/^(?:the |this |that |it\b)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|next|top|this|that|it|\d+(?:st|nd|rd|th))\b/.test(m[1]))
    return { kind: "search", site: "youtube", q: m[1], play: true };

  // ---- typing
  if ((m = raw.match(/^(?:type|write|enter|put)[\s,:]+(.+?)\s+(?:in|into|in to)\s+(?:the\s+)?(.+?)(?:\s+(?:box|field|bar|area|section))$/i)))
    return { kind: "type", text: m[1], field: norm(m[2]) };   // "type John in the name box"
  if ((m = raw.match(/^(?:type|write|enter|put)[\s,:]+(.+?)\s+(?:in|into|in to)\s+(?:the\s+)?(.+)$/i)) && m[2].split(/\s+/).length <= 3)
    return { kind: "type", text: m[1], field: norm(m[2]), maybeField: true };   // "type pizza into search" (or just words)
  if (/^(?:type|write|enter|dictate)\s+.+$/.test(t)) return { kind: "type", text: raw.replace(/^(?:type|write|enter|dictate)[\s,:]+/i, "") };
  if (/^(?:clear (?:it|this|the box|the text|the field|everything)|erase (?:it|that|everything)|delete everything)$/.test(t)) return { kind: "clear" };
  if (/^select (?:all|everything)(?: the text)?$/.test(t)) return { kind: "selectall" };
  if ((m = t.match(/^(?:press|hit) (enter|return|tab|escape|space|backspace|delete|up|down|left|right)(?: key)?$/)))
    return { kind: "key", key: m[1] === "return" ? "enter" : m[1] };
  if (/^(?:submit|send it|post it)$/.test(t)) return { kind: "key", key: "enter", confirm: true };
  if (/^(?:delete that|backspace|scratch that)$/.test(t)) return { kind: "key", key: "backspace" };
  if (/^(?:undo|undo that|undo typing)$/.test(t)) return { kind: "undo" };
  if (/^redo$/.test(t)) return { kind: "redo" };
  if ((m = t.match(/^(?:spell|spell out|type the letters|letters)\s+(.+)$/))) return { kind: "spell", text: spell(m[1]) };

  // ---- tick boxes and switches: "check remember me", "turn off notifications"
  if ((m = t.match(/^(check|tick|select|uncheck|untick|unselect|turn on|turn off|enable|disable|switch on|switch off) (?:the )?(.+?)(?: (?:box|checkbox|check box|option|switch|toggle))?$/)) &&
      !/^(?:my |the )?(?:email|mail|inbox|messages|news|weather)$/.test(m[2])) {
    const on = !/^(?:un|turn off|disable|switch off)/.test(m[1]);
    if (m[1] !== "select" || / (?:box|checkbox|check box)$/.test(t)) return { kind: "check", arg: m[2], on };
  }

  // ---- "the second video", "open the first result"
  const NTH = "(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|next|top|\\d+(?:st|nd|rd|th))";
  const NOUNS = "(video|result|link|song|item|one|option|button|article|post|email|message|product|game|thing|box|field|checkbox|tab)";
  if ((m = t.match(new RegExp(`^(?:click|open|play|watch|select|choose|go to|pick)?\\s*(?:on )?(?:the )?${NTH}\\s*${NOUNS}?$`)))) {
    if (m[2] || /^(?:click|open|play|watch|select|choose|go to|pick)/.test(t)) {
      const n = ORDINALS[m[1]] ?? parseInt(m[1], 10);
      return m[2] === "tab" ? { kind: "tab", n } : { kind: "nth", n, noun: m[2] || "" };
    }
  }

  // ---- open or click something by name ("the email from grandma" -> "grandma")
  const nameOnly = (a) => a.replace(/^(?:the |an? )?(?:email|e-mail|message|mail|one|post|video|text|file|song) (?:from|by|about|called|named|titled) /, "");
  if ((m = t.match(/^(?:go to|open|visit|take me to|bring up|load|show me|launch|navigate to)\s+(?:my\s+)?(.+)$/))) return { kind: "open", arg: nameOnly(m[1]) };
  if ((m = t.match(/^(choose|select|pick|click|press|tap|hit|push|click on|tap on)\s+(?:on\s+)?(?:the\s+)?(.+?)(?:\s+(?:button|link|icon|tab))?$/)))
    return { kind: "click", arg: nameOnly(m[2]), choose: /^(?:choose|select|pick)$/.test(m[1]) };
  if (siteUrl(t)) return { kind: "open", arg: t };

  return { kind: "unknown", text: t };
}

// ==================================================================== several steps in one sentence

// words that start a new step
const ACTION_WORDS = "go|open|search|click|press|play|watch|scroll|type|write|pause|read|close|new|show|select|choose|pick|visit|" +
  "find|tap|hit|zoom|mute|unmute|reload|refresh|bookmark|summari[sz]e|check|uncheck|email|send|switch|enter|submit|" +
  "take|bring|put|listen|tick|turn|reopen|make|start|stop|what|where|clear|copy";
// a comma, "and", "then"… followed by an action word
const STEP_BREAK = new RegExp(`(?:\\s*,\\s*(?:and then |and |then )?|\\s+(?:and then|and after that|then|after that|and)\\s+)(?=(?:${ACTION_WORDS})\\b)`, "gi");
// commands whose words may contain "and" ("search for salt and pepper")
const KEEPS_AND = new Set(["type", "email", "teach", "search", "find"]);

// "go to YouTube and search for cats and play the first video" -> three commands
export function plan(raw) {
  let rest = raw.trim();
  if (parse(rest).kind === "teach") return [{ ...parse(rest), said: rest }];   // a whole new shortcut is one step

  const steps = [];
  for (let guard = 0; rest && guard < 12; guard++) {
    const cut = nextStepBreak(rest);
    if (!cut) { steps.push(rest); break; }
    steps.push(rest.slice(0, cut.at));
    rest = rest.slice(cut.next);
  }
  return steps.map((s) => ({ ...parse(s), said: s.trim() })).filter((c) => c.kind !== "none");
}

// where the first step ends, or null if it's all one step
function nextStepBreak(text) {
  STEP_BREAK.lastIndex = 0;
  let m;
  while ((m = STEP_BREAK.exec(text))) {
    const before = text.slice(0, m.index);
    if (!before.trim()) continue;
    const kind = parse(before).kind;
    if (kind === "teach") return null;
    const justAnd = !/then|after/i.test(m[0]);   // a plain "and" or comma (not "and then")
    if (KEEPS_AND.has(kind) && justAnd) continue;
    return { at: m.index, next: m.index + m[0].length };
  }
  return null;
}

// ==================================================================== dictation: spoken punctuation -> text

const SPOKEN_PUNCTUATION = [
  [/\s*\b(?:new paragraph|next paragraph)\b\s*/gi, "\n\n"],
  [/\s*\b(?:new line|next line|line break)\b\s*/gi, "\n"],
  [/\s*\b(?:full stop|period)\b/gi, "."],
  [/\s*\bcomma\b/gi, ","],
  [/\s*\bquestion mark\b/gi, "?"],
  [/\s*\bexclamation (?:mark|point)\b/gi, "!"],
  [/\s*\bsemicolon\b/gi, ";"],
  [/\s*\bcolon\b/gi, ":"],
  [/\b(?:open quote|quote)\s*/gi, "“"],
  [/\s*\b(?:close quote|end quote|unquote)\b/gi, "”"],
  [/\s*\bdash\b\s*/gi, " - "],
  [/\b(?:smiley face|smiley)\b/gi, ":)"],
  [/\s*\bat sign\b\s*/gi, "@"],
];

// what was said -> what to type. before: the text already in the box (for capitals and spacing)
export function dictate(text, before = "") {
  let out = " " + text.trim();
  for (const [spoken, mark] of SPOKEN_PUNCTUATION) out = out.replace(spoken, mark);
  out = out.replace(/^ /, "").replace(/ +([.,?!;:])/g, "$1");

  const startsSentence = !before.trim() || /[.?!\n]\s*$/.test(before);
  if (startsSentence) out = out.replace(/^([\s“]*)([a-z])/, (_, space, letter) => space + letter.toUpperCase());
  out = out.replace(/([.?!]\s+|\n\s*)([a-z])/g, (_, end, letter) => end + letter.toUpperCase()).replace(/\bi\b/g, "I");

  const needsSpace = before && !/[\s\n]$/.test(before) && !/^[.,?!;:\n]/.test(out);
  return (needsSpace ? " " : "") + out;
}

// what can be said while dictating (everything else is typed)
export const DICTATION_CONTROL = {
  stop: /^(?:stop (?:dictation|dictating|typing)|end dictation|done dictating|im done|dictation off|finish dictation)$/,
  undo: /^(?:scratch that|delete that|undo that|undo)$/,
  enter: /^(?:press enter|send it|submit)$/,
};

// ==================================================================== spelling

// the phone alphabet (alpha, bravo…)
const PHONE_ALPHABET = { alpha: "a", alfa: "a", bravo: "b", charlie: "c", delta: "d", echo: "e", foxtrot: "f",
  golf: "g", hotel: "h", india: "i", juliet: "j", juliett: "j", kilo: "k", lima: "l", mike: "m", november: "n",
  oscar: "o", papa: "p", quebec: "q", romeo: "r", sierra: "s", tango: "t", uniform: "u", victor: "v", whiskey: "w",
  xray: "x", "x-ray": "x", yankee: "y", zulu: "z" };
// symbols, digits, and how speech recognition writes some single letters ("see" for c, "you" for u)
const SPELLING_WORDS = { at: "@", "at sign": "@", dot: ".", period: ".", dash: "-", hyphen: "-", underscore: "_",
  space: " ", slash: "/", plus: "+", zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ex: "x", why: "y", see: "c", bee: "b", are: "r", you: "u", queue: "q",
  tea: "t", gee: "g", jay: "j", kay: "k", el: "l", em: "m", en: "n", pea: "p", es: "s", vee: "v", double: "" };

// "s a m at gmail dot com" -> "sam@gmail.com"; "capital j" -> "J"; "double l" -> "ll"
export function spell(said) {
  const words = said.toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean);
  let out = "", capital = false, double = false;
  for (const word of words) {
    if (["capital", "cap", "uppercase"].includes(word)) { capital = true; continue; }
    if (word === "double") { double = true; continue; }
    let piece = PHONE_ALPHABET[word] ?? SPELLING_WORDS[word] ?? (/^[a-z0-9]$/.test(word) ? word : word.replace(/\.$/, ""));
    if (/^[a-z]\.$/.test(word)) piece = word[0];   // "a." -> "a"
    if (capital) piece = piece.toUpperCase();
    out += double ? piece + piece : piece;
    capital = double = false;
  }
  return out;
}
