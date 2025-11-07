// -----------------------------
// Utilities
// -----------------------------
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];

let currentChatId = null;
let chatsCache = []; // [{id,title,snippet}]

// Make a short, relevant title from the first user message
function smartTitle(text) {
  if (!text) return "Conversation";

  const t = text
    .replace(/\s+/g, " ")
    .replace(/[\r\n]+/g, " ")
    .trim();

  // quick intent keywords → titles
  const lc = t.toLowerCase();
  const map = [
    [/fever|temperature|pyrexia/, "Fever care advice"],
    [/cold|cough|sneeze|flu/, "Cold & cough guidance"],
    [/headache|migraine/, "Headache relief tips"],
    [/stomach|abdomen|acidity|gas|nausea|vomit/, "Stomach care guidance"],
    [/diarrhea|loose motion/, "Diarrhea home care"],
    [/cut|scratch|wound|injur|burn/, "First-aid for minor injuries"],
    [/skin|rash|itch|allergy|pimple|acne/, "Skin & allergy advice"],
    [/period|menstruat|cramp/, "Period care advice"],
    [/bp|blood pressure|hypertens/, "Blood pressure guidance"],
    [/sugar|diabetes/, "Diabetes management basics"],
    [/diet|food|nutrition/, "Diet & nutrition tips"],
    [/sleep|insomnia/, "Sleep hygiene advice"],
    [/medicine|drug|tablet|dose/, "Medicine guidance"],
  ];
  for (const [re, title] of map) if (re.test(lc)) return title;

  // otherwise: use first sentence/phrase, trimmed & title-cased
  let first = t.split(/[.!?]/)[0];
  if (first.length > 42) first = first.slice(0, 42) + "…";

  // remove leading “hi/hello/hey” etc.
  first = first.replace(/^(hi|hello|hey)\b[, ]*/i, "");

  // title case (simple)
  first = first
    .split(" ")
    .map((w, i) => (i === 0 || w.length > 3 ? w[0]?.toUpperCase() + w.slice(1) : w))
    .join(" ");

  // ensure non-empty
  return first || "Conversation";
}

function setHeaderTitle(text) {
  $("#chat-title").textContent = text || "DocTalk";
}

function renderChatList(items) {
  const list = $("#chat-list");
  list.innerHTML = "";

  items.forEach((c) => {
    const chatItem = document.createElement("div");
    chatItem.className = "chat-item" + (c.id === currentChatId ? " active" : "");
    chatItem.dataset.id = c.id;

    chatItem.innerHTML = `
      <div class="chat-content" data-action="select">
        <div class="chat-title">${c.title || "New Chat"}</div>
        <div class="chat-snippet">${(c.snippet || "").replace(/\n/g, " ").slice(0, 60)}</div>
      </div>
      <div class="chat-actions">
        <button class="icon-btn rename" title="Rename chat" data-action="rename">✏️
          <i class="fa fa-pen"></i>
        </button>
        <button class="icon-btn delete" title="Delete chat" data-action="delete">🗑️
          <i class="fa fa-trash"></i>
        </button>
      </div>
    `;

    list.appendChild(chatItem);
  });
}


function appendMessage(role, content) {
  const wrap = $("#messages");
  const div = document.createElement("div");
  div.className = "msg " + (role === "user" ? "user" : "bot");
  div.textContent = content;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function clearMessages() {
  $("#messages").innerHTML = "";
}

// -----------------------------
// API
// -----------------------------
async function apiGetChats() {
  const r = await fetch("/api/chats");
  return r.json();
}
async function apiCreateChat(title = "New Chat") {
  const r = await fetch("/api/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return r.json();
}
async function apiGetMessages(id) {
  const r = await fetch(`/api/chats/${id}/messages`);
  if (r.status === 403) throw new Error("Unauthorized");
  if (!r.ok) throw new Error("Failed to load messages");
  return r.json();
}
async function apiRenameChat(id, title) {
  const r = await fetch(`/api/chats/${id}/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return r.json();
}
async function apiDeleteChat(id) {
  const r = await fetch(`/api/chats/${id}`, { method: "DELETE" });
  return r.json();
}
async function apiSendMessage(session_id, msg) {
  const r = await fetch("/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, msg }),
  });
  return r.json();
}

// -----------------------------
// App init & events
// -----------------------------
async function loadChatsAndRender(selectId = null) {
  chatsCache = await apiGetChats();
  renderChatList(chatsCache);
  if (selectId) selectChat(selectId);
}

async function selectChat(id) {
  currentChatId = id;
  // highlight
  renderChatList(chatsCache);
  // header
  const current = chatsCache.find((c) => c.id === id);
  setHeaderTitle(current?.title || "New Chat");
  // load messages
  clearMessages();
  const msgs = await apiGetMessages(id);
  msgs.forEach((m) => appendMessage(m.role, m.content));
}

async function startNewChat() {
  const created = await apiCreateChat("New Chat");
  chatsCache.unshift(created);
  renderChatList(chatsCache);
  await selectChat(created.id);
  
  // 🔑 NEW: Close sidebar if on mobile after starting a new chat
  if (window.innerWidth <= 768) {
      $("#sidebar").classList.remove("open");
  }
}

// Sidebar click (select / rename / delete)
$("#chat-list").addEventListener("click", async (e) => {
  const action = e.target.closest("[data-action]")?.dataset.action;
  const chatItem = e.target.closest(".chat-item");
  if (!chatItem) return;
  const id = Number(chatItem.dataset.id);

  if (action === "rename") {
    e.stopPropagation(); // ✅ prevent chat opening
    $("#rename-modal").classList.remove("hidden");
    $("#rename-input").value = chatsCache.find((c) => c.id === id)?.title || "";
    $("#rename-save").onclick = async () => {
      const newTitle = $("#rename-input").value.trim() || "Conversation";
      await apiRenameChat(id, newTitle);
      const c = chatsCache.find((x) => x.id === id);
      if (c) c.title = newTitle;
      renderChatList(chatsCache);
      if (id === currentChatId) setHeaderTitle(newTitle);
      $("#rename-modal").classList.add("hidden");
    };
    $("#rename-cancel").onclick = () => $("#rename-modal").classList.add("hidden");
    return;
  }

  if (action === "delete") {
    e.stopPropagation(); // ✅ prevent chat opening
    $("#delete-modal").classList.remove("hidden");
    $("#delete-confirm").onclick = async () => {
      await apiDeleteChat(id);
      chatsCache = chatsCache.filter((c) => c.id !== id);
      renderChatList(chatsCache);
      $("#delete-modal").classList.add("hidden");
      if (id === currentChatId) {
        // move to first available chat or create new
        if (chatsCache[0]) selectChat(chatsCache[0].id);
        else startNewChat();
      }
    };
    $("#delete-cancel").onclick = () => $("#delete-modal").classList.add("hidden");
    return;
  }

  // Default → select chat
  await selectChat(id);

  // 🔑 NEW: Auto-Close sidebar after selection on mobile
  if (window.innerWidth <= 768) {
    $("#sidebar").classList.remove("open");
  }
});

// New chat button
$("#btn-new-chat").addEventListener("click", startNewChat);

// Send
$("#composer").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ta = $("#input-msg");
  const text = ta.value.trim();
  if (!text || !currentChatId) return;

  // show user msg
  appendMessage("user", text);
  ta.value = "";

  // If title is still “New Chat”, smart-rename now
  const current = chatsCache.find((c) => c.id === currentChatId);
  if (current && /^new chat$/i.test(current.title || "")) {
    const newTitle = smartTitle(text);
    try {
      await apiRenameChat(currentChatId, newTitle);
      current.title = newTitle;
      setHeaderTitle(newTitle);
      renderChatList(chatsCache);
    } catch (_) {
      // ignore rename errors
    }
  }

  // call bot
  const typing = document.createElement("div");
  typing.className = "typing";
  typing.innerHTML = `<span></span><span></span><span></span>`;
  $("#messages").appendChild(typing);
  $("#messages").scrollTop = $("#messages").scrollHeight;

  try {
    const res = await apiSendMessage(currentChatId, text);
    typing.remove();
    if (res.reply) appendMessage("assistant", res.reply);
    else appendMessage("assistant", "Sorry, something went wrong.");
  } catch (err) {
    typing.remove();
    appendMessage("assistant", "Network error. Please try again.");
  }
});

// Sidebar search
$("#search-chats").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  const filtered = chatsCache.filter(
    (c) =>
      (c.title || "").toLowerCase().includes(q) ||
      (c.snippet || "").toLowerCase().includes(q)
  );
  renderChatList(filtered);
});

// -----------------------------
// Mobile Sidebar Toggle
// -----------------------------
const sidebar = $("#sidebar");
const mobileMenuBtn = $("#mobile-menu-btn");

if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener("click", () => {
        // Toggles the 'open' class defined in style.css to show/hide the menu
        sidebar.classList.toggle("open");
    });
}


// Init
(async function init() {
  await loadChatsAndRender();
  if (!chatsCache.length) await startNewChat();
  else await selectChat(chatsCache[0].id);
})();