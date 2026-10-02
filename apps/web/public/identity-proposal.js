const status = document.querySelector('#status');
const proposalElement = document.querySelector('#proposal');
const sections = document.querySelector('#sections');
const notes = document.querySelector('#notes');
const kindNames = { institution: 'Education', organisation: 'Experience', engagement: 'Projects', programme: 'Programmes', role: 'Roles', team: 'Teams', period: 'Periods' };

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function detail(label, value) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  const line = element('p');
  line.append(element('strong', `${label}: `), document.createTextNode(Array.isArray(value) ? value.join(', ') : value));
  return line;
}

function sourceQuote(item) {
  const quote = item.sources?.[0]?.quote;
  return quote ? element('blockquote', `From your CV: “${quote}”`) : null;
}

function card(item, type) {
  const article = element('article', undefined, 'card');
  article.append(element('h3', item.label));
  if (type === 'structure') {
    const dates = [item.startedAt, item.endedAt].filter(Boolean).join(' – ');
    if (dates) article.append(element('p', dates, 'muted'));
  } else {
    for (const [label, value] of [['Contribution', item.contribution], ['Capabilities', item.capability], ['Consequence', item.consequence]]) {
      const line = detail(label, value);
      if (line) article.append(line);
    }
  }
  if (item.uncertainty) article.append(element('p', `Needs checking: ${item.uncertainty}`, 'warning'));
  const quote = sourceQuote(item);
  if (quote) article.append(quote);
  return article;
}

function render(proposal) {
  const content = proposal.content;
  document.querySelector('#counts').textContent = `${content.structure.length} profile entries · ${content.activities.length} experience details`;
  for (const note of content.notes || []) notes.append(element('p', note, 'note'));

  const groups = new Map();
  for (const entry of content.structure) {
    const name = kindNames[entry.kind] || 'Profile details';
    const entries = groups.get(name) || [];
    entries.push(entry);
    groups.set(name, entries);
  }
  for (const [name, entries] of groups) {
    const section = element('section', undefined, 'group');
    section.append(element('h2', name));
    const grid = element('div', undefined, 'grid');
    entries.forEach((entry) => grid.append(card(entry, 'structure')));
    section.append(grid);
    sections.append(section);
  }
  if (content.activities.length) {
    const section = element('section', undefined, 'group');
    section.append(element('h2', 'What your CV says you did'));
    const grid = element('div', undefined, 'grid');
    content.activities.forEach((entry) => grid.append(card(entry, 'activity')));
    section.append(grid);
    sections.append(section);
  }
  if (content.conflicts.length) {
    const section = element('section', undefined, 'group');
    section.append(element('h2', 'Things that need your decision'));
    content.conflicts.forEach((conflict) => section.append(element('p', conflict.description, 'warning')));
    sections.append(section);
  }
  if (!content.structure.length && !content.activities.length) {
    sections.append(element('p', 'Joby could not identify any profile items from this CV. You can upload a clearer text-layer PDF and try again.', 'note'));
  }
}

async function load() {
  const proposalId = new URLSearchParams(location.search).get('proposalId');
  if (!proposalId) { status.textContent = 'No profile proposal was selected.'; return; }
  try {
    const response = await fetch(`/identity/proposals/${encodeURIComponent(proposalId)}`);
    const proposal = await response.json();
    if (!response.ok) throw new Error(proposal.error || 'Could not load this proposal.');
    render(proposal);
    status.hidden = true;
    proposalElement.hidden = false;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Could not load this proposal.';
  }
}
void load();
