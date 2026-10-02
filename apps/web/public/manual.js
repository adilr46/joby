const entry = document.querySelector('#entry');
const status = document.querySelector('#status');
const stages = { submitted: 'Applied', under_review: 'Under review', screening: 'Screening / OA', interviewing: 'Interviewing', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn' };
let requestId = crypto.randomUUID();
let submittedPayload;
document.querySelector('[name="occurredAt"]').max = new Date().toISOString().slice(0, 10);
async function api(path, method = 'GET', body) {
  const token = document.querySelector('#token').value.trim();
  if (!token) throw new Error('Enter your access token first.');
  const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save. Please try again.');
  return result;
}
function node(tag, text) { const element = document.createElement(tag); if (text) element.textContent = text; return element; }
function selector(options, name) {
  const select = node('select'); select.setAttribute('aria-label', name);
  for (const [value, text] of options) { const option = node('option', text); option.value = value; select.append(option); }
  return select;
}
function action(label, work) {
  const button = node('button', label); button.type = 'button';
  button.addEventListener('click', async () => { button.disabled = true;
    try { await work(); await refresh(); status.textContent = 'Profile updated.'; }
    catch (error) { status.textContent = error.message; } finally { button.disabled = false; }
  });
  return button;
}
async function refresh() {
  const [profile, signals, audiences] = await Promise.all([api('/social/profile'), api('/social/signals'), api('/social/audiences')]);
  document.querySelector('#links').textContent = `${profile.linkCount} links`;
  const list = document.querySelector('#applications'); list.replaceChildren();
  document.querySelector('#empty').textContent = profile.applications.length ? '' : 'No applications yet. Add your first one above.';
  for (const application of profile.applications) {
    const card = node('article');
    card.append(node('h3', `${application.company || 'Company unavailable'} · ${application.role || 'Role unavailable'}`));
    card.append(node('p', `${stages[application.stage] || application.stage || 'No stage recorded'}${application.source === 'user_reported' ? ' · Added by you' : ''}`));
    const update = node('div'); update.className = 'actions';
    const stage = selector(Object.entries(stages), 'New stage'); stage.value = application.stage || 'submitted';
    update.append(stage, action('Update stage', () => api(`/applications/${application.applicationId}/progress`, 'POST', { stage: stage.value })));
    card.append(update);
    const candidates = signals.filter(signal => signal.applicationId === application.applicationId);
    if (candidates.length && audiences.length) {
      const share = node('div'); share.className = 'actions';
      const signal = selector(candidates.map(item => [item.id, `${item.milestone} · ${item.occurredAt.slice(0, 10)}`]), 'Progress to share');
      const audience = selector(audiences.map(item => [item.id, Object.values(item.cohort).join(' · ')]), 'Share with cohort');
      share.append(signal, audience, action('Share progress', () => api('/social/shares', 'POST', { applicationId: application.applicationId, signalId: signal.value, cohortId: audience.value })));
      const hide = action('Hide this signal', () => api('/social/shares', 'DELETE', { signalId: signal.value })); hide.className = 'secondary'; share.append(hide);
      card.append(share);
    } else if (candidates.length) card.append(node('small', 'Join a cohort to share progress with peers.'));
    list.append(card);
  }
}
document.querySelector('#signin').addEventListener('submit', async event => {
  event.preventDefault(); try { await refresh(); status.textContent = 'Profile loaded.'; } catch (error) { status.textContent = error.message; }
});
entry.addEventListener('submit', async event => {
  event.preventDefault(); const save = document.querySelector('#save'); save.disabled = true;
  const values = Object.fromEntries(new FormData(entry));
  if (!values.occurredAt) delete values.occurredAt;
  // Reuse the same id after a lost response; editing the entry starts a separate request.
  const payload = JSON.stringify(values);
  if (submittedPayload !== undefined && submittedPayload !== payload) requestId = crypto.randomUUID();
  submittedPayload = payload;
  try {
    await api('/applications/manual', 'POST', { ...values, requestId });
    requestId = crypto.randomUUID(); submittedPayload = undefined; entry.reset();
    status.textContent = 'Application saved. Only you can see it until you share progress.';
    await refresh();
  } catch (error) { status.textContent = error.message; } finally { save.disabled = false; }
});
document.querySelector('#cohort').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true;
  const cohort = Object.fromEntries([...new FormData(event.currentTarget)].filter(([, value]) => value.trim()));
  try { await api('/social/cohorts', 'POST', cohort); await refresh(); status.textContent = 'Peer group added. Choose progress to share on your profile.'; }
  catch (error) { status.textContent = error.message; } finally { button.disabled = false; }
});
