// Runs in the background while Chrome is open.

// clicking the SpeechPoint icon opens the panel at the side
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// the first time SpeechPoint is installed, open the welcome page (it asks for the microphone)
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
});

// Option+Shift+S: tell the open panel to start or stop listening
chrome.commands.onCommand.addListener((name) => {
  if (name === "toggle-listening") chrome.runtime.sendMessage("toggle-listening").catch(() => {});
});
