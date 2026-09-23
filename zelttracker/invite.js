const params = new URL(location.href).searchParams;
const codes = params.getAll('code');
const code = codes[0];
const valid = codes.length === 1 && Array.from(params).length === 1 && /^[0-9a-f]{32}$/.test(code);
const status = document.getElementById('invite-status');

if (valid) {
  document.getElementById('open-in-app').href = `zelttracker://friend-invite/${code}`;
  document.getElementById('invite-actions').hidden = false;
  document.getElementById('copy-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      document.getElementById('copy-status').textContent = 'Einladungslink kopiert.';
    } catch {
      document.getElementById('copy-status').textContent = 'Kopieren nicht möglich. Teile den Link über die Adressleiste.';
    }
  });
} else {
  status.textContent = 'Dieser Einladungslink ist unvollständig oder ungültig. Bitte fordere einen neuen QR-Code an.';
}
