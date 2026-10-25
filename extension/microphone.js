// Listening, with Chrome's built-in speech recognition.
import { app } from "./state.js";
import { $, show, say, setStatus } from "./ui.js";
import { norm } from "./commands.js";

let recognizer = null;

async function micAllowed() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (e) {
    return false;
  }
}

// start listening; every finished sentence goes to onHeard(text)
export async function startListening(onHeard) {
  const Recognizer = self.SpeechRecognition || self.webkitSpeechRecognition;
  if (!Recognizer) {
    say("This version of Chrome can't recognise speech. You can still type commands below.");
    return;
  }
  if (!(await micAllowed())) {
    setStatus("nomic");
    $("allow").hidden = false;
    show("reply", "Click “Allow microphone” once, then Start listening.");
    return;
  }
  $("allow").hidden = true;
  app.listening = true;

  recognizer = new Recognizer();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  // the commands are in English, so listen in English unless Chrome is set to another kind of English
  recognizer.lang = /^en/i.test(navigator.language || "") ? navigator.language : "en-US";

  let failedRestarts = 0;
  recognizer.onresult = (event) => {
    failedRestarts = 0;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript.trim();
      const finished = event.results[i].isFinal;
      // while SpeechPoint talks, the microphone hears it too: only listen for "stop" (to interrupt long reading)
      if (app.speaking || Date.now() < app.quietUntil) {
        if (finished && /^(?:stop|stop reading|stop talking|be quiet|quiet|shut up|enough|pause)$/.test(norm(text))) onHeard(text);
        continue;
      }
      if (!finished) show("heard", text + " …");   // words appear while you're still talking
      else if (text) onHeard(text);
    }
  };

  recognizer.onerror = (event) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      app.listening = false;
      setStatus("nomic");
      $("allow").hidden = false;
    } else if (event.error === "network") {
      show("reply", "Speech recognition needs the internet. Trying again…");
    } else if (event.error === "audio-capture") {
      show("reply", "I can't find a microphone. Check that one is plugged in.");
    }
  };

  // Chrome stops listening after a while (or after a network blip): start again, waiting longer each time it fails
  recognizer.onend = () => {
    if (!app.listening) return;
    const wait = Math.min(200 * 2 ** failedRestarts++, 8000);
    setTimeout(() => { try { recognizer.start(); } catch (e) { /* already started */ } }, wait);
  };

  recognizer.start();
  setStatus(app.asleep ? "asleep" : "listening");
  show("reply", "I'm listening. Say what you want to do.");
}

export function stopListening() {
  app.listening = false;
  if (recognizer) {
    recognizer.onend = null;
    try { recognizer.stop(); } catch (e) { /* already stopped */ }
  }
  setStatus("off");
}
