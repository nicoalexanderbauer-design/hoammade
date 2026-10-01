// Installation only; account and session state belong to the portal.
const installButton = document.getElementById("install-button");
const installStatus = document.getElementById("install-status");
let pendingInstall = null;

function installed() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function updateStatus(message) {
  if (installStatus) installStatus.textContent = message;
}

if (installed()) updateStatus("ZeltTracker ist als Web-App geöffnet.");

window.addEventListener("beforeinstallprompt", event => {
  if (!installButton || installed()) return;
  event.preventDefault();
  pendingInstall = event;
  installButton.hidden = false;
  updateStatus("Dein Browser bietet die Installation auf dem Startbildschirm an.");
});

installButton?.addEventListener("click", async () => {
  if (!pendingInstall) return;
  const prompt = pendingInstall;
  pendingInstall = null;
  installButton.disabled = true;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    updateStatus(choice.outcome === "accepted"
      ? "Installation bestätigt. ZeltTracker erscheint auf deinem Startbildschirm."
      : "Du kannst die Web-App weiterhin im Browser nutzen.");
  } catch {
    updateStatus("Öffne das Browser-Menü und wähle „Installieren“ oder „Zum Startbildschirm hinzufügen“.");
  } finally {
    installButton.hidden = true;
    installButton.disabled = false;
  }
});

window.addEventListener("appinstalled", () => {
  pendingInstall = null;
  if (installButton) installButton.hidden = true;
  updateStatus("ZeltTracker wurde installiert. Öffne es über deinen Startbildschirm.");
});

// Register only at the intended website path. The worker has no account access.
const secureOrigin = location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname);
if (secureOrigin && "serviceWorker" in navigator && location.pathname.startsWith("/zelttracker/")) {
  navigator.serviceWorker.register("/zelttracker/service-worker.js", { scope: "/zelttracker/", updateViaCache: "none" })
    .catch(() => { /* The portal remains available without offline installation support. */ });
}
