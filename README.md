# SpeechPoint

A Chrome extension that lets people who can't use a mouse or keyboard use the web by voice:
open sites, click, type, dictate, scroll and read pages, just by talking normally.

## Try it

1. In Chrome, open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose the **`extension`** folder.
3. A welcome page opens: allow the microphone.
4. On any website, press **Option+S** (Alt+S on Windows) or click the SpeechPoint icon, and talk.
   Say "help" anytime. **Option+Shift+S** turns listening on and off.

## What's in the code

```
extension/              the extension itself (this folder is what gets loaded or zipped)
  manifest.json         name, permissions, keyboard shortcuts
  background.js         opens the panel and the welcome page
  panel.html/.css       the side panel you see
  panel.js              hears -> understands -> acts (start reading here)
  microphone.js         listening (Chrome's speech recognition)
  commands.js           understanding what was said ("scroll down 3 times" -> a command)
  actions.js            what each command does
  browser.js            tabs, and talking to the web page
  page.js               runs inside the web page: finds buttons, clicks, types, scrolls, reads
  ui.js                 the panel's text, spoken replies, the Yes/No box, captions on the page
  mycommands.js         the person's own phrases ("when I say homework…")
  state.js              what SpeechPoint remembers right now
  welcome.html/.js      first-run page (microphone permission and a short tutorial)
  icons/
  fonts/                the two pixel fonts (Pixelify Sans, VT323; free under the SIL Open Font License)
tests/
  commands.test.mjs     tests for understanding commands
  harness.html          test bench: runs the real extension code on sample pages
  checks.js             the 59 end-to-end checks the test bench runs
  fixtures/             the sample pages (videos, a form, an inbox, articles)
  serve.py              serves the test bench
```

## Testing

```
node --test tests/commands.test.mjs
python3 tests/serve.py        # then open http://127.0.0.1:8799/tests/harness.html, click "Run all checks"
```

## Making the Chrome Web Store zip

```
cd extension && zip -r ../SpeechPoint.zip . -x ".*"
```
