// Tests for SpeechPoint's command understanding.   Run:  node --test tests/commands.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, plan, dictate, bestMatch, stripWake, siteUrl } from "../extension/commands.js";

const kind = (s) => parse(s).kind;

test("everyday commands", () => {
  const cases = {
    "Go to YouTube": ["open", { arg: "youtube" }],
    "search YouTube for relaxing piano music": ["search", { site: "youtube", q: "relaxing piano music" }],
    "the second video": ["nth", { n: 2, noun: "video" }],
    "open the first video": ["nth", { n: 1, noun: "video" }],
    "click Subscribe": ["click", { arg: "subscribe" }],
    "scroll down": ["scroll", { how: "down" }],
    "scroll down a lot": ["scroll", { how: "down-lot" }],
    "go to the top": ["scroll", { how: "top" }],
    "go back": ["back", {}],
    "new tab with gmail": ["newtab", { arg: "gmail" }],
    "close tab": ["closetab", {}],
    "reopen the closed tab": ["reopen", {}],
    "go to the Gmail tab": ["tabnamed", { arg: "gmail" }],
    "tab 2": ["tab", { n: 2 }],
    "the third tab": ["tab", { n: 3 }],
    "pause": ["media", { op: "pause" }],
    "play it": ["media", { op: "play" }],
    "show numbers": ["numbers", { on: true }],
    "7": ["pick", { n: 7 }],
    "click 12": ["pick", { n: 12 }],
    "press enter": ["key", { key: "enter" }],
    "search for cats": ["search", { site: "", q: "cats" }],
    "watch a funny video": ["search", { site: "youtube", q: "funny video", play: true }],
    "um can you scroll up please": ["scroll", { how: "up" }],
    "go full screen": ["fullscreen", { on: true }],
    "exit full screen": ["fullscreen", { on: false }],
    "bookmark this page": ["bookmark", {}],
    "open my recipes bookmark": ["openbookmark", { arg: "recipes" }],
    "summarize this page": ["summarize", {}],
    "what can I click": ["describe", {}],
    "read the headlines": ["read", { what: "headings" }],
    "read this page": ["read", { what: "page" }],
    "talk slower": ["voice", { op: "slower" }],
    "what time is it": ["time", {}],
    "where am I": ["where", {}],
    "start dictation": ["dictation", { on: true }],
    "again": ["again", {}],
    "find pricing on this page": ["find", { arg: "pricing" }],
    "check remember me": ["check", { arg: "remember me", on: true }],
    "turn off notifications": ["check", { arg: "notifications", on: false }],
    "choose Canada": ["click", { arg: "canada", choose: true }],
  };
  for (const [said, [k, fields]] of Object.entries(cases)) {
    const c = parse(said);
    assert.equal(c.kind, k, `${said} -> ${JSON.stringify(c)}`);
    for (const [f, v] of Object.entries(fields)) assert.deepEqual(c[f], v, `${said}: ${f}`);
  }
});

test("words that are not commands stay unknown, single small words are not numbers", () => {
  assert.equal(kind("for"), "unknown");
  assert.equal(kind("sign in"), "unknown");   // the panel tries it as a button name
  assert.equal(kind("check my email"), "unknown");
});

test("repeats", () => {
  assert.deepEqual([parse("scroll down 3 times").kind, parse("scroll down 3 times").times], ["scroll", 3]);
  assert.equal(parse("next tab twice").times, 2);
  assert.equal(parse("type I said it 3 times").times, undefined);   // part of what's typed
});

test("typing keeps the person's own words, and can name the box", () => {
  assert.deepEqual(parse("Type Hello, World!"), { kind: "type", text: "Hello, World!" });
  const c = parse("type John Smith in the name box");
  assert.equal(c.text, "John Smith");
  assert.equal(c.field, "name");
  const d = parse("type pizza into search");
  assert.equal(d.text, "pizza");
  assert.equal(d.field, "search");
});

test("email by voice", () => {
  const c = parse("email sam@example.com saying I'll be late");
  assert.equal(c.kind, "email");
  assert.equal(c.to, "sam@example.com");
  assert.equal(c.body, "I'll be late");
  const d = parse("send an email to sam at example dot com about dinner");
  assert.equal(d.to, "sam@example.com");
  assert.equal(d.subject, "dinner");
  assert.equal(kind("open gmail"), "open");
});

test("teaching a phrase", () => {
  const c = parse("When I say homework, go to classroom.google.com");
  assert.equal(c.kind, "teach");
  assert.equal(c.phrase, "homework");
  assert.equal(c.action, "go to classroom.google.com");
  assert.equal(parse("forget the command homework").kind, "forget");
});

test("several steps in one breath", () => {
  const p = plan("go to YouTube and search for cats and then play the first video");
  assert.deepEqual(p.map((c) => c.kind), ["open", "search", "nth"]);
  assert.equal(p[1].q, "cats");
  assert.deepEqual(plan("search for salt and pepper").map((c) => c.kind), ["search"]);
  assert.equal(plan("search for salt and pepper")[0].q, "salt and pepper");
  assert.deepEqual(plan("type I like cats and dogs").map((c) => c.text), ["I like cats and dogs"]);
  assert.deepEqual(plan("type hello and then press enter").map((c) => c.kind), ["type", "key"]);
  assert.deepEqual(plan("open gmail, click compose").map((c) => c.kind), ["open", "click"]);
  assert.deepEqual(plan("when I say morning open gmail and open youtube").map((c) => c.kind), ["teach"]);
  assert.deepEqual(plan("scroll down and click sign in").map((c) => c.kind), ["scroll", "click"]);
});

test("dictation punctuation and capitals", () => {
  assert.equal(dictate("hello comma how are you question mark"), "Hello, how are you?");
  assert.equal(dictate("i am here period new line see you"), "I am here.\nSee you");
  assert.equal(dictate("and more", "First part."), " And more");
  assert.equal(dictate("and more", "first part"), " and more");
});

test("names match buttons, with common alternatives", () => {
  const items = [{ title: "Subscribe" }, { title: "Search" }, { title: "Sign in" }, { title: "Home" },
    { title: "Relaxing Piano Music Calm Study Music" }, { title: "Settings", kind: "text" }, { title: "Settings", kind: "button" }];
  assert.equal(bestMatch(items, "subscribe").title, "Subscribe");
  assert.equal(bestMatch(items, "login").title, "Sign in");
  assert.equal(bestMatch(items, "search button").title, "Search");
  assert.equal(bestMatch(items, "piano music").title, "Relaxing Piano Music Calm Study Music");
  assert.equal(bestMatch(items, "settings").kind, "button");
  assert.equal(bestMatch(items, "checkout"), null);
});

test("wake word and web addresses", () => {
  assert.deepEqual(stripWake("Hey SpeechPoint, go to YouTube"), { woke: true, rest: "go to youtube" });
  assert.equal(stripWake("go to youtube").woke, false);
  assert.equal(siteUrl("wikipedia dot org"), "https://wikipedia.org");
  assert.equal(siteUrl("youtube"), "https://www.youtube.com");
  assert.equal(siteUrl("the store"), null);
});

test("a taught phrase with a comma stays one command", () => {
  const p = plan("When I say kitty videos, go to youtube and search for kittens");
  assert.equal(p.length, 1);
  assert.equal(p[0].kind, "teach");
  assert.equal(p[0].action, "go to youtube and search for kittens");
});

test("copy, paste, hover and next page", () => {
  assert.deepEqual(parse("copy the link"), { kind: "copy", what: "url" });
  assert.deepEqual(parse("copy that"), { kind: "copy", what: "selection" });
  assert.equal(kind("paste"), "paste");
  assert.deepEqual(parse("hover over the products menu"), { kind: "hover", arg: "products menu" });
  assert.equal(kind("next page"), "nextpage");
  assert.equal(kind("scroll down"), "scroll");
});

test("the email from someone", () => {
  assert.deepEqual(parse("click the email from grandma"), { kind: "click", arg: "grandma", choose: false });
  assert.deepEqual(parse("open the message from sam lee"), { kind: "open", arg: "sam lee" });
  assert.deepEqual(parse("open the second email"), { kind: "nth", n: 2, noun: "email" });
});

test("reading more, selecting, at sign", () => {
  assert.deepEqual(parse("read more"), { kind: "read", what: "more" });
  assert.equal(kind("continue"), "read");
  assert.equal(kind("select all"), "selectall");
  assert.equal(dictate("my email is sam at sign example dot com"), "My email is sam@example dot com");
});

test("spelling", () => {
  assert.equal(parse("spell s a m at gmail dot com").text, "sam@gmail.com");
  assert.equal(parse("spell capital j o h n").text, "John");
  assert.equal(parse("spell bravo oscar bravo one two three").text, "bob123");
  assert.equal(parse("spell double l").text, "ll");
  assert.equal(kind("undo"), "undo");
});

test("spoken numbers match written ones", () => {
  const items = [{ title: "9th grade" }, { title: "10th grade" }, { title: "11th grade" }, { title: "Page 2" }];
  assert.equal(bestMatch(items, "tenth grade").title, "10th grade");
  assert.equal(bestMatch(items, "page two").title, "Page 2");
});
