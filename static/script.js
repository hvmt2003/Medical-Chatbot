// --- Elements
const el = (id) => document.getElementById(id);
const sidebar = el('sidebar');
const chatList = el('chat-list');
const messages = el('messages');
const searchChats = el('search-chats');
const chatTitle = el('chat-title');
const btnNewChat = el('btn-new-chat');
const toggleSidebarBtn = el('toggle-sidebar');
const composer = el('composer');
const inputMsg = el('input-msg');

let currentSessionId = null;
let sessionsCache = [];

// Auto-resize textarea
inputMsg.addEventListener('input', () => {
  inputMsg.style.height = 'auto';
  inputMsg.style.height = Math.min(inputMsg.scrollHeight, 160) + 'px';
});

// Sidebar toggle (mobile)
toggleSidebarBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

// Load sessions on start
init();

async function init() {
  await loadSessions();
  if (!currentSessionId && sessionsCache.length) {
    openSession(sessionsCache[0].id, sessionsCache[0].title);
  }
}

async function loadSessions() {
  const res = await fetch('/api/chats');
  const data = await res.json();
  sessionsCache = data;
  renderSessionList(data);
}

function renderSessionList(list) {
  chatList.innerHTML = '';
  list.forEach(s => {
    const item = document.createElement('div');
    item.className = 'chat-item' + (s.id === currentSessionId ? ' active' : '');
    item.innerHTML = `
      <div style="min-width:0">
        <div class="chat-title">${escapeHtml(s.title || 'New Chat')}</div>
        <div class="chat-snippet">${escapeHtml((s.snippet || '').slice(0, 60))}</div>
      </div>
      <div class="chat-actions">
        <button class="icon-btn" title="Rename"><i class="fa fa-pen"></i></button>
        <button class="icon-btn" title="Delete"><i class="fa fa-trash"></i></button>
      </div>
    `;
    // open
    item.addEventListener('click', (e) => {
      if (e.target.closest('.icon-btn')) return; // ignore action clicks
      openSession(s.id, s.title);
      sidebar.classList.remove('open');
    });
    // rename
    item.querySelectorAll('.icon-btn')[0].addEventListener('click', () => showRename(s));
    // delete
    item.querySelectorAll('.icon-btn')[1].addEventListener('click', () => showDelete(s));
    chatList.appendChild(item);
  });
}

async function openSession(id, title) {
  currentSessionId = id;
  chatTitle.textContent = title || 'DocTalk';
  messages.innerHTML = '';
  // load msgs
  const res = await fetch(`/api/chats/${id}/messages`);
  const data = await res.json();
  data.forEach(m => appendMsg(m.role === 'assistant' ? 'bot' : 'user', m.content));
  scrollBottom();
  // mark active
  renderSessionList(sessionsCache);
}

// New chat
btnNewChat.addEventListener('click', async () => {
  const res = await fetch('/api/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'New Chat' })
  });
  const sess = await res.json();
  sessionsCache.unshift(sess);
  renderSessionList(sessionsCache);
  openSession(sess.id, sess.title);
});

// Search chats
searchChats.addEventListener('input', () => {
  const q = searchChats.value.toLowerCase().trim();
  const filtered = sessionsCache.filter(s =>
    (s.title || '').toLowerCase().includes(q) ||
    (s.snippet || '').toLowerCase().includes(q)
  );
  renderSessionList(filtered);
});

// Send message
composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = inputMsg.value.trim();
  if (!msg || !currentSessionId) return;
  inputMsg.value = '';
  inputMsg.style.height = 'auto';

  appendMsg('user', msg);
  showTyping();

  const res = await fetch('/get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg, session_id: currentSessionId })
  });
  const data = await res.json();
  hideTyping();
  appendMsg('bot', data.reply || 'Sorry, something went wrong.');
  scrollBottom();
  // refresh list (snippet)
  loadSessions();
});

// Helpers
function appendMsg(sender, text) {
  const node = document.createElement('div');
  node.className = `msg ${sender}`;
  node.innerHTML = `<div>${linkify(escapeNl(escapeHtml(text)))}</div>`;
  messages.appendChild(node);
}

function showTyping() {
  const t = document.createElement('div');
  t.className = 'typing';
  t.id = 'typing';
  t.innerHTML = '<span></span><span></span><span></span>';
  messages.appendChild(t);
  scrollBottom();
}

function hideTyping() {
  const t = document.getElementById('typing');
  if (t) t.remove();
}

function scrollBottom() {
  messages.scrollTop = messages.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeNl(s){ return s.replace(/\n/g,'<br/>'); }
function linkify(s){
  return s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');
}

/* ------- Rename & Delete ------- */
const renameModal = document.getElementById('rename-modal');
const deleteModal = document.getElementById('delete-modal');
const renameInput = document.getElementById('rename-input');

function showRename(sess){
  renameInput.value = sess.title || '';
  renameModal.classList.remove('hidden');
  document.getElementById('rename-cancel').onclick = () => renameModal.classList.add('hidden');
  document.getElementById('rename-save').onclick = async () => {
    const title = renameInput.value.trim() || 'Untitled';
    await fetch(`/api/chats/${sess.id}/rename`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title })
    });
    renameModal.classList.add('hidden');
    await loadSessions();
    if (sess.id === currentSessionId) chatTitle.textContent = title;
  };
}

function showDelete(sess){
  deleteModal.classList.remove('hidden');
  document.getElementById('delete-cancel').onclick = () => deleteModal.classList.add('hidden');
  document.getElementById('delete-confirm').onclick = async () => {
    await fetch(`/api/chats/${sess.id}`, { method:'DELETE' });
    deleteModal.classList.add('hidden');
    await loadSessions();
    // if we deleted the current session, open first one (if any)
    if (sess.id === currentSessionId){
      messages.innerHTML = '';
      currentSessionId = null;
      if (sessionsCache.length) openSession(sessionsCache[0].id, sessionsCache[0].title);
      else chatTitle.textContent = 'DocTalk';
    }
  };
}
