const { createClient } = window.supabase;
const client = createClient(window.APP_CONFIG.supabaseUrl, window.APP_CONFIG.supabaseKey);
const categories = {
  small: { label: "1–4 人", order: 1 },
  medium: { label: "5–8 人", order: 2 },
  large: { label: "9 人及以上", order: 3 },
};
let entries = [];
let selectedCategory = "small";

const $ = (selector) => document.querySelector(selector);
const formatNumber = (number) => String(number).padStart(2, "0");
const categoryFor = (size) => (size <= 4 ? "small" : size <= 8 ? "medium" : "large");

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("visible"), 2500);
}

function setLoggedIn(loggedIn) {
  $("#login-panel").hidden = loggedIn;
  $("#app-panel").hidden = !loggedIn;
  $("#logout-button").hidden = !loggedIn;
}

function setError(message) {
  $("#login-error").textContent = message;
}

async function loadEntries() {
  const { data: dayStartedAt, error: dayError } = await client.rpc("active_day_started_at");
  if (dayError) throw dayError;
  const { data, error } = await client
    .from("queue_entries")
    .select("*")
    .gte("created_at", dayStartedAt || new Date().toISOString().slice(0, 10))
    .order("queue_position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  entries = data;
  renderQueues();
}

function renderTabs() {
  $("#queue-tabs").innerHTML = Object.entries(categories)
    .map(([key, value]) => {
      const count = entries.filter((entry) => entry.category === key && entry.status === "waiting").length;
      return `<button class="queue-tab ${key === selectedCategory ? "active" : ""}" data-category="${key}">${value.label}<b>${count}</b></button>`;
    })
    .join("");
  document.querySelectorAll(".queue-tab").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCategory = button.dataset.category;
      renderQueues();
    });
  });
}

function renderQueues() {
  renderTabs();
  const waiting = entries.filter((entry) => entry.category === selectedCategory && entry.status === "waiting");
  const called = entries.filter((entry) => entry.status === "called").sort((a, b) => new Date(b.called_at) - new Date(a.called_at));
  const latest = called[0];
  $("#current-call").hidden = !latest;
  if (latest) {
    $("#current-call-number").textContent = formatNumber(latest.queue_number);
    $("#current-call-name").textContent = latest.customer_name;
    $("#current-call-detail").textContent = `${latest.party_size} 人 · ${categories[latest.category].label}`;
  }
  $("#queue-list").innerHTML = waiting.map((entry, index) => `
    <article class="queue-entry">
      <div class="entry-number">${formatNumber(entry.queue_number)}</div>
      <div class="entry-info"><strong>${escapeHtml(entry.customer_name)}</strong><span>${entry.party_size} 人 · ${escapeHtml(entry.phone)}</span></div>
      <div class="entry-actions">
        ${index > 0 ? `<button data-action="top" data-id="${entry.id}">置顶</button>` : ""}
        <button data-action="call" data-id="${entry.id}">叫号</button>
        <button data-action="skip" data-id="${entry.id}">弃号</button>
      </div>
    </article>`).join("");
  $("#empty-queue").hidden = waiting.length > 0;
  $("#called-list").innerHTML = called.slice(0, 8).map((entry) => `
    <div class="called-row">
      <span class="called-customer"><b>${formatNumber(entry.queue_number)}</b> ${escapeHtml(entry.customer_name)}<em>等待入座</em></span>
      <button class="seated-button" data-action="seated" data-id="${entry.id}">确认已入座</button>
    </div>`).join("");
  $("#empty-called").hidden = called.length > 0;
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => updateEntry(button.dataset.action, button.dataset.id));
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

async function addEntry(event) {
  event.preventDefault();
  const partySize = Number($("#party-size").value);
  const category = categoryFor(partySize);
  const { data: number, error: numberError } = await client.rpc("next_queue_number");
  if (numberError) return showToast(`取号失败：${numberError.message}`);
  const { data, error } = await client.from("queue_entries").insert({
    queue_number: number,
    customer_name: $("#customer-name").value.trim(),
    phone: $("#phone").value.trim(),
    party_size: partySize,
    category,
    queue_position: Date.now(),
  }).select().single();
  if (error) return showToast(`登记失败：${error.message}`);
  $("#new-ticket-number").textContent = formatNumber(data.queue_number);
  $("#new-ticket-category").textContent = `已加入「${categories[category].label}」队列`;
  $("#new-ticket").hidden = false;
  $("#entry-form").reset();
  await loadEntries();
  showToast(`取号成功，号码是 ${formatNumber(data.queue_number)}`);
}

async function updateEntry(action, id) {
  const entry = entries.find((item) => item.id === id);
  if (!entry) return;
  if (action === "seated" && !confirm(`确认 ${formatNumber(entry.queue_number)} 号顾客已入座吗？`)) return;
  let patch;
  if (action === "skip") patch = { status: "skipped" };
  if (action === "call") patch = { status: "called", called_at: new Date().toISOString() };
  if (action === "seated") patch = { status: "seated" };
  if (action === "top") patch = { queue_position: Math.floor(Date.now() / 1000) - 1000000000 };
  const { error } = await client.from("queue_entries").update(patch).eq("id", id);
  if (error) return showToast(`操作失败：${error.message}`);
  await loadEntries();
  showToast(action === "skip" ? "已标记为弃号" : action === "call" ? `请 ${formatNumber(entry.queue_number)} 号顾客到店内` : action === "seated" ? "已标记入座" : "已置顶");
}

async function resetDay() {
  if (!confirm("确定开始新的一天吗？当前等待队列会标记为弃号，历史记录仍会保留，号码将从 01 重新开始。")) return;
  const { error } = await client.rpc("start_new_day");
  if (error) return showToast(`操作失败：${error.message}`);
  await loadEntries();
  showToast("已开始新的一天");
}

async function exportCsv() {
  const { data: dayStartedAt, error: dayError } = await client.rpc("active_day_started_at");
  if (dayError) return showToast(`导出失败：${dayError.message}`);
  const { data, error } = await client.from("queue_entries").select("*").gte("created_at", dayStartedAt || new Date().toISOString().slice(0, 10));
  if (error) return showToast(`导出失败：${error.message}`);
  const header = ["号码", "姓名", "手机号", "人数", "桌型", "状态", "取号时间", "叫号时间"];
  const rows = data.map((entry) => [entry.queue_number, entry.customer_name, entry.phone, entry.party_size, categories[entry.category].label, entry.status, entry.created_at, entry.called_at || ""]);
  const csv = "\ufeff" + [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `排队记录-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("");
  const { error } = await client.auth.signInWithPassword({ email: $("#email").value, password: $("#password").value });
  if (error) return setError("登录失败，请检查邮箱和密码。");
  setLoggedIn(true);
  await loadEntries();
});
$("#logout-button").addEventListener("click", async () => { await client.auth.signOut(); setLoggedIn(false); });
$("#entry-form").addEventListener("submit", addEntry);
$("#refresh-button").addEventListener("click", () => loadEntries().catch((error) => showToast(`刷新失败：${error.message}`)));
$("#export-button").addEventListener("click", exportCsv);
$("#reset-day").addEventListener("click", resetDay);
document.querySelectorAll(".mode-button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".mode-button").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  const staff = button.dataset.mode === "staff";
  $("#customer-panel").hidden = staff;
  $("#staff-panel").hidden = !staff;
}));

client.auth.getSession().then(({ data }) => {
  if (data.session) { setLoggedIn(true); loadEntries().catch((error) => showToast(`读取失败：${error.message}`)); }
});
client.auth.onAuthStateChange((_event, session) => {
  setLoggedIn(Boolean(session));
});
window.setInterval(() => {
  if (!$("#app-panel").hidden) loadEntries().catch((error) => showToast(`同步失败：${error.message}`));
}, 15000);
