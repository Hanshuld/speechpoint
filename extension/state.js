// What SpeechPoint remembers while the panel is open. Every other file reads and changes this one object.

export const app = {
  settings: { wake: false, speak: true, rate: 1.05, captions: true },
  myCommands: [],          // the person's own phrases: [{ phrase: "homework", action: "go to classroom.google.com" }]

  listening: false,        // the microphone is on
  asleep: false,           // after "go to sleep", only "wake up" works
  speaking: false,         // SpeechPoint is talking (the microphone hears that too, so it's ignored)
  quietUntil: 0,           // keep ignoring the microphone until this time (just after talking)
  wokeAt: 0,               // after "Hey SpeechPoint" on its own, the next sentence counts until this time

  pending: null,           // something risky waiting for "yes": { item } or { key }
  numbered: null,          // the items labelled by "show numbers"
  dictating: false,        // everything heard is typed
  dictated: [],            // what dictation typed, piece by piece (for "scratch that")
  lastCommand: null,       // for "again"
  readRest: "",            // the rest of a long page (for "read more")

  busy: Promise.resolve(), // commands run one after another, in the order they were said
  stops: 0,                // goes up on every "stop"; long tasks check it and give up
};
