import { PortalClient, PortalError, buildProfilePayload, cameraSignalState, forecastState, formatMoney, normalizedServiceCode, normalizedTeamCode, safeReturnPath } from "./portal-core.mjs?v=20260924-1";

const client = new PortalClient();
const authRedirect = client.consumeAuthRedirect(location.href);
const state = {
  profile: null,
  dating: null,
  discover: [],
  matches: [],
  serviceStatus: null,
  teams: [],
  guestTable: null,
  guestRequests: [],
  pendingTableCode: null,
  selectedTeam: null,
  acceptingTeamID: null,
  busy: false,
};

let serviceHeartbeatTimer = null;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const text = value => document.createTextNode(String(value ?? ""));

function resetUserState() {
  stopServiceHeartbeat(false);
  state.profile = null;
  state.dating = null;
  state.discover = [];
  state.matches = [];
  state.serviceStatus = null;
  state.teams = [];
  state.guestTable = null;
  state.guestRequests = [];
  state.selectedTeam = null;
}

function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) node.append(child instanceof Node ? child : text(child));
  return node;
}

function clear(node) { node.replaceChildren(); return node; }

function setBusy(value, label = "Wird geladen …") {
  state.busy = value;
  $("#connection-status").textContent = value ? label : (navigator.onLine ? "Online" : "Offline");
  document.documentElement.toggleAttribute("aria-busy", value);
}

let toastTimer;
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 4200);
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
    toast(successMessage);
  } catch {
    window.prompt("Bitte kopiere diesen Link:", value);
  }
}

function handleError(error) {
  console.error(error);
  if (error instanceof PortalError && error.status === 401) {
    client.saveSession(null);
    resetUserState();
    renderAccount();
  }
  toast(error?.message ?? "Das hat gerade nicht geklappt.");
}

function showModal(title, content) {
  $("#modal-title").textContent = title;
  clear($("#modal-body")).append(content);
  if (!$("#modal").open) $("#modal").showModal();
}

function closeModal() {
  if ($("#modal").open) $("#modal").close();
  stopServiceHeartbeat();
}

function primary(label, onClick) {
  return element("button", { class: "primary", type: "button", onclick: onClick }, label);
}

function secondary(label, onClick) {
  return element("button", { class: "secondary", type: "button", onclick: onClick }, label);
}

function gate(title, message, label, action) {
  return element("div", {}, [
    element("h2", { text: title }),
    element("p", { class: "muted", text: message }),
    primary(label, action),
  ]);
}

function navigate(name) {
  const allowed = new Set(["home", "zam", "service", "lage", "account"]);
  const value = allowed.has(name) ? name : "home";
  if (value !== "service") stopServiceHeartbeat();
  if (location.hash !== `#/${value}`) history.pushState(null, "", `#/${value}`);
  showRoute(value);
}

function routeFromHash(hash) {
  const path = safeReturnPath(hash);
  if (path.startsWith("#/service/")) {
    return { path, view: "service", tableCode: path.slice("#/service/".length) };
  }
  return { path, view: path.slice(2), tableCode: null };
}

async function showRoute(name) {
  $$(".view").forEach(node => node.classList.toggle("active", node.dataset.view === name));
  $$(".bottom-nav [data-go]").forEach(node => node.classList.toggle("active", node.dataset.go === name));
  window.scrollTo({ top: 0, behavior: "instant" });
  try {
    if (name === "account") renderAccount();
    if (name === "zam") await loadZam();
    if (name === "service") await loadService();
    if (name === "lage") await loadSignals();
  } catch (error) { handleError(error); }
}

function showAuth() {
  const form = element("form", { class: "form-stack" });
  const email = element("input", { type: "email", name: "email", autocomplete: "email", required: true, maxlength: 254 });
  const password = element("input", { type: "password", name: "password", autocomplete: "current-password", required: true, minlength: 10, maxlength: 128 });
  const message = element("p", { class: "help-text", text: "Deine Sitzung bleibt nur in diesem Browser-Tab gespeichert." });
  const submit = element("button", { class: "primary", type: "submit" }, "Anmelden");
  form.append(
    element("label", {}, ["E-Mail", email]),
    element("label", {}, ["Passwort", password]),
    message,
    submit,
    element("div", { class: "button-row" }, [
      secondary("Konto erstellen", showSignUp),
      secondary("Passwort vergessen", async () => {
        try {
          await client.requestPasswordReset(email.value);
          message.className = "success";
          message.textContent = "Falls ein Konto besteht, wurde eine E-Mail zum Zurücksetzen versendet.";
        } catch (error) { message.className = "error"; message.textContent = error.message; }
      }),
    ]),
    element("p", { class: "help-text" }, ["Mit der Anmeldung gelten ", element("a", { href: "community.html", target: "_blank", rel: "noopener" }, "Spielregeln"), " und ", element("a", { href: "privacy.html", target: "_blank", rel: "noopener" }, "Datenschutz"), "."]),
  );
  form.addEventListener("submit", async event => {
    event.preventDefault();
    submit.disabled = true;
    message.className = "help-text";
    message.textContent = "Anmeldung läuft …";
    try {
      await client.signIn(email.value, password.value);
      resetUserState();
      closeModal();
      toast("Servus – du bist angemeldet.");
      renderAccount();
      await showRoute(routeFromHash(location.hash).view);
    } catch (error) { message.className = "error"; message.textContent = error.message; }
    finally { submit.disabled = false; }
  });
  showModal("Anmelden", form);
  setTimeout(() => email.focus(), 50);
}

function showSignUp() {
  const form = element("form", { class: "form-stack" });
  const email = element("input", { type: "email", autocomplete: "email", required: true, maxlength: 254 });
  const password = element("input", { type: "password", autocomplete: "new-password", required: true, minlength: 10, maxlength: 128 });
  const repeat = element("input", { type: "password", autocomplete: "new-password", required: true, minlength: 10, maxlength: 128 });
  const result = element("p", { class: "help-text", text: "Du erhältst anschließend eine E-Mail zur Bestätigung. Passwort und Codes gehören niemals in Profil oder Chat." });
  const submit = element("button", { class: "primary", type: "submit" }, "Konto sicher anlegen");
  form.append(
    element("label", {}, ["E-Mail", email]),
    element("label", {}, ["Passwort", password]),
    element("label", {}, ["Passwort wiederholen", repeat]),
    result,
    submit,
    secondary("Zur Anmeldung", showAuth),
  );
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (password.value !== repeat.value) {
      result.className = "error";
      result.textContent = "Die Passwörter stimmen nicht überein.";
      return;
    }
    submit.disabled = true;
    try {
      await client.signUp(email.value, password.value);
      result.className = "success";
      result.textContent = "Fast geschafft: Bitte bestätige jetzt die E-Mail und melde dich anschließend an.";
      password.value = "";
      repeat.value = "";
    } catch (error) { result.className = "error"; result.textContent = error.message; }
    finally { submit.disabled = false; }
  });
  showModal("Konto erstellen", form);
  setTimeout(() => email.focus(), 50);
}

function showPasswordReset() {
  const form = element("form", { class: "form-stack" });
  const password = element("input", { type: "password", autocomplete: "new-password", required: true, minlength: 10, maxlength: 128 });
  const repeat = element("input", { type: "password", autocomplete: "new-password", required: true, minlength: 10, maxlength: 128 });
  const result = element("p", { class: "help-text", text: "Wähle ein neues Passwort mit mindestens 10 Zeichen." });
  const submit = element("button", { class: "primary", type: "submit" }, "Neues Passwort speichern");
  form.append(element("label", {}, ["Neues Passwort", password]), element("label", {}, ["Passwort wiederholen", repeat]), result, submit);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (password.value !== repeat.value) { result.className = "error"; result.textContent = "Die Passwörter stimmen nicht überein."; return; }
    submit.disabled = true;
    try {
      await client.updatePassword(password.value);
      closeModal();
      toast("Dein Passwort wurde geändert.");
      navigate("account");
    } catch (error) { result.className = "error"; result.textContent = error.message; }
    finally { submit.disabled = false; }
  });
  showModal("Passwort zurücksetzen", form);
  setTimeout(() => password.focus(), 50);
}

async function ensureProfile() {
  if (!client.signedIn) return null;
  if (state.profile === null) state.profile = await client.community("profile");
  return state.profile;
}

function isOnline(profile) {
  return profile?.persistentDiscoverability === true ||
    Boolean(profile?.onlineUntil && new Date(profile.onlineUntil).getTime() > Date.now());
}

async function prepareJPEG(file) {
  if (!(file instanceof File) || !file.type.startsWith("image/")) throw new PortalError("Bitte wähle eine Bilddatei aus.");
  if (file.size > 15_000_000) throw new PortalError("Das Ausgangsbild ist zu groß. Bitte wähle ein Bild unter 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    if (image.naturalWidth < 256 || image.naturalHeight < 256) throw new PortalError("Das Profilbild muss mindestens 256 × 256 Pixel groß sein.");
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .84));
    if (!blob) throw new PortalError("Das Bild konnte nicht sicher vorbereitet werden.");
    if (blob.size > 3_000_000) throw new PortalError("Das vorbereitete Profilbild ist noch zu groß. Bitte wähle ein kleineres Bild.");
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

async function showProfileEditor() {
  if (!client.signedIn) return showAuth();
  try { if (state.profile && state.dating === null) state.dating = await client.community("dating-profile"); }
  catch (error) { handleError(error); return; }
  const existing = state.profile;
  const dating = state.dating;
  const form = element("form", { class: "form-stack" });
  const displayName = element("input", { required: true, minlength: 2, maxlength: 40, autocomplete: "nickname", value: existing?.displayName ?? "" });
  const bio = element("textarea", { maxlength: 280, placeholder: "Was macht einen guten Wiesn-Tag für dich aus?" });
  bio.value = existing?.bio ?? "";
  const intent = element("select");
  for (const [value, label] of [["friends", "Neue Freunde"], ["dating", "Kennenlernen / Date"], ["group", "Andere Gruppen"], ["none", "Goa nix – nicht suchen"]]) {
    const option = element("option", { value }, label);
    if ((existing?.intent ?? "friends") === value) option.selected = true;
    intent.append(option);
  }
  const birthDate = element("input", { type: "date", required: !existing, max: new Date().toISOString().slice(0, 10) });
  const intros = element("input", { type: "checkbox" });
  intros.checked = existing?.allowIntroductions ?? false;
  const consent = element("input", { type: "checkbox", required: true });
  consent.checked = existing?.termsVersion === "2026-09-18";
  const prompt = element("select");
  const promptOptions = [["", "Keine Profilfrage"], ["perfect_wiesn", "Mein perfekter Wiesn-Moment"], ["meet_me_at", "Triff mich am liebsten"], ["day_pace", "Mein Tempo für den Tag"], ["dancefloor", "Auf der Tanzfläche bin ich"], ["group_role", "In meiner Runde bin ich"]];
  for (const [value, label] of promptOptions) {
    const option = element("option", { value }, label);
    if ((dating?.promptKey ?? "") === value) option.selected = true;
    prompt.append(option);
  }
  const promptAnswer = element("input", { maxlength: 80, value: dating?.promptAnswer ?? "", placeholder: "Kurz und persönlich – höchstens 80 Zeichen" });
  const photo = element("input", { type: "file", accept: "image/*" });
  const result = element("p", { class: "help-text" });
  form.append(
    element("label", {}, ["Anzeigename", displayName]),
    element("label", {}, ["Kurz über dich", bio]),
    element("label", {}, ["Ich suche", intent]),
    ...(!existing ? [element("label", {}, ["Geburtsdatum", birthDate, element("small", { text: "Nur dein Alter wird öffentlich angezeigt. Ausschließlich ab 18." })])] : []),
    element("label", {}, ["Profilfrage", prompt]),
    element("label", {}, ["Deine Antwort", promptAnswer]),
    element("label", {}, ["Profilbild", photo, element("small", { text: dating?.photoStatus === "pending" ? "Dein aktuelles Bild wartet auf die Moderationsprüfung." : "Das Bild wird als JPEG verkleinert, privat gespeichert und vor der Anzeige moderiert." })]),
    element("label", { class: "check" }, [intros, element("span", { text: "Freunde dürfen Kontakte vorschlagen" })]),
    element("label", { class: "check" }, [consent, element("span", {}, ["Ich habe ", element("a", { href: "community.html", target: "_blank", rel: "noopener" }, "Spielregeln"), " und ", element("a", { href: "privacy.html", target: "_blank", rel: "noopener" }, "Datenschutz"), " gelesen."])]),
    result,
    element("button", { class: "primary", type: "submit" }, "Privat speichern"),
    element("p", { class: "help-text", text: "Ein neues Profil ist zunächst unsichtbar. Du entscheidest separat, wann du für höchstens zwei Stunden sichtbar wirst." }),
  );
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const payload = buildProfilePayload({
        displayName: displayName.value, bio: bio.value, intent: intent.value,
        birthDate: birthDate.value, acceptedTerms: consent.checked,
        allowIntroductions: intros.checked, onlineMinutes: 0,
      }, Boolean(existing));
      state.profile = await client.community("profile", { method: "PUT", body: payload });
      state.dating = await client.community("dating-profile", { method: "PUT", body: { promptKey: prompt.value, promptAnswer: prompt.value ? promptAnswer.value.trim() : "" } });
      state.dating = await client.community("dating-profile");
      if (photo.files?.[0]) state.dating = await client.uploadPhoto(await prepareJPEG(photo.files[0]));
      closeModal();
      toast("Profil sicher gespeichert.");
      await loadZam();
    } catch (error) { result.className = "error"; result.textContent = error.message; }
    finally { button.disabled = false; }
  });
  showModal(existing ? "Profil bearbeiten" : "Privates Profil anlegen", form);
}

async function updateVisibility(minutes) {
  const profile = await ensureProfile();
  if (!profile) return showProfileEditor();
  setBusy(true, minutes ? "Du wirst sichtbar …" : "Du wirst unsichtbar …");
  try {
    state.profile = await client.community("profile", { method: "PUT", body: {
      displayName: profile.displayName, bio: profile.bio, intent: profile.intent,
      onlineMinutes: minutes, allowIntroductions: profile.allowIntroductions,
      termsVersion: profile.termsVersion,
    } });
    toast(minutes ? "Du bist jetzt für zwei Stunden sichtbar." : "Du bist jetzt unsichtbar.");
    await loadZam();
  } finally { setBusy(false); }
}

async function loadZam() {
  const gateNode = clear($("#zam-gate"));
  const content = $("#zam-content");
  if (!client.signedIn) {
    content.hidden = true;
    gateNode.append(gate("Anmeldung erforderlich", "Zam zeigt Profile und Nachrichten nur nach einer geschützten Anmeldung.", "Anmelden", showAuth));
    return;
  }
  setBusy(true);
  try {
    const profile = await ensureProfile();
    if (!profile) {
      content.hidden = true;
      gateNode.append(gate("Dein Profil fehlt noch", "Du startest unsichtbar. Erst nach deiner ausdrücklichen Freigabe wirst du anderen Erwachsenen angezeigt.", "Profil anlegen", showProfileEditor));
      return;
    }
    content.hidden = false;
    const online = isOnline(profile);
    const persistent = profile.persistentDiscoverability === true;
    gateNode.append(element("div", {}, [
      element("h2", { text: online ? "Du bist sichtbar" : "Du bist unsichtbar" }),
      element("p", { class: "muted", text: persistent
        ? "Dein Profil bleibt auffindbar, bis du die Sichtbarkeit ausschaltest. Das sagt nichts über deine aktuelle Aktivität oder deinen Standort aus."
        : online ? "Die zeitlich begrenzte Sichtbarkeit endet automatisch. Du kannst sie jederzeit sofort beenden."
          : "Niemand Neues kann dein Profil gerade entdecken." }),
      primary(online ? "Jetzt unsichtbar werden" : "Für 2 Stunden sichtbar werden", () => updateVisibility(online ? 0 : 120)),
    ]));
    const [discover, matches] = await Promise.all([
      online && profile.intent !== "none" ? client.community("discover") : Promise.resolve([]),
      client.community("matches"),
    ]);
    state.discover = Array.isArray(discover) ? discover : [];
    state.matches = Array.isArray(matches) ? matches : [];
    renderDiscover();
    renderMatches();
  } finally { setBusy(false); }
}

function renderDiscover() {
  const panel = clear($("#discover-panel"));
  const profile = state.discover[0];
  if (!profile) {
    panel.append(element("div", { class: "empty" }, [element("strong", { text: "Gerade ganz entspannt hier." }), element("p", { text: "Es gibt aktuell keine weiteren sichtbaren Profile. Schau später wieder vorbei." })]));
    return;
  }
  const visualContent = profile.photoURL
    ? element("img", { class: "profile-photo", src: profile.photoURL, alt: `Profilbild von ${profile.displayName}` })
    : element("span", { class: "profile-initial", "aria-hidden": "true", text: profile.displayName.slice(0, 1).toUpperCase() });
  const visual = element("div", { class: "profile-visual" }, [
    visualContent,
    element("div", { class: "profile-title" }, [
      element("h2", { text: `${profile.displayName}, ${profile.age}` }),
      element("p", { text: ({ friends: "Neue Freunde", dating: "Kennenlernen / Date", group: "Andere Gruppen" })[profile.intent] ?? "Neue Leute" }),
    ]),
  ]);
  const card = element("article", { class: "profile-card" }, [
    visual,
    element("div", { class: "profile-body" }, [
      element("p", { text: profile.bio || "Mag gute Gesellschaft und einen entspannten Wiesn-Tag." }),
      ...(profile.promptAnswer ? [element("div", { class: "prompt-card" }, [element("small", { text: ({ perfect_wiesn: "Mein perfekter Wiesn-Moment", meet_me_at: "Triff mich am liebsten", day_pace: "Mein Tempo für den Tag", dancefloor: "Auf der Tanzfläche bin ich", group_role: "In meiner Runde bin ich" })[profile.promptKey] ?? "Über mich" }), element("strong", { text: profile.promptAnswer })])] : []),
      element("div", { class: "profile-actions" }, [
        secondary("Weiter", () => dismissProfile(profile.id)),
        primary("Servus sagen", () => likeProfile(profile)),
      ]),
      element("div", { class: "button-row" }, [
        element("button", { class: "secondary", type: "button", onclick: () => reportProfile(profile) }, "Melden / blockieren"),
      ]),
      element("p", { class: "help-text", text: "Nach rechts: Interesse · nach links: weiter. Ein Chat entsteht nur bei gegenseitigem Interesse." }),
    ]),
  ]);
  let startX = 0;
  card.addEventListener("pointerdown", event => {
    if (event.target.closest("button, a, input, select, textarea")) return;
    startX = event.clientX;
    card.setPointerCapture(event.pointerId);
  });
  card.addEventListener("pointermove", event => {
    if (!card.hasPointerCapture(event.pointerId)) return;
    const dx = Math.max(-120, Math.min(120, event.clientX - startX));
    card.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`;
  });
  card.addEventListener("pointerup", event => {
    if (!card.hasPointerCapture(event.pointerId)) return;
    const dx = event.clientX - startX;
    card.releasePointerCapture(event.pointerId);
    card.style.transform = "";
    if (dx > 90) likeProfile(profile);
    else if (dx < -90) dismissProfile(profile.id);
  });
  card.addEventListener("pointercancel", () => { card.style.transform = ""; });
  panel.append(card);
}

async function dismissProfile(id, recordPass = true) {
  state.discover = state.discover.filter(item => item.id !== id);
  renderDiscover();
  if (!recordPass) return;
  try { await client.community("passes", { method: "POST", body: { targetID: id } }); }
  catch (error) { console.warn("Pass konnte nicht gespeichert werden", error); }
}

async function likeProfile(profile) {
  if (state.busy) return;
  setBusy(true, "Interesse wird gesendet …");
  try {
    await client.community("likes", { method: "POST", body: { targetID: profile.id } });
    dismissProfile(profile.id, false);
    state.matches = await client.community("matches");
    renderMatches();
    const matched = state.matches.some(match => match.profile.id === profile.id);
    toast(matched ? "Ihr habt ein Match – der Chat ist offen." : "Interesse gesendet. Der Chat öffnet erst bei einem Match.");
  } catch (error) { handleError(error); }
  finally { setBusy(false); }
}

function reportProfile(profile) {
  const form = element("form", { class: "form-stack" });
  const reason = element("select");
  for (const [value, label] of [["harassment", "Belästigung"], ["underage", "Verdacht auf Minderjährigkeit"], ["fake_profile", "Täuschendes Profil"], ["unsafe_content", "Unsicherer Inhalt"], ["scam", "Betrugsverdacht"], ["other", "Sonstiges"]]) reason.append(element("option", { value }, label));
  const detail = element("textarea", { maxlength: 1000, placeholder: "Kurze sachliche Beschreibung (optional)" });
  const result = element("p", { class: "help-text" });
  form.append(element("p", { text: `${profile.displayName} melden oder blockieren. Eine Meldung wird nur der Moderation gezeigt.` }), element("label", {}, ["Grund", reason]), element("label", {}, ["Details", detail]), result,
    element("button", { class: "primary", type: "submit" }, "Meldung senden"),
    element("button", { class: "danger-button", type: "button", onclick: async () => {
      try { await client.community("blocks", { method: "POST", body: { targetID: profile.id } }); closeModal(); dismissProfile(profile.id); toast("Kontakt blockiert."); }
      catch (error) { result.className = "error"; result.textContent = error.message; }
    } }, "Nur blockieren"));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await client.community("reports", { method: "POST", body: { targetID: profile.id, reason: reason.value, detail: detail.value.trim() } });
      closeModal(); dismissProfile(profile.id); toast("Danke. Die Moderation prüft die Meldung.");
    } catch (error) { result.className = "error"; result.textContent = error.message; }
  });
  showModal("Melden oder blockieren", form);
}

function renderMatches() {
  $("#match-count").textContent = state.matches.length ? `(${state.matches.length})` : "";
  const panel = clear($("#matches-panel"));
  if (!state.matches.length) return panel.append(element("div", { class: "empty", text: "Noch keine Matches. Gegenseitiges Interesse öffnet einen privaten Chat." }));
  const list = element("div", { class: "match-list" });
  for (const match of state.matches) list.append(element("button", { class: "list-row", type: "button", onclick: () => showChat(match) }, [element("strong", { text: match.profile.displayName }), element("small", { text: "Privaten Chat öffnen →" })]));
  panel.append(list);
}

async function showChat(match) {
  const wrapper = element("div", { class: "form-stack" }, element("p", { class: "muted", text: "Respektvoll bleiben. Blockieren und Melden ist jederzeit möglich." }));
  const log = element("div", { class: "chat-log", role: "log", "aria-live": "polite" });
  const form = element("form", { class: "form-stack" });
  const input = element("textarea", { required: true, maxlength: 1000, placeholder: "Nachricht …" });
  const result = element("p", { class: "help-text" });
  form.append(element("label", {}, ["Nachricht", input]), result, element("button", { class: "primary", type: "submit" }, "Senden"));
  wrapper.append(log, form);
  showModal(`Chat mit ${match.profile.displayName}`, wrapper);
  const load = async () => {
    const messages = await client.call("community", "messages", { query: { matchID: match.id } });
    clear(log);
    for (const message of messages) {
      const bubble = element("div", { class: `bubble${message.senderID === client.session?.user?.id ? " mine" : ""}` });
      bubble.append(element("span", { text: message.body }));
      if (message.imageURL) bubble.append(element("img", {
        class: "chat-image", src: message.imageURL, alt: "Freigegebenes Chatbild", loading: "lazy",
      }));
      log.append(bubble);
    }
    log.scrollTop = log.scrollHeight;
  };
  try { await load(); } catch (error) { result.className = "error"; result.textContent = error.message; }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    try { await client.community("messages", { method: "POST", body: { matchID: match.id, body: input.value.trim() } }); input.value = ""; await load(); }
    catch (error) { result.className = "error"; result.textContent = error.message; }
  });
}

async function loadService() {
  const gateNode = clear($("#service-gate"));
  const content = $("#service-content");
  if (!client.signedIn) {
    content.hidden = true;
    gateNode.append(gate("Geschützt arbeiten", "Tischanfragen und Teamdaten sind nur nach Anmeldung sichtbar.", "Anmelden", showAuth));
    return;
  }
  setBusy(true);
  try {
    const profile = await ensureProfile();
    if (!profile) {
      content.hidden = true;
      gateNode.append(gate("Volljähriges Profil erforderlich", "Der Service ist ab 18. Dein Community-Profil darf dabei dauerhaft unsichtbar bleiben.", "Privates Profil anlegen", showProfileEditor));
      return;
    }
    content.hidden = false;
    const [status, teams, requests] = await Promise.all([client.service("status"), client.service("teams"), client.service("requests")]);
    state.serviceStatus = status;
    state.teams = Array.isArray(teams) ? teams : [];
    state.guestRequests = Array.isArray(requests) ? requests : [];
    if (state.pendingTableCode && !state.guestTable) {
      const code = normalizedServiceCode(state.pendingTableCode);
      state.pendingTableCode = null;
      try {
        state.guestTable = await client.service("table", { method: "POST", body: { code } });
        state.guestTable.code = code;
        history.replaceState(null, "", "#/service");
      } catch (error) {
        history.replaceState(null, "", "#/service");
        toast(error?.message ?? "Der Tischlink konnte nicht geöffnet werden.");
      }
    }
    gateNode.append(element("div", {}, [element("h2", { text: status.availableVenueIDs?.length ? "Service ist für Pilotbetriebe verfügbar" : "Noch kein Betrieb freigeschaltet" }), element("p", { class: "muted", text: status.availableVenueIDs?.length ? `${status.availableVenueIDs.length} Betrieb(e) sind aktuell technisch aktiviert.` : "Das Portal ist vorbereitet. Echte Anfragen werden erst nach Betreiberfreigabe aktiviert." })]));
    renderGuest();
    renderTeams();
  } finally { setBusy(false); }
}

function renderGuest() {
  const panel = clear($("#guest-panel"));
  if (state.guestTable) panel.append(renderGuestTable(state.guestTable));
  else {
    const form = element("form", { class: "form-stack panel-card" });
    const code = element("input", { required: true, autocomplete: "off", autocapitalize: "none", spellcheck: "false", placeholder: "QR-Link oder 64-stelliger Tischcode" });
    const message = element("p", { class: "help-text", text: "Am sichersten öffnest du den QR-Code direkt am Tisch." });
    form.append(element("h2", { text: "Welcher Tisch?" }), element("label", {}, ["Tischcode", code]), message, element("button", { class: "primary", type: "submit" }, "Tisch öffnen"));
    form.addEventListener("submit", async event => {
      event.preventDefault();
      try {
        const value = normalizedServiceCode(code.value);
        state.guestTable = await client.service("table", { method: "POST", body: { code: value } });
        state.guestTable.code = value;
        renderGuest();
      } catch (error) { message.className = "error"; message.textContent = error.message; }
    });
    panel.append(form);
  }
  renderGuestRequests(panel);
}

function renderGuestRequests(panel) {
  if (!state.guestRequests.length) return;
  const statusLabels = { new: "gesendet", accepted: "angenommen", preparing: "wird vorbereitet", delivered: "erledigt", declined: "abgelehnt", cancelled: "zurückgezogen", expired: "abgelaufen" };
  const kindLabels = { order: "Artikelanfrage", payment: "Zahlen bitte", service: "Bedienung gerufen" };
  const wrapper = element("details", { class: "panel-card", open: true }, [element("summary", {}, `Meine Anfragen (${state.guestRequests.length})`)]);
  for (const request of state.guestRequests.slice(0, 20)) {
    const title = request.kind === "order" ? `${request.quantity} × ${request.itemName}` : kindLabels[request.kind];
    const row = element("div", { class: "list-row static-row" }, [
      element("span", {}, [
        element("strong", { text: title }),
        element("small", { text: `${request.areaLabel}${request.rowLabel ? ` · ${request.rowLabel}` : ""} · Tisch ${request.tableLabel} · ${statusLabels[request.state] ?? request.state}` }),
      ]),
    ]);
    if (request.state === "new") row.append(secondary("Zurückziehen", async () => {
      try {
        const updated = await client.service("requests/state", { method: "POST", body: { requestID: request.id, expectedVersion: request.version, state: "cancelled" } });
        state.guestRequests = state.guestRequests.map(item => item.id === updated.id ? updated : item);
        renderGuest();
      } catch (error) { handleError(error); }
    }));
    wrapper.append(row);
  }
  wrapper.append(secondary("Status aktualisieren", () => loadService().catch(handleError)));
  panel.append(wrapper);
}

function renderGuestTable(table) {
  const wrapper = element("div", { class: "form-stack" });
  wrapper.append(element("div", { class: "panel-card" }, [
    element("h2", { text: `${table.areaLabel}${table.rowLabel ? ` · ${table.rowLabel}` : ""} · Tisch ${table.tableLabel}` }),
    element("p", { class: "muted", text: `${table.teamName} · ${table.accepting ? "nimmt gerade Anfragen an" : "ist gerade nicht erreichbar"}` }),
    secondary("Anderen Tisch öffnen", () => { state.guestTable = null; renderGuest(); }),
  ]));
  if (!table.accepting) return wrapper;
  const kinds = [["service", "Bedienung rufen"], ["payment", "Zahlen bitte"]];
  const grid = element("div", { class: "feature-grid" });
  for (const [kind, label] of kinds) grid.append(primary(label, () => confirmGuestRequest(table, kind)));
  wrapper.append(grid);
  if (table.menu?.length) {
    const menu = element("div", { class: "panel-card" }, element("h2", { text: "Verfügbare Artikel" }));
    for (const item of table.menu.filter(entry => entry.available)) menu.append(element("button", { class: "list-row", type: "button", onclick: () => confirmGuestRequest(table, "order", item) }, [element("strong", { text: item.name }), element("small", { text: `${formatMoney(item.priceCents)} · unverbindlich anfragen` })]));
    wrapper.append(menu);
  }
  wrapper.append(element("p", { class: "help-text", text: "Eine Anfrage ist keine bestätigte Bestellung. Das Team muss sie zuerst annehmen; Zahlung erfolgt vor Ort." }));
  return wrapper;
}

function confirmGuestRequest(table, kind, item = null) {
  const wrapper = element("div", { class: "form-stack" });
  const quantity = element("input", { type: "number", min: 1, max: 10, value: 1 });
  const result = element("p", { class: "help-text" });
  let pendingBody = null;
  let sending = false;
  wrapper.append(element("p", { text: item ? `${item.name} für ${formatMoney(item.priceCents)} je Stück unverbindlich anfragen?` : (kind === "payment" ? "Dem Team mitteilen, dass du zahlen möchtest?" : "Die Bedienung unverbindlich an den Tisch rufen?") }));
  if (item) wrapper.append(element("label", {}, ["Menge", quantity]));
  const submit = primary("Anfrage jetzt senden", async () => {
    if (sending) return;
    sending = true;
    submit.disabled = true;
    try {
      if (!pendingBody) {
        const amount = Number(quantity.value);
        if (item && (!Number.isInteger(amount) || amount < 1 || amount > 10)) {
          throw new Error("Bitte wähle eine Menge zwischen 1 und 10.");
        }
        pendingBody = { requestID: crypto.randomUUID(), kind, code: table.code };
        if (item) Object.assign(pendingBody, { itemID: item.id, quantity: amount, confirmedPriceCents: item.priceCents });
        quantity.disabled = true;
      }
      const request = await client.service("requests", { method: "POST", body: pendingBody });
      state.guestRequests = [request, ...state.guestRequests.filter(item => item.id !== request.id)];
      closeModal(); renderGuest(); toast("Anfrage gesendet. Das Team muss sie noch annehmen.");
    } catch (error) { result.className = "error"; result.textContent = error.message; }
    finally { sending = false; submit.disabled = false; }
  });
  wrapper.append(result, submit);
  showModal("Anfrage bestätigen", wrapper);
}

function renderTeams() {
  const panel = clear($("#team-panel"));
  if (state.teams.length) {
    const list = element("div", { class: "team-list" });
    for (const team of state.teams) list.append(element("button", { class: "list-row", type: "button", onclick: () => loadTeamBoard(team.id) }, [element("strong", { text: team.name }), element("small", { text: `${team.venueID} · ${team.memberCount}/7 Personen · Portal öffnen →` })]));
    panel.append(list);
  } else {
    panel.append(element("div", { class: "empty" }, [element("strong", { text: "Noch keinem Service-Team zugeordnet." }), element("p", { text: "Mit einem Einladungscode kannst du einem Team beitreten. Neue Teams benötigen eine geprüfte Betreiberfreigabe." })]));
  }

  const setup = element("details", { class: "panel-card", open: !state.teams.length });
  setup.append(element("summary", {}, "Team starten oder beitreten"));
  const join = element("form", { class: "form-stack compact-form" });
  const joinCode = element("input", { required: true, autocomplete: "off", autocapitalize: "none", spellcheck: "false", placeholder: "64-stelliger Teamcode" });
  const joinResult = element("p", { class: "help-text", text: "Einladungscodes gelten höchstens 30 Minuten." });
  join.append(element("h3", { text: "Team beitreten" }), element("label", {}, ["Teamcode", joinCode]), joinResult, element("button", { class: "secondary", type: "submit" }, "Beitreten"));
  join.addEventListener("submit", async event => {
    event.preventDefault();
    const button = join.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const team = await client.service("teams/join", { method: "POST", body: { code: normalizedTeamCode(joinCode.value) } });
      toast(`Du bist jetzt in ${team.name}.`);
      await loadService();
      selectTab("service", "team");
      await loadTeamBoard(team.id);
    } catch (error) { joinResult.className = "error"; joinResult.textContent = error.message; }
    finally { button.disabled = false; }
  });
  setup.append(join);

  const venues = state.serviceStatus?.availableVenueIDs ?? [];
  if (venues.length) {
    const create = element("form", { class: "form-stack compact-form" });
    const venue = element("select");
    for (const id of venues) venue.append(element("option", { value: id }, id));
    const name = element("input", { required: true, minlength: 2, maxlength: 40, placeholder: "z. B. Team Nord" });
    const createResult = element("p", { class: "help-text", text: "Das Anlegen funktioniert nur mit einer zuvor geprüften Betreiberrolle für diesen Betrieb." });
    create.append(element("h3", { text: "Neues Team" }), element("label", {}, ["Betrieb", venue]), element("label", {}, ["Teamname", name]), createResult, element("button", { class: "secondary", type: "submit" }, "Team anlegen"));
    create.addEventListener("submit", async event => {
      event.preventDefault();
      const button = create.querySelector("button[type=submit]");
      button.disabled = true;
      try {
        const team = await client.service("teams", { method: "POST", body: { venueID: venue.value, name: name.value.trim() } });
        toast(`${team.name} wurde angelegt.`);
        await loadService();
        selectTab("service", "team");
        await loadTeamBoard(team.id);
      } catch (error) { createResult.className = "error"; createResult.textContent = error.message; }
      finally { button.disabled = false; }
    });
    setup.append(create);
  }
  panel.append(setup);
}

function stopServiceHeartbeat(notifyServer = true) {
  if (serviceHeartbeatTimer) clearInterval(serviceHeartbeatTimer);
  serviceHeartbeatTimer = null;
  const teamID = state.acceptingTeamID;
  state.acceptingTeamID = null;
  if (notifyServer && teamID && client.signedIn) {
    client.service("teams/heartbeat", { method: "POST", body: { teamID, accepting: false } }).catch(() => {});
  }
}

async function setServiceAccepting(teamID, accepting) {
  stopServiceHeartbeat(false);
  await client.service("teams/heartbeat", { method: "POST", body: { teamID, accepting } });
  if (accepting) {
    state.acceptingTeamID = teamID;
    serviceHeartbeatTimer = setInterval(() => {
      if (document.hidden || state.acceptingTeamID !== teamID) return;
      client.service("teams/heartbeat", { method: "POST", body: { teamID, accepting: true } })
        .catch(() => stopServiceHeartbeat(false));
    }, 45_000);
  }
  await loadTeamBoard(teamID);
}

async function loadTeamBoard(teamID) {
  setBusy(true, "Team wird geladen …");
  try {
    const board = await client.service("teams/board", { query: { teamID } });
    state.selectedTeam = board;
    const wrapper = element("div", { class: "form-stack" });
    const ownID = client.session?.user?.id;
    const member = board.members.find(item => item.id === ownID);
    const isLeader = board.team.leaderID === ownID;
    const ownAccepting = state.acceptingTeamID === teamID || Boolean(member?.accepting);
    const headerActions = element("div", { class: "button-row" }, [
      primary(ownAccepting ? "Anfragen pausieren" : "Anfragen annehmen", () => setServiceAccepting(teamID, !ownAccepting).catch(handleError)),
      secondary("Aktualisieren", () => loadTeamBoard(teamID)),
    ]);
    if (isLeader) headerActions.append(element("button", { class: "danger-button", type: "button", onclick: async () => {
      if (!window.confirm("Diese Schicht wirklich für alle beenden? Offene Anfragen werden geschlossen und Tischlinks deaktiviert.")) return;
      try {
        stopServiceHeartbeat(false);
        await client.service("teams/end", { method: "POST", body: { teamID } });
        closeModal();
        await loadService();
        toast("Die Schicht wurde beendet.");
      } catch (error) { handleError(error); }
    } }, "Schicht beenden"));
    wrapper.append(element("div", { class: "panel-card" }, [
      element("h2", { text: board.team.name }),
      element("p", { class: "muted", text: `${board.tables.length} Tische · ${board.members.length} Personen · ${board.requests.filter(item => ["new", "accepted", "preparing"].includes(item.state)).length} offene Anfragen` }),
      element("p", { class: ownAccepting ? "success" : "help-text", text: ownAccepting ? "Du bist für neue Tischanfragen erreichbar. Diese Bereitschaft endet beim Schließen oder nach 90 Sekunden ohne Lebenszeichen." : (board.team.accepting ? "Ein anderes Teammitglied nimmt gerade Anfragen an." : "Gerade nimmt niemand neue Anfragen an.") }),
      headerActions,
    ]));
    const requests = element("div", { class: "request-list" });
    for (const request of board.requests.filter(item => ["new", "accepted", "preparing"].includes(item.state))) {
      const actions = element("div", { class: "button-row" });
      if (request.state === "new") actions.append(primary("Annehmen", () => transitionRequest(teamID, request, "accepted")), secondary("Ablehnen", () => transitionRequest(teamID, request, "declined")));
      else if (request.state === "accepted") actions.append(primary(request.kind === "order" ? "In Vorbereitung" : "Erledigt", () => transitionRequest(teamID, request, request.kind === "order" ? "preparing" : "delivered")));
      else if (request.state === "preparing") actions.append(primary("Als gebracht bestätigen", () => transitionRequest(teamID, request, "delivered")));
      requests.append(element("article", { class: "panel-card" }, [element("h3", { text: request.kind === "order" ? `${request.quantity} × ${request.itemName}` : (request.kind === "payment" ? "Zahlen bitte" : "Bedienung gerufen") }), element("p", { class: "muted", text: `${request.areaLabel}${request.rowLabel ? ` · ${request.rowLabel}` : ""} · Tisch ${request.tableLabel}` }), actions]));
    }
    if (!requests.childElementCount) requests.append(element("div", { class: "empty", text: "Keine offenen Anfragen." }));
    wrapper.append(requests);

    const people = element("details", { class: "panel-card" }, [element("summary", {}, `Team (${board.members.length}/7)`)]);
    for (const person of board.members) {
      const personRow = element("div", { class: "list-row static-row" }, [
        element("span", {}, [element("strong", { text: person.displayName }), element("small", { text: `${person.isLeader ? "Leitung · " : ""}${person.accepting ? "erreichbar" : "pausiert"}` })]),
      ]);
      if (!person.isLeader && (isLeader || person.id === ownID)) personRow.append(secondary(person.id === ownID ? "Team verlassen" : "Entfernen", async () => {
        if (!window.confirm(person.id === ownID ? "Dieses Team wirklich verlassen?" : `${person.displayName} wirklich aus dem Team entfernen?`)) return;
        try {
          await client.service("teams/member-remove", { method: "POST", body: { teamID, memberID: person.id } });
          if (person.id === ownID) { closeModal(); await loadService(); }
          else await loadTeamBoard(teamID);
        } catch (error) { handleError(error); }
      }));
      people.append(personRow);
    }
    if (isLeader) {
      const inviteResult = element("p", { class: "help-text", text: "Ein neuer Code ersetzt den vorherigen und gilt höchstens 30 Minuten." });
      people.append(inviteResult, secondary("Einladungscode erzeugen", async () => {
        try {
          const invite = await client.service("teams/invite", { method: "POST", body: { teamID } });
          inviteResult.className = "invite-code";
          inviteResult.textContent = `${invite.code} · gültig bis ${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(invite.expiresAt))}`;
        } catch (error) { inviteResult.className = "error"; inviteResult.textContent = error.message; }
      }));
    }
    wrapper.append(people);

    const tables = element("details", { class: "panel-card" }, [element("summary", {}, `Tische (${board.tables.length})`)]);
    for (const table of board.tables) {
      const tableLink = `https://hoammade.de/zelttracker/portal.html#/service/${table.code}`;
      const tableRow = element("div", { class: "list-row static-row" }, [
        element("span", {}, [
          element("strong", { text: `${table.areaLabel}${table.rowLabel ? ` · ${table.rowLabel}` : ""} · Tisch ${table.tableLabel}` }),
          element("small", { class: "code-line", text: `QR-/Weblink: ${tableLink}` }),
        ]),
      ]);
      const tableActions = element("div", { class: "button-row" }, [secondary("Link kopieren", () => copyText(tableLink, "Tischlink kopiert."))]);
      if (isLeader) tableActions.append(secondary("Entfernen", async () => {
          if (!window.confirm(`Tisch ${table.tableLabel} wirklich deaktivieren?`)) return;
          try { await client.service("teams/table-remove", { method: "POST", body: { teamID, tableID: table.id } }); await loadTeamBoard(teamID); }
          catch (error) { handleError(error); }
        }));
      tableRow.append(tableActions);
      tables.append(tableRow);
    }
    if (isLeader) tables.append(teamTableForm(teamID));
    wrapper.append(tables);

    const menu = element("details", { class: "panel-card" }, [element("summary", {}, `Angebot (${board.menu.length})`)]);
    for (const item of board.menu) menu.append(element("div", { class: "list-row static-row" }, [
      element("span", {}, [element("strong", { text: item.name }), element("small", { text: `${formatMoney(item.priceCents)} · ${item.available ? "sichtbar" : "pausiert"}` })]),
      ...(isLeader ? [secondary(item.available ? "Pausieren" : "Aktivieren", async () => {
        try { await client.service("teams/menu", { method: "PUT", body: { teamID, itemID: item.id, name: item.name, priceCents: item.priceCents, available: !item.available } }); await loadTeamBoard(teamID); }
        catch (error) { handleError(error); }
      })] : []),
    ]));
    if (isLeader) menu.append(teamMenuForm(teamID));
    wrapper.append(menu);

    const chat = element("details", { class: "panel-card", open: true }, [element("summary", {}, `Teamchat (${board.messages.length})`)]);
    const chatLog = element("div", { class: "chat-log team-chat", role: "log", "aria-live": "polite" });
    for (const message of [...board.messages].reverse()) chatLog.append(element("div", { class: `bubble${message.senderID === ownID ? " mine" : ""}` }, [
      element("strong", { text: message.senderName }),
      element("span", { text: message.body }),
    ]));
    if (!board.messages.length) chatLog.append(element("div", { class: "empty", text: "Noch keine internen Nachrichten." }));
    chat.append(chatLog, teamMessageForm(teamID));
    wrapper.append(chat);
    showModal(board.team.name, wrapper);
  } catch (error) { handleError(error); }
  finally { setBusy(false); }
}

function teamTableForm(teamID) {
  const form = element("form", { class: "form-stack compact-form" });
  const area = element("input", { required: true, maxlength: 40, placeholder: "Bereich" });
  const row = element("input", { maxlength: 30, placeholder: "Reihe (optional)" });
  const table = element("input", { required: true, maxlength: 20, placeholder: "Tischnummer" });
  const result = element("p", { class: "help-text", text: "Nach dem Speichern entsteht ein neuer zufälliger Tischcode für den QR-Hinweis am Tisch." });
  form.append(element("h3", { text: "Tisch hinzufügen" }), element("label", {}, ["Bereich", area]), element("label", {}, ["Reihe", row]), element("label", {}, ["Tisch", table]), result, element("button", { class: "secondary", type: "submit" }, "Tisch speichern"));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await client.service("teams/tables", { method: "POST", body: { teamID, areaLabel: area.value.trim(), rowLabel: row.value.trim(), tableLabel: table.value.trim() } });
      await loadTeamBoard(teamID);
    } catch (error) { result.className = "error"; result.textContent = error.message; }
  });
  return form;
}

function teamMenuForm(teamID) {
  const form = element("form", { class: "form-stack compact-form" });
  const name = element("input", { required: true, maxlength: 60, placeholder: "Artikel" });
  const price = element("input", { type: "number", required: true, min: 0, max: 1000, step: "0.01", placeholder: "Preis in Euro" });
  const result = element("p", { class: "help-text", text: "Preise werden Gästen vor jeder unverbindlichen Anfrage erneut angezeigt." });
  form.append(element("h3", { text: "Artikel hinzufügen" }), element("label", {}, ["Name", name]), element("label", {}, ["Preis", price]), result, element("button", { class: "secondary", type: "submit" }, "Artikel speichern"));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const priceCents = Math.round(Number(price.value) * 100);
    if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100000) { result.className = "error"; result.textContent = "Bitte gib einen gültigen Preis ein."; return; }
    try {
      await client.service("teams/menu", { method: "PUT", body: { teamID, itemID: crypto.randomUUID(), name: name.value.trim(), priceCents, available: true } });
      await loadTeamBoard(teamID);
    } catch (error) { result.className = "error"; result.textContent = error.message; }
  });
  return form;
}

function teamMessageForm(teamID) {
  const form = element("form", { class: "form-stack compact-form" });
  const body = element("textarea", { required: true, maxlength: 500, placeholder: "Kurze interne Nachricht ans Team …" });
  const result = element("p", { class: "help-text", text: "Nur Mitglieder dieses Teams sehen die Nachricht." });
  form.append(element("label", {}, ["Nachricht", body]), result, element("button", { class: "secondary", type: "submit" }, "Im Team senden"));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await client.service("teams/messages", { method: "POST", body: { teamID, messageID: crypto.randomUUID(), body: body.value.trim() } });
      await loadTeamBoard(teamID);
    } catch (error) { result.className = "error"; result.textContent = error.message; }
  });
  return form;
}

async function transitionRequest(teamID, request, next) {
  setBusy(true, "Status wird aktualisiert …");
  try {
    await client.service("requests/state", { method: "POST", body: { requestID: request.id, expectedVersion: request.version, state: next } });
    await loadTeamBoard(teamID);
  } catch (error) { handleError(error); }
  finally { setBusy(false); }
}

async function loadSignals() {
  const forecastPanel = clear($("#forecast-panel"));
  const summary = clear($("#signal-summary"));
  const list = clear($("#signal-list"));
  setBusy(true, "Lage wird geladen …");
  try {
    const [forecastRequest, signalRequest] = await Promise.allSettled([client.forecast(), client.signals()]);
    const forecast = forecastRequest.status === "fulfilled" ? forecastRequest.value : null;
    const signals = signalRequest.status === "fulfilled" ? signalRequest.value : [];
    const values = Array.isArray(signals) ? signals : [];
    const now = Date.now();
    const forecastPresentation = forecastState(forecast, now);
    if (forecastPresentation.current) {
      const basis = element("div", { class: "forecast-basis", "aria-label": "Datengrundlagen" });
      for (const contributor of Array.isArray(forecast.contributors) ? forecast.contributors : []) {
        basis.append(element("span", { class: "badge", text: `${contributor.label}: ${contributor.influencePercent}%` }));
      }
      forecastPanel.append(
        element("p", { class: "eyebrow", text: `${forecast.horizonMinutes ?? 30}-Minuten-Tendenz fürs Gelände` }),
        element("div", { class: "forecast-score" }, [
          element("div", {}, [element("h2", { text: forecast.statusLabel ?? "Vorsichtige Schätzung" }), element("small", { class: "muted", text: forecast.trendLabel ?? "Trend noch offen" })]),
          element("strong", { text: `${forecastPresentation.score}/100` }),
        ]),
        element("div", { class: "signal-meter", role: "img", "aria-label": `Prognoseindex ${forecastPresentation.score} von 100` }, element("span", { style: `width:${forecastPresentation.score}%` })),
        element("p", { class: "muted", text: forecast.explanation }),
        element("p", { class: "help-text", text: `${forecastPresentation.isLive ? "Frische Signale einbezogen" : "Nur Zeitmuster – kein frisches Live-Signal"} · ${forecast.confidenceLabel ?? "niedrige Datensicherheit"}` }),
        basis,
        element("p", { class: "help-text", text: forecast.limitation }),
      );
    } else {
      forecastPanel.append(element("h2", { text: "Noch keine belastbare Tendenz" }), element("p", { class: "muted", text: "Der Prognosepool liefert nur zeitgestempelte Ergebnisse. Veraltete Antworten werden nicht angezeigt." }));
    }
    if (!values.length) {
      summary.append(element("h2", { text: "Noch keine aktuellen Messwerte" }), element("p", { class: "muted", text: "Die Kamera-Auswertung wird vorbereitet. Es werden keine Streams oder Einzelbilder in diesem Portal gezeigt." }));
      return;
    }
    const fresh = values.filter(item => cameraSignalState(item, now).current);
    summary.append(element("h2", { text: `${fresh.length} aktuelle Signale` }), element("p", { class: "muted", text: "Zuletzt automatisch aktualisiert. Quelle, Alter und Unsicherheit bleiben sichtbar." }));
    for (const signal of values) {
      const presentation = cameraSignalState(signal, now);
      const time = presentation.observedAt !== null
        ? new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(presentation.observedAt))
        : "kein aktueller Messwert";
      const statusLabel = presentation.current ? signal.statusLabel : "Derzeit kein aktuelles Signal";
      const confidenceLabel = presentation.current ? (signal.confidenceLabel ?? "Schätzung") : "kein aktueller Messwert";
      const detail = presentation.current ? (signal.detail ?? "Anonymes Dichtesignal ohne Einlassgarantie.") : "Der Messwert ist nicht aktuell.";
      const meterLabel = presentation.current ? `${statusLabel}: relativer Dichteindex ${presentation.level} von 100` : statusLabel;
      list.append(element("article", { class: "signal-card" }, [
        element("div", { class: "signal-top" }, [element("div", {}, [element("h2", { text: signal.label }), element("small", { class: "muted", text: presentation.observedAt !== null ? `Stand ${time}` : time })]), element("span", { class: "badge", text: confidenceLabel })]),
        element("div", { class: "signal-meter", role: "img", "aria-label": meterLabel }, element("span", { style: `width:${presentation.level}%` })),
        element("strong", { text: `${statusLabel}${presentation.current ? ` · Dichteindex ${presentation.level}/100` : ""}` }),
        element("p", { class: "muted", text: detail }),
      ]));
    }
  } catch (error) {
    summary.append(element("h2", { text: "Messdienst wird eingerichtet" }), element("p", { class: "muted", text: "Das Portal ist vorbereitet; bis zur geprüften Aktivierung werden keine Kamera-Auslastungswerte behauptet." }));
    if (error.status !== 404) console.warn(error);
  } finally { setBusy(false); }
}

function renderAccount() {
  const panel = clear($("#account-panel"));
  $("#account-button").textContent = client.signedIn ? "✓" : "◉";
  if (!client.signedIn) {
    panel.append(gate("Noch nicht angemeldet", "Der öffentliche Lageüberblick funktioniert ohne Konto. Community und Service sind geschützt.", "Anmelden oder Konto erstellen", showAuth));
    return;
  }
  const email = client.session?.user?.email ?? "Angemeldetes Konto";
  const actions = [
    element("div", {}, [element("h2", { text: email }), element("p", { class: "muted", text: "Die Sitzung liegt ausschließlich in diesem Browser-Tab." })]),
    primary("Profil bearbeiten", async () => { try { await ensureProfile(); showProfileEditor(); } catch (error) { handleError(error); } }),
    ...(state.profile?.isModerator ? [secondary("Moderation öffnen", showModeration)] : []),
    secondary("Sicher abmelden", async () => { await client.signOut(); resetUserState(); renderAccount(); toast("Auf diesem Gerät abgemeldet."); }),
    element("button", { class: "danger-button", type: "button", onclick: showDeleteAccount }, "Konto dauerhaft löschen"),
  ];
  panel.append(element("div", { class: "panel-card form-stack" }, actions));
}

async function showModeration() {
  const wrapper = element("div", { class: "form-stack" }, element("p", { class: "muted", text: "Private Prüfoberfläche. Entscheidungen werden serverseitig protokolliert." }));
  const content = element("div", { class: "form-stack" }, element("p", { text: "Wird geladen …" }));
  wrapper.append(content);
  showModal("Moderation", wrapper);
  const load = async () => {
    const [reportsResult, photosResult] = await Promise.allSettled([
      client.call("community", "moderation/reports"),
      client.community("moderation/photos"),
    ]);
    if (reportsResult.status === "rejected") throw reportsResult.reason;
    if (photosResult.status === "rejected") throw photosResult.reason;
    const reports = reportsResult.value;
    const photos = photosResult.value;
    clear(content);
    content.append(element("h3", { text: `Profilbilder (${photos.length})` }));
    if (!photos.length) content.append(element("p", { class: "muted", text: "Keine ausstehenden Profilbilder." }));
    for (const photo of photos) {
      const card = element("article", { class: "panel-card form-stack" });
      if (photo.photoURL) card.append(element("img", { class: "moderation-photo", src: photo.photoURL, alt: `Zu prüfendes Profilbild von ${photo.displayName}` }));
      const decidePhoto = async approve => {
        try {
          await client.community("moderation/photos", { method: "POST", body: {
            targetID: photo.id, approve, slot: photo.slot ?? 1, photoRevision: photo.photoRevision,
          } });
        } catch (error) { handleError(error); }
        await load();
      };
      card.append(element("strong", { text: `${photo.displayName} · Bild ${photo.slot ?? 1}` }), element("div", { class: "button-row" }, [
        primary("Freigeben", () => decidePhoto(true).catch(handleError)),
        secondary("Ablehnen", () => decidePhoto(false).catch(handleError)),
      ]));
      content.append(card);
    }
    content.append(element("h3", { text: `Meldungen (${reports.length})` }));
    if (!reports.length) content.append(element("p", { class: "muted", text: "Keine offenen Meldungen." }));
    for (const report of reports) {
      const card = element("article", { class: "panel-card form-stack" }, [
        element("strong", { text: report.reason }),
        element("p", { text: report.detail || "Keine zusätzlichen Angaben." }),
        ...(report.contentSnapshot ? [element("p", { class: "muted", text: `Nachweis: ${report.contentSnapshot}` })] : []),
        ...(report.imageURL ? [element("img", { class: "moderation-photo", src: report.imageURL,
          alt: "Gemeldetes privates Chatbild" })] : []),
      ]);
      const decide = async action => { await client.community("moderation/actions", { method: "POST", body: { reportID: report.id, action } }); await load(); };
      card.append(element("div", { class: "button-row" }, [primary("Inhalt entfernen", () => decide("remove_content").catch(handleError)), secondary("Abweisen", () => decide("dismiss").catch(handleError)), element("button", { class: "danger-button", type: "button", onclick: () => decide("suspend_user").catch(handleError) }, "Konto sperren")]));
      content.append(card);
    }
  };
  try { await load(); } catch (error) { clear(content).append(element("p", { class: "error", text: error.message })); }
}

function showDeleteAccount() {
  const wrapper = element("div", { class: "form-stack" });
  const confirmation = element("input", { autocomplete: "off", placeholder: "LÖSCHEN" });
  const result = element("p", { class: "help-text", text: "Diese Aktion entfernt dein Konto und die dazugehörigen aktiven Community-Daten unwiderruflich." });
  wrapper.append(element("p", { text: "Schreibe LÖSCHEN, um die endgültige Kontolöschung zu bestätigen." }), confirmation, result,
    element("button", { class: "danger-button", type: "button", onclick: async () => {
      if (confirmation.value !== "LÖSCHEN") { result.className = "error"; result.textContent = "Bitte schreibe exakt LÖSCHEN."; return; }
      try { await client.deleteAccount(); resetUserState(); closeModal(); renderAccount(); toast("Dein Konto wurde gelöscht."); }
      catch (error) { result.className = "error"; result.textContent = error.message; }
    } }, "Endgültig löschen"));
  showModal("Konto löschen", wrapper);
}

function selectTab(kind, value) {
  $$(`[data-${kind}-tab]`).forEach(button => button.setAttribute("aria-selected", button.dataset[`${kind}Tab`] === value ? "true" : "false"));
  if (kind === "zam") {
    $("#discover-panel").hidden = value !== "discover";
    $("#matches-panel").hidden = value !== "matches";
  } else {
    $("#guest-panel").hidden = value !== "guest";
    $("#team-panel").hidden = value !== "team";
  }
}

document.addEventListener("click", event => {
  const go = event.target.closest("[data-go]");
  if (go) navigate(go.dataset.go);
  if (event.target.closest("[data-close-modal]")) closeModal();
  if (event.target.closest("[data-action=edit-profile]")) showProfileEditor().catch(handleError);
  if (event.target.closest("[data-action=refresh-service]")) loadService().catch(handleError);
  if (event.target.closest("[data-action=refresh-signals]")) loadSignals().catch(handleError);
  const zamTab = event.target.closest("[data-zam-tab]");
  if (zamTab) selectTab("zam", zamTab.dataset.zamTab);
  const serviceTab = event.target.closest("[data-service-tab]");
  if (serviceTab) selectTab("service", serviceTab.dataset.serviceTab);
});

$("#account-button").addEventListener("click", () => navigate("account"));
window.addEventListener("popstate", () => {
  const route = routeFromHash(location.hash);
  state.pendingTableCode = route.tableCode;
  showRoute(route.view);
});
window.addEventListener("online", () => setBusy(false));
window.addEventListener("offline", () => setBusy(false));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.acceptingTeamID) {
    client.service("teams/heartbeat", { method: "POST", body: { teamID: state.acceptingTeamID, accepting: true } })
      .catch(() => stopServiceHeartbeat(false));
  }
});
$("#modal").addEventListener("click", event => {
  if (event.target === $("#modal")) closeModal();
});
$("#modal").addEventListener("close", () => stopServiceHeartbeat());

const initial = routeFromHash(location.hash);
state.pendingTableCode = initial.tableCode;
if (authRedirect || location.hash !== initial.path) history.replaceState(null, "", authRedirect ? "#/account" : initial.path);
renderAccount();
showRoute(authRedirect ? "account" : initial.view);
if (authRedirect?.type === "recovery") showPasswordReset();
else if (authRedirect?.type === "error") toast(authRedirect.message);
else if (authRedirect) toast("E-Mail bestätigt – du bist jetzt angemeldet.");
