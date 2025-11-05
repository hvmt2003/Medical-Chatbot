// DocTalk UI script - handles chats, new chat, open, rename, delete, sending
const sidebar = document.getElementById('sidebar');
const btnNew = document.getElementById('btn-new-chat');
const searchInput = document.getElementById('search-chats');
const chatListEl = document.getElementById('chat-list');
const toggleBtn = document.getElementById('toggle-sidebar');
const messagesEl = document.getElementById('messages');
const composer = document.getElementById('composer');
const inputMsg = document.getElementById('input-msg');
const sendBtn = document.getElementById('send-btn');
const chatTitleEl = document.getElementById('chat-title');

let state = { chats: [], active: null };

// small helper: call API
async function api(path, opts = {}) {
  try {
    const res = await fetch(path, opts);
    if (!res.ok) throw new Error(await res.text() || res.statusText);
    return await res.json();
  } catch (err) {
    console.warn('API error', path, err);
    alert(`Error: ${err.message}. Check console.`);
    return null;
  }
}

// load chats on start
async function loadChats() {
  const data = await api('/api/chats');
  if (Array.isArray(data)) {
    state.chats = data.map(c => ({ ...c, messages: [] }));
    if (state.chats.length) {
      setActive(state.chats[0].id);
    }
  } else {
    // No chats found or API error
    state.chats = [];
  }
  renderChatList();
}

function renderChatList() {
  chatListEl.innerHTML = '';
  const q = searchInput.value.trim().toLowerCase();
  state.chats.forEach(chat => {
    if (q && !chat.title.toLowerCase().includes(q) && !(chat.snippet||'').toLowerCase().includes(q)) return;
    const item = document.createElement('div');
    item.className = 'chat-item' + (chat.id === state.active ? ' active' : '');
    item.dataset.id = chat.id;

    const icon = document.createElement('div');
    icon.className = 'chat-icon'; icon.textContent = (chat.title||'New')[0] || 'C';

    const meta = document.createElement('div'); meta.className = 'chat-meta';
    const title = document.createElement('div'); title.className = 'chat-title'; title.textContent = chat.title || 'New Chat';
    const snippet = document.createElement('div'); snippet.className = 'chat-snippet'; snippet.textContent = chat.snippet || '...';

    meta.appendChild(title); meta.appendChild(snippet);

    const actions = document.createElement('div'); actions.className = 'chat-actions';
    actions.innerHTML = `<i class="fa fa-ellipsis-vertical"></i>`;
    actions.addEventListener('click', (e) => { e.stopPropagation(); openChatMenu(chat, actions); });

    item.appendChild(icon); item.appendChild(meta); item.appendChild(actions);
    item.addEventListener('click', () => openChat(chat.id));
    chatListEl.appendChild(item);
  });
}

// open menu (rename/share/delete) - minimal floating menu
function openChatMenu(chat, anchor) {
  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.style.position = 'fixed';
  menu.style.left = `${rect.right - 140}px`;
  menu.style.top = `${rect.top + 6}px`;
  menu.style.background = '#0b1624';
  menu.style.border = '1px solid rgba(255,255,255,0.03)';
  menu.style.padding = '6px'; menu.style.borderRadius = '8px'; menu.style.zIndex=3000;
  menu.innerHTML = `<div class='menu-item' data-action='rename'>Rename</div>
                    <div class='menu-item' data-action='delete'>Delete</div>`;
  document.body.appendChild(menu);

  function close() { menu.remove(); window.removeEventListener('click', outside); }
  function outside(e){ if(!menu.contains(e.target)) close(); }
  setTimeout(()=> window.addEventListener('click', outside), 0);

  menu.querySelectorAll('.menu-item').forEach(it => {
    it.addEventListener('click', async (ev) => {
      const action = ev.target.dataset.action;
      close();
      if (action === 'rename') openRename(chat);
      if (action === 'delete') openDelete(chat);
    });
  });
}

// API wrappers
async function createChatOnServer(title='New Chat') {
  return await api('/api/chats', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title }) });
}
async function fetchMessages(id) {
  return await api(`/api/chats/${encodeURIComponent(id)}/messages`);
}
async function deleteChatOnServer(id) {
  return await api(`/api/chats/${encodeURIComponent(id)}`, { method:'DELETE' });
}
async function renameChatOnServer(id, title) {
  return await api(`/api/chats/${encodeURIComponent(id)}/rename`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title }) });
}

// create new chat
btnNew.addEventListener('click', async () => {
  const serverRes = await createChatOnServer('New Chat');
  if (serverRes && serverRes.id) {
    state.chats.unshift({ id: serverRes.id, title: serverRes.title, snippet: '', messages: [] });
    setActive(serverRes.id);
    renderChatList();
  }
});

// set active chat id & load messages
async function setActive(id) {
  state.active = id;
  const chat = state.chats.find(c => c.id === state.active);
  if (chat) {
      chatTitleEl.textContent = chat.title;
  }
  renderChatList();
  await loadMessagesForActive();
  renderMessages();
  if (window.innerWidth < 900) {
      sidebar.classList.remove('open');
  }
}

// open by id
async function openChat(id) { await setActive(id); }

// load messages for active chat
async function loadMessagesForActive() {
  const chat = state.chats.find(c => c.id === state.active);
  if (!chat) return;
  if (chat.messages && chat.messages.length) return; // already loaded
  
  const msgs = await fetchMessages(chat.id);
  if (Array.isArray(msgs)) {
    chat.messages = msgs; // API returns {role, content}
  } else {
    chat.messages = [];
  }
}

// render messages pane
function renderMessages() {
  messagesEl.innerHTML = '';
  const chat = state.chats.find(c => c.id === state.active);
  if (!chat || !chat.messages) {
    messagesEl.innerHTML = `<div style="color:#94a3b8;padding:24px">Start a new chat or select an existing one.</div>`;
    return;
  }
  chat.messages.forEach(m => {
    const el = document.createElement('div'); 
    el.className = 'msg ' + (m.role === 'user' ? 'user' : 'assistant');
    el.innerHTML = `<div class="content">${escapeHtml(m.content).replace(/\n/g,'<br>')}</div>`;
    messagesEl.appendChild(el);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// compose/send message (POST to /get and save)
composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = inputMsg.value.trim();
  if (!text) return;
  
  // ensure chat exists
  if (!state.active) {
    await btnNew.click(); // Create a new chat if one isn't active
  }

  const chat = state.chats.find(c => c.id === state.active);
  if (!chat) return; // Should not happen

  inputMsg.value = '';
  inputMsg.style.height = 'auto'; // Reset height

  // append user message locally
  chat.messages.push({ role:'user', content:text });
  renderMessages();

  // append assistant placeholder
  const placeholder = { role:'assistant', content:'Thinking...' };
  chat.messages.push(placeholder);
  renderMessages();

  // call backend /get (expects {msg, session_id})
  try {
    // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    // !! THIS IS THE CRITICAL FIX !!
    // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    const res = await fetch('/get', { 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        body: JSON.stringify({ 
            msg: text,
            session_id: state.active  // Send the active session ID
        }) 
    });
    // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    
    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();
    const reply = data.reply || data.error || 'No reply';
    
    // replace last assistant placeholder
    placeholder.content = reply;
    
    // update snippet & re-render list
    chat.snippet = reply.slice(0,120);
    renderChatList();
    renderMessages();

  } catch (err) {
    console.error(err);
    placeholder.content = 'Error: network or server error. Please check console.';
    renderMessages();
  }
});

// keyboard: Enter send, Shift+Enter newline
inputMsg.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); 
    composer.dispatchEvent(new Event('submit', {cancelable:true})); 
  }
});
// Auto-resize textarea
inputMsg.addEventListener('input', () => {
    inputMsg.style.height = 'auto';
    inputMsg.style.height = (inputMsg.scrollHeight) + 'px';
});


// rename/delete flows
function openRename(chat){
  const modal = document.getElementById('rename-modal'); modal.classList.remove('hidden');
  const input = document.getElementById('rename-input'); input.value = chat.title || '';
  input.focus();
  document.getElementById('rename-save').onclick = async () => {
    const newTitle = input.value.trim() || 'Untitled';
    const res = await renameChatOnServer(chat.id, newTitle);
    if (res && res.title) {
      chat.title = res.title;
      if (chat.id === state.active) {
          chatTitleEl.textContent = res.title;
      }
    }
    renderChatList();
    modal.classList.add('hidden');
  };
  document.getElementById('rename-cancel').onclick = () => modal.classList.add('hidden');
}

function openDelete(chat){
  const modal = document.getElementById('delete-modal'); modal.classList.remove('hidden');
  document.getElementById('delete-confirm').onclick = async () => {
    const res = await deleteChatOnServer(chat.id);
    // remove from state regardless
    state.chats = state.chats.filter(c => c.id !== chat.id);
    if (state.active === chat.id) {
      state.active = state.chats.length ? state.chats[0].id : null;
      if (state.active) {
          await setActive(state.active);
      } else {
          setActive(null);
          renderMessages(); // Clear messages
          chatTitleEl.textContent = "DocTalk";
      }
    }
    renderChatList();
    modal.classList.add('hidden');
  };
  document.getElementById('delete-cancel').onclick = () => modal.classList.add('hidden');
}

// small helpers
function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g, (m)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }

// sidebar toggle for mobile
toggleBtn && toggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

// search
searchInput && searchInput.addEventListener('input', () => renderChatList());

// initial load
loadChats();