// Side panels can't show Chrome's permission question, so it's asked here, in a normal tab.
const mic = document.getElementById("mic");
const again = document.getElementById("again");
if (!/Mac/i.test(navigator.platform)) document.getElementById("keys").textContent = "Alt";

function askMic() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
    s.getTracks().forEach((t) => t.stop());
    mic.innerHTML = '<span class="ok">Done — SpeechPoint can hear you.</span>';
    again.hidden = true;
    chrome.storage.local.set({ micGranted: Date.now() });
  }).catch(() => {
    mic.innerHTML = '<span class="bad">The microphone is blocked.</span> Click the microphone icon in the address bar, ' +
      'choose Allow, then click “Ask again”.';
    again.hidden = false;
  });
}
again.onclick = askMic;
askMic();
