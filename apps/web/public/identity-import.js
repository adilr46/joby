const form = document.querySelector('#import-form');
const fileInput = document.querySelector('#file');
const username = document.querySelector('#username');
const result = document.querySelector('#result');
const submit = document.querySelector('#submit');
const resultMessage = document.querySelector('#result-message');
const resultStatus = document.querySelector('#result-status');
const resultUsername = document.querySelector('#result-username');
const nextStep = document.querySelector('#next-step');
let sourceId;

username.value = sessionStorage.getItem('joby-username') || '';

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  document.querySelector('#file-name').textContent = file.name;
});

function statusLabel(status) {
  return ({ pending: 'Queued', processing: 'Reading your CV', completed: 'Proposal ready', failed: 'Could not prepare proposal' })[status] || status;
}

async function checkStatus() {
  if (!sourceId) return;
  const response = await fetch(`/identity/sources/${encodeURIComponent(sourceId)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not check import status.');
  const status = data.reconstruction.status;
  resultStatus.textContent = statusLabel(status);
  if (status === 'completed' && data.proposalId) {
    resultMessage.textContent = 'Your profile is ready for review. Nothing has been added until you review it.';
    nextStep.replaceChildren('Next: ', (() => { const link = document.createElement('a'); link.href = `/identity/proposal?proposalId=${encodeURIComponent(data.proposalId)}`; link.textContent = 'see your structured profile proposal'; return link; })());
  } else if (status === 'failed') {
    resultMessage.textContent = data.reconstruction.lastError || 'Joby could not prepare a proposal. You can retry this import later.';
    nextStep.textContent = '';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = fileInput.files?.[0];
  if (!file) return;
  submit.disabled = true;
  try {
    const headers = { 'content-type': 'application/pdf', 'x-filename': file.name };
    const response = await fetch('/identity/sources', { method: 'POST', headers, body: file });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not import your CV.');
    sourceId = data.sourceId;
    sessionStorage.setItem('joby-person-id', data.personId);
    sessionStorage.setItem('joby-username', username.value.trim());
    resultUsername.textContent = `@${username.value.trim()}`;
    resultStatus.textContent = statusLabel(data.reconstruction.status);
    resultMessage.textContent = data.duplicate ? 'This CV was already uploaded. Showing its current preparation status.' : 'Your CV is safely captured. Joby is preparing your profile for review.';
    nextStep.textContent = '';
    result.hidden = false;
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.setTimeout(() => checkStatus().catch(() => {}), 1200);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Could not import your CV.');
  } finally {
    submit.disabled = false;
  }
});

document.querySelector('#check-status').addEventListener('click', async () => {
  try { await checkStatus(); } catch (error) { window.alert(error instanceof Error ? error.message : 'Could not check import status.'); }
});
document.querySelector('#start-over').addEventListener('click', () => { form.reset(); username.value = sessionStorage.getItem('joby-username') || ''; document.querySelector('#file-name').textContent = 'Choose your CV'; result.hidden = true; sourceId = undefined; fileInput.focus(); });
