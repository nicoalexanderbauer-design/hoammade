export const CONFIG = Object.freeze({
  supabaseURL: "https://hoapjescptzslmyblsiy.supabase.co",
  publishableKey: "sb_publishable_P2ARQtncciqqwCrBNWsbyw_Q-vWqLMl",
  authReturnURL: "https://hoammade.de/zelttracker/portal.html",
  termsVersion: "2026-09-18",
  sessionKey: "zelttracker.portal.session.v1",
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^[0-9a-f]{64}$/;

export function normalizedEmail(value) {
  const result = String(value ?? "").trim().toLowerCase();
  if (result.length > 254 || !EMAIL.test(result)) throw new PortalError("Bitte prüfe deine E-Mail-Adresse.", 400, "INVALID_EMAIL");
  return result;
}

export function validatedPassword(value) {
  const result = String(value ?? "");
  if (result.length < 10 || result.length > 128) throw new PortalError("Das Passwort muss 10 bis 128 Zeichen lang sein.", 400, "INVALID_PASSWORD");
  return result;
}

export function normalizedServiceCode(value) {
  const result = String(value ?? "").trim().toLowerCase().replace(/^zelttracker:\/\/table\//, "");
  if (!CODE.test(result)) throw new PortalError("Der Tischcode ist ungültig. Bitte öffne den vollständigen QR-Link erneut.", 400, "INVALID_CODE");
  return result;
}

export function normalizedTeamCode(value) {
  const result = String(value ?? "").trim().toLowerCase().replace(/^zelttracker:\/\/team\//, "");
  if (!CODE.test(result)) throw new PortalError("Der Teamcode ist ungültig. Bitte verwende den vollständigen 64-stelligen Code.", 400, "INVALID_CODE");
  return result;
}

export function buildProfilePayload(input, hasProfile) {
  const displayName = String(input.displayName ?? "").trim();
  const bio = String(input.bio ?? "").trim();
  const intent = String(input.intent ?? "");
  if (displayName.length < 2 || displayName.length > 40) throw new PortalError("Der Anzeigename muss 2 bis 40 Zeichen lang sein.");
  if (bio.length > 280) throw new PortalError("Der Profiltext darf höchstens 280 Zeichen lang sein.");
  if (!["friends", "dating", "group", "none"].includes(intent)) throw new PortalError("Bitte wähle aus, wonach du suchst.");
  if (!input.acceptedTerms) throw new PortalError("Bitte bestätige zuerst Spielregeln und Datenschutz.");
  const result = {
    displayName,
    bio,
    intent,
    onlineMinutes: Number.isInteger(input.onlineMinutes) ? Math.min(240, Math.max(0, input.onlineMinutes)) : 0,
    allowIntroductions: intent === "none" ? false : Boolean(input.allowIntroductions),
    termsVersion: CONFIG.termsVersion,
  };
  if (!hasProfile) {
    const birthDate = String(input.birthDate ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !isAdult(birthDate)) throw new PortalError("Zam und Service stehen ausschließlich Erwachsenen ab 18 Jahren zur Verfügung.", 403, "ADULTS_ONLY");
    result.birthDate = birthDate;
  }
  return result;
}

export function isAdult(birthDate, at = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthDate));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day, 12));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return false;
  let age = at.getUTCFullYear() - year;
  const birthdayPassed = (at.getUTCMonth() + 1 > month) || (at.getUTCMonth() + 1 === month && at.getUTCDate() >= day);
  if (!birthdayPassed) age -= 1;
  return age >= 18 && age <= 120;
}

export function safeReturnPath(hash) {
  const value = String(hash ?? "");
  return /^#\/(home|zam|service|lage|account)$/.test(value) || /^#\/service\/[0-9a-f]{64}$/.test(value) ? value : "#/home";
}

export function formatMoney(cents) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(cents) / 100);
}

export function cameraSignalState(signal, now = Date.now()) {
  const observedAt = Date.parse(String(signal?.observedAt ?? ""));
  const age = Number(now) - observedAt;
  const current = Number.isFinite(observedAt) && age >= -120_000 && age < 15 * 60_000;
  const rawLevel = Number(signal?.densityPercent ?? signal?.occupancyPercent);
  const level = current && Number.isFinite(rawLevel) ? Math.max(0, Math.min(100, rawLevel)) : 0;
  return { current, level, observedAt: Number.isFinite(observedAt) ? observedAt : null };
}

export function forecastState(forecast, now = Date.now()) {
  const generatedAt = Date.parse(String(forecast?.generatedAt ?? ""));
  const age = Number(now) - generatedAt;
  const current = Number.isFinite(generatedAt) && age >= -120_000 && age < 10 * 60_000;
  const rawScore = Number(forecast?.score);
  const score = current && Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;
  return { current, score, isLive: current && forecast?.isLive === true, generatedAt: Number.isFinite(generatedAt) ? generatedAt : null };
}

export class PortalError extends Error {
  constructor(message, status = 400, code = "INVALID_INPUT") {
    super(message);
    this.name = "PortalError";
    this.status = status;
    this.code = code;
  }
}

export class PortalClient {
  constructor({ fetchImpl, storage = sessionStorage, config = CONFIG } = {}) {
    const request = fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.fetchImpl = (...args) => request(...args);
    this.storage = storage;
    this.config = config;
    this.session = this.readSession();
    this.refreshing = null;
    this.sessionGeneration = 0;
  }

  get signedIn() { return Boolean(this.session?.access_token && this.session?.refresh_token); }

  readSession() {
    try {
      const parsed = JSON.parse(this.storage.getItem(this.config.sessionKey) ?? "null");
      return parsed?.access_token && parsed?.refresh_token ? parsed : null;
    } catch { return null; }
  }

  saveSession(value) {
    this.sessionGeneration += 1;
    this.refreshing = null;
    this.session = value;
    if (value) this.storage.setItem(this.config.sessionKey, JSON.stringify(value));
    else this.storage.removeItem(this.config.sessionKey);
  }

  assertCurrentToken(token) {
    if (!this.session || this.session.access_token !== token) {
      throw new PortalError("Die Sitzung wurde geändert.", 401, "SESSION_CHANGED");
    }
  }

  async signIn(email, password) {
    const generation = this.sessionGeneration;
    const data = await this.auth("token?grant_type=password", {
      email: normalizedEmail(email), password: validatedPassword(password),
    });
    if (this.sessionGeneration !== generation) throw new PortalError("Die Sitzung wurde geändert.", 401, "SESSION_CHANGED");
    this.saveSession(data);
    return data;
  }

  async signUp(email, password) {
    return await this.auth(`signup?redirect_to=${encodeURIComponent(this.config.authReturnURL)}`, {
      email: normalizedEmail(email), password: validatedPassword(password),
    });
  }

  async requestPasswordReset(email) {
    return await this.auth(`recover?redirect_to=${encodeURIComponent(this.config.authReturnURL)}`, {
      email: normalizedEmail(email),
    });
  }

  consumeAuthRedirect(url = globalThis.location?.href ?? "") {
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    const values = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    if (values.get("error") || values.get("error_code")) {
      return { type: "error", message: "Der E-Mail-Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an." };
    }
    const accessToken = values.get("access_token");
    const refreshToken = values.get("refresh_token");
    if (!accessToken || !refreshToken) return null;
    const expiresIn = Math.max(60, Number(values.get("expires_in") ?? 3600));
    const payload = jwtPayload(accessToken);
    this.saveSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      token_type: values.get("token_type") ?? "bearer",
      user: payload ? { id: payload.sub, email: payload.email } : undefined,
    });
    return { type: values.get("type") ?? "signup" };
  }

  async updatePassword(password) {
    const token = await this.token();
    this.assertCurrentToken(token);
    const generation = this.sessionGeneration;
    const response = await this.fetchImpl(`${this.config.supabaseURL}/auth/v1/user`, {
      method: "PUT",
      headers: { apikey: this.config.publishableKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password: validatedPassword(password) }),
    });
    const value = await this.decode(response);
    if (this.sessionGeneration !== generation) throw new PortalError("Die Sitzung wurde geändert.", 401, "SESSION_CHANGED");
    return value;
  }

  async auth(path, body) {
    const response = await this.fetchImpl(`${this.config.supabaseURL}/auth/v1/${path}`, {
      method: "POST",
      headers: { apikey: this.config.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await this.decode(response);
  }

  async token() {
    if (!this.signedIn) throw new PortalError("Bitte melde dich zuerst an.", 401, "UNAUTHENTICATED");
    const expires = Number(this.session.expires_at ?? 0);
    if (expires > Date.now() / 1000 + 60) return this.session.access_token;
    if (!this.refreshing) {
      const generation = this.sessionGeneration;
      const session = this.session;
      const stillCurrent = () => this.sessionGeneration === generation && this.session === session;
      const pending = this.auth("token?grant_type=refresh_token", { refresh_token: session.refresh_token })
        .then(value => {
          if (!stillCurrent()) throw new PortalError("Die Sitzung wurde geändert.", 401, "SESSION_CHANGED");
          this.saveSession(value);
          return value.access_token;
        })
        .catch(error => {
          if (stillCurrent()) this.saveSession(null);
          throw error;
        });
      this.refreshing = pending;
      void pending.finally(() => { if (this.refreshing === pending) this.refreshing = null; }).catch(() => {});
    }
    return await this.refreshing;
  }

  async call(namespace, route, { method = "GET", body, query, retry = true } = {}) {
    const token = await this.token();
    this.assertCurrentToken(token);
    const generation = this.sessionGeneration;
    const suffix = query ? `?${new URLSearchParams(query)}` : "";
    const response = await this.fetchImpl(`${this.config.supabaseURL}/functions/v1/${namespace}/${route}${suffix}`, {
      method,
      headers: {
        apikey: this.config.publishableKey,
        Authorization: `Bearer ${token}`,
        ...(namespace === "online-community" || namespace === "community"
          ? { "X-ZT-Profile-Capability": "persistent-discoverability-v1" } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (this.sessionGeneration !== generation) throw new PortalError("Die Sitzung wurde geändert.", 401, "SESSION_CHANGED");
    if (response.status === 401 && retry) {
      this.assertCurrentToken(token);
      this.session.expires_at = 0;
      await this.token();
      return await this.call(namespace, route, { method, body, query, retry: false });
    }
    const value = await this.decode(response);
    if (this.sessionGeneration !== generation) throw new PortalError("Die Sitzung wurde geändert.", 401, "SESSION_CHANGED");
    return value.data;
  }

  community(route, options) { return this.call("online-community", route, options); }
  service(route, options) { return this.call("service", route, options); }

  async uploadPhoto(jpeg) {
    if (!(jpeg instanceof Blob) || jpeg.type !== "image/jpeg") throw new PortalError("Bitte wähle ein gültiges JPEG-Profilbild.", 400, "INVALID_PHOTO");
    if (jpeg.size > 3_000_000) throw new PortalError("Das Profilbild darf höchstens 3 MB groß sein.", 413, "PHOTO_TOO_LARGE");
    const token = await this.token();
    this.assertCurrentToken(token);
    const generation = this.sessionGeneration;
    const response = await this.fetchImpl(`${this.config.supabaseURL}/functions/v1/online-community/profile-photo`, {
      method: "POST",
      headers: { apikey: this.config.publishableKey, Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
      body: jpeg,
    });
    const value = await this.decode(response);
    if (this.sessionGeneration !== generation) throw new PortalError("Die Sitzung wurde geändert.", 401, "SESSION_CHANGED");
    return value.data;
  }

  async publicRead(namespace, retry = true) {
    try {
      const response = await this.fetchImpl(`${this.config.supabaseURL}/functions/v1/${namespace}`, {
        headers: { apikey: this.config.publishableKey },
      });
      if (retry && response.status >= 500) return await this.publicRead(namespace, false);
      const value = await this.decode(response);
      return value.data;
    } catch (error) {
      if (retry) return await this.publicRead(namespace, false);
      throw error;
    }
  }

  signals() { return this.publicRead("camera-signals"); }
  forecast() { return this.publicRead("forecast"); }

  async signOut() {
    const access = this.session?.access_token;
    this.saveSession(null);
    if (access) {
      try {
        await this.fetchImpl(`${this.config.supabaseURL}/auth/v1/logout?scope=local`, {
          method: "POST", headers: { apikey: this.config.publishableKey, Authorization: `Bearer ${access}` },
        });
      } catch { /* Local sign-out remains complete. */ }
    }
  }

  async deleteAccount() {
    const token = await this.token();
    this.assertCurrentToken(token);
    const generation = this.sessionGeneration;
    const response = await this.fetchImpl(`${this.config.supabaseURL}/functions/v1/account-delete`, {
      method: "POST",
      headers: { apikey: this.config.publishableKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE" }),
    });
    await this.decode(response);
    if (this.sessionGeneration !== generation) throw new PortalError("Die Sitzung wurde geändert.", 401, "SESSION_CHANGED");
    this.saveSession(null);
  }

  async decode(response) {
    let value = null;
    try { value = await response.json(); } catch { /* handled below */ }
    if (!response.ok) {
      const error = value?.error;
      const message = error?.message ?? value?.msg ?? value?.message ?? value?.error_description ?? "Der Dienst ist gerade nicht erreichbar. Bitte versuche es später erneut.";
      throw new PortalError(message, response.status, error?.code ?? "REQUEST_FAILED");
    }
    if (value === null) throw new PortalError("Der Dienst hat keine gültige Antwort geliefert.", 502, "INVALID_RESPONSE");
    return value;
  }
}

function jwtPayload(token) {
  try {
    const value = token.split(".")[1];
    if (!value) return null;
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    return JSON.parse(atob(base64));
  } catch { return null; }
}
