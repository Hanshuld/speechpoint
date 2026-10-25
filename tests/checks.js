// End-to-end checks for SpeechPoint on the sample pages. Each one says a command (typed, as if spoken)
// and then looks at what really happened on the page. Used by harness.html ("Run all checks").
const doc = () => siteWin().document;
const val = (id) => doc().getElementById(id);

export const CHECKS = [
  // ---- video site
  ["results.html", "the second video", (r) => r.url.includes("watch.html?v=2")],
  ["results.html", "play the first video", (r) => r.url.includes("watch.html?v=1"), "skips the ad"],
  ["watch.html?v=1", "click like", () => siteWin().liked === true],
  ["watch.html?v=1", "mute", (r) => r.log.some((l) => l[0] === "muted" && l[1] === true)],
  ["results.html", "sign in", (r) => r.url.endsWith("#signin")],
  ["results.html", "next page", (r) => r.url.includes("page=2")],
  ["results.html", "hover over the products menu", () => !doc().getElementById("sub").hidden],
  [null, "click laptops", (r) => r.url.endsWith("#laptops"), "the menu that hover opened"],
  ["results.html", "what can I click", (r) => /Funny Cats Compilation/.test(r.reply) && !/10:23/.test(r.reply)],
  ["results.html", "show numbers", (r) => /things\. Say a number/.test(r.reply) && !!doc().querySelector("speechpoint-numbers")],
  [null, "2", (r) => r.url.endsWith("#signin")],

  // ---- inbox
  ["inbox.html", "open the second email", (r) => r.url.endsWith("#open-2")],
  ["inbox.html", "click the email from grandma", (r) => r.url.endsWith("#open-3")],
  ["inbox.html", "compose", (r) => r.url.endsWith("#compose")],

  // ---- forms
  ["form.html", "type John Smith in the name box", () => val("name").value === "John Smith"],
  ["form.html", "click email address and type sam@example.com", () => val("email").value === "sam@example.com"],
  ["form.html", "click email address", null, "setup"],
  [null, "spell s a m at example dot com", () => val("email").value === "sam@example.com"],
  [null, "undo", () => val("email").value === ""],
  ["form.html", "choose Canada", () => val("country").value === "Canada"],
  ["form.html", "check remember me", () => val("remember").checked === true],
  [null, "check remember me", (r) => /already on/.test(r.reply) && val("remember").checked === true],
  ["form.html", "turn off notifications", () => val("notif").getAttribute("aria-checked") === "false"],
  ["form.html", "type buy milk in the notes", () => val("notes").innerText.trim() === "buy milk"],
  ["form.html", "open settings", () => siteWin().settingsOpened === true, "plain text with a click handler"],
  ["form.html", "click send", (r) => /Say yes or no/.test(r.reply) && !siteWin().sent, "asks first"],
  [null, "yes", () => siteWin().sent === true],
  ["form.html", "click send", () => !siteWin().sent, "setup"],
  [null, "no", (r) => !siteWin().sent && /didn't/.test(r.reply)],

  // ---- dictation
  ["form.html", "click message", (r) => /Ready to type/.test(r.reply)],
  [null, "start dictation", (r) => /Dictation on/.test(r.reply)],
  [null, "hello comma this is a test period", () => val("msg").value === "Hello, this is a test."],
  [null, "new line second line", () => val("msg").value === "Hello, this is a test.\nSecond line"],
  [null, "scratch that", () => val("msg").value === "Hello, this is a test."],
  [null, "stop dictation", (r) => /Dictation off/.test(r.reply)],

  // ---- scrolling, finding, steps, repeats
  ["form.html", "find pricing on this page", () => siteWin().scrollY > 500],
  [null, "go to the top", () => siteWin().scrollY === 0],
  ["form.html", "scroll down 2 times and then go to the top", () => siteWin().scrollY === 0],
  ["form.html", "scroll to the pricing section", () => siteWin().scrollY > 500],
  ["form.html", "scroll down", null, "setup"],
  [null, "again", () => siteWin().scrollY > 900],

  // ---- reading
  ["article.html", "read the headlines", (r) => /Saving energy/.test(r.reply)],
  ["article.html", "summarize this page", (r) => r.reply.length > 20 && !/nothing/i.test(r.reply)],
  ["article.html", "find dawn and dusk on this page", null, "setup"],
  [null, "read the selection", (r) => r.reply === "dawn and dusk"],
  ["article.html", "where am I", (r) => /Why Cats Sleep So Much/.test(r.reply)],
  ["long.html", "read this page", (r) => /Say “read more”/.test(r.reply) && r.reply.length < 1500, "reads a part at a time"],
  [null, "read more", (r) => /Paragraph 2[0-9]/.test(r.reply) || /read more/.test(r.reply)],
  ["form.html", "click message", null, "setup"],
  [null, "type hello there", null, "setup"],
  [null, "select all", () => { const m = val("msg"); return m.selectionStart === 0 && m.selectionEnd === m.value.length && m.value.length > 0; }],
  ["form.html", "the neighbours were talking about the weather all afternoon and nobody noticed",
    (r) => r.said.length === 0 && /ignored/.test(r.reply), "background talk stays quiet"],

  // ---- browser
  ["form.html", "search YouTube for lofi beats", (r) => r.log.some((l) => /youtube\.com\/results\?search_query=lofi/.test(l[1]))],
  ["form.html", "go to wikipedia dot org", (r) => r.log.some((l) => l[1] === "https://wikipedia.org")],
  ["form.html", "new tab with gmail", (r) => r.log.some((l) => l[0] === "newtab" && /mail\.google/.test(l[1]))],
  ["form.html", "reopen tab", (r) => r.log.some((l) => l[0] === "reopen")],
  ["form.html", "full screen", (r) => r.log.some((l) => l[0] === "window" && l[1] === "fullscreen")],
  ["form.html", "bookmark this page", (r) => r.log.some((l) => l[0] === "bookmark")],
  ["form.html", "email sam@example.com saying I'll be late about tonight",
    (r) => r.log.some((l) => /to=sam%40example\.com/.test(l[1]) && /body=I%27ll\+be\+late/.test(l[1]) && /su=tonight/.test(l[1]))],
  ["form.html", "When I say kitty videos, go to youtube and search for kittens", (r) => /Got it/.test(r.reply)],
  [null, "kitty videos", (r) => r.log.some((l) => l[1] === "https://www.youtube.com")],
  [null, "forget the command kitty videos", (r) => /Forgot/.test(r.reply)],
  ["form.html", async () => {   // "stop" in the middle of a long task
    speechpointTest.heard("scroll down 10 times");
    await new Promise((r) => setTimeout(r, 900));
    const y = siteWin().scrollY;
    const out = await say("stop", 1500);
    return { ...out, y, after: siteWin().scrollY };
  }, (r) => r.after - r.y < 400 && r.after < 5000, "stop interrupts"],
  ["form.html", async () => {   // a vague request worked out step by step by the (scripted) built-in AI
    const num = (text, re) => { const line = text.split("\n").find((l) => re.test(l)); return line ? parseInt(line, 10) : 0; };
    window.aiScript = [
      (t) => ({ action: "click", number: num(t, /field: Name/) }),
      { action: "type", text: "Jane Doe" },
      { action: "done", text: "Filled in your name." },
    ];
    const r = await say("put my name in, it's Jane Doe", 900);
    window.aiScript = [];
    return r;
  }, (r) => val("name").value === "Jane Doe" && /Filled in your name/.test(r.reply), "vague request, several AI steps"],
  ["form.html", "flibber the jabberwock", (r) => /Please clarify/.test(r.reply), "says it can't"],
];

export async function runAll(report) {
  const results = [];
  for (const [pageName, said, check, note] of CHECKS) {
    if (pageName) await load(pageName);
    let ok = true, r = null, err = "";
    try {
      r = typeof said === "function" ? await said() : await say(said, 700);
      if (check) ok = !!check(r);
    } catch (e) {
      ok = false;
      err = String(e && e.message || e);
    }
    const row = { said: typeof said === "function" ? note : said, ok, note: typeof said === "function" ? "" : note || "",
                  reply: r ? r.reply : err };
    if (note !== "setup") { results.push(row); report(row); }
  }
  return results;
}
