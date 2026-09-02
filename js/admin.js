// =========================================================
// AYY CAKE — admin.js
// Logic untuk halaman admin (admin.html)
// =========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (sel) => document.querySelector(sel);
const $all = (sel) => document.querySelectorAll(sel);

let allOrders = [];
let allMenus = [];
let settings = null;
let editingMenuId = null; // null = mode tambah baru

// ---------- Helpers ----------
function showLoading(show) {
  $("#loading-overlay").classList.toggle("hidden", !show);
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
function fmtMoney(n) {
  return Number(n).toLocaleString("id-ID") + (settings?.currency_label || "P");
}
function fmtTime(iso) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const PAYMENT_BADGE = {
  "Menunggu Pembayaran": ["🟡", "badge-yellow"],
  "Menunggu Konfirmasi": ["🟠", "badge-orange"],
  "Dibayar": ["🟢", "badge-green"],
  "Pembayaran Ditolak": ["🔴", "badge-red"],
};
const ORDER_BADGE = {
  "Menunggu": ["⚪", "badge-gray"],
  "Diproses": ["🔵", "badge-blue"],
  "Sedang Dibuat": ["🔵", "badge-blue"],
  "Siap": ["🟣", "badge-purple"],
  "Selesai": ["✅", "badge-green"],
  "Dibatalkan": ["❌", "badge-red"],
};
function badgeHtml(map, value) {
  const [emoji, cls] = map[value] || ["⚪", "badge-gray"];
  return `<span class="badge ${cls}">${emoji} ${value}</span>`;
}

// =========================================================
// AUTH
// =========================================================
async function checkAuth() {
  showLoading(true);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    showLoading(false);
    showLogin();
    return;
  }
  const { data: adminRow } = await supabase.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
  if (!adminRow) {
    await supabase.auth.signOut();
    showLoading(false);
    showLogin("Akun ini tidak terdaftar sebagai admin.");
    return;
  }
  await bootDashboard();
  showLoading(false);
}

function showLogin(errorMsg) {
  $("#admin-login-view").classList.remove("hidden");
  $("#admin-main-view").classList.add("hidden");
  if (errorMsg) {
    $("#login-error").textContent = errorMsg;
    $("#login-error").classList.add("show");
  }
}

async function handleLogin() {
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  if (!email || !password) {
    $("#login-error").textContent = "Email dan password wajib diisi.";
    $("#login-error").classList.add("show");
    return;
  }
  showLoading(true);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    $("#login-error").textContent = "Email atau password salah.";
    $("#login-error").classList.add("show");
    showLoading(false);
    return;
  }
  await checkAuth();
}

async function handleLogout() {
  await supabase.auth.signOut();
  location.reload();
}

// =========================================================
// BOOT
// =========================================================
async function bootDashboard() {
  $("#admin-login-view").classList.add("hidden");
  $("#admin-main-view").classList.remove("hidden");
  await Promise.all([loadSettingsData(), loadOrdersData(), loadMenusData()]);
  renderDashboard();
  renderOrdersTable();
  renderQueue();
  renderMenuAdmin();
  renderPriceForm();
  renderQrTab();
  renderSettingsForm();
}

async function loadSettingsData() {
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
  if (error) { toast("Gagal memuat settings"); return; }
  settings = data;
}
async function loadOrdersData() {
  const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
  if (error) { toast("Gagal memuat order"); return; }
  allOrders = data || [];
}
async function loadMenusData() {
  const { data, error } = await supabase.from("menus").select("*").order("category").order("sort_order");
  if (error) { toast("Gagal memuat menu"); return; }
  allMenus = data || [];
}

// =========================================================
// TABS
// =========================================================
function bindTabs() {
  $all(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $all(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      $all(".tab-panel").forEach((p) => p.classList.add("hidden"));
      $("#tab-" + btn.dataset.tab).classList.remove("hidden");
    });
  });
}

// =========================================================
// DASHBOARD
// =========================================================
function renderDashboard() {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); // YYYY-MM-DD
  const todayOrders = allOrders.filter((o) => {
    const orderDay = new Date(o.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    return orderDay === todayStr;
  });

  const waiting = todayOrders.filter((o) => o.payment_status === "Menunggu Pembayaran").length;
  const confirming = todayOrders.filter((o) => o.payment_status === "Menunggu Konfirmasi").length;
  const paid = todayOrders.filter((o) => o.payment_status === "Dibayar").length;
  const processing = todayOrders.filter((o) => ["Diproses", "Sedang Dibuat"].includes(o.order_status)).length;
  const done = todayOrders.filter((o) => o.order_status === "Selesai").length;
  const totalTray = todayOrders.reduce((s, o) => s + o.tray_qty, 0);
  const totalRevenue = todayOrders
    .filter((o) => o.payment_status === "Dibayar")
    .reduce((s, o) => s + Number(o.total_price), 0);

  const stats = [
    ["Total Order Hari Ini", todayOrders.length],
    ["Menunggu Pembayaran", waiting],
    ["Menunggu Konfirmasi", confirming],
    ["Pembayaran Dikonfirmasi", paid],
    ["Sedang Diproses", processing],
    ["Selesai", done],
    ["Total Tray Hari Ini", totalTray],
    ["Total Pendapatan (Dibayar)", fmtMoney(totalRevenue)],
  ];
  $("#stat-grid").innerHTML = stats
    .map(([label, num]) => `<div class="stat-card"><div class="num">${num}</div><div class="label">${label}</div></div>`)
    .join("");

  const recent = allOrders.slice(0, 8);
  $("#recent-orders-table tbody").innerHTML = recent
    .map(
      (o) => `<tr data-id="${o.id}">
        <td>${o.queue_label}</td>
        <td>${o.roblox_username}</td>
        <td>${o.tray_qty}</td>
        <td>${fmtMoney(o.total_price)}</td>
        <td>${badgeHtml(PAYMENT_BADGE, o.payment_status)}</td>
        <td>${fmtTime(o.created_at)}</td>
      </tr>`
    )
    .join("");
  $all("#recent-orders-table tbody tr").forEach((tr) => tr.addEventListener("click", () => openOrderModal(tr.dataset.id)));
}

// =========================================================
// ORDERS TAB
// =========================================================
function getFilteredOrders() {
  const status = $("#filter-status").value;
  const search = $("#filter-search").value.trim().toLowerCase();
  let list = [...allOrders];

  if (status === "today") {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    list = list.filter((o) => new Date(o.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) === todayStr);
  } else if (status.startsWith("order_")) {
    const val = status.replace("order_", "");
    list = list.filter((o) => o.order_status === val);
  } else if (status !== "all") {
    list = list.filter((o) => o.payment_status === status);
  }

  if (search) {
    list = list.filter(
      (o) =>
        o.roblox_username.toLowerCase().includes(search) ||
        o.tiktok_username.toLowerCase().includes(search) ||
        o.order_code.toLowerCase().includes(search) ||
        o.queue_label.toLowerCase().includes(search)
    );
  }
  return list;
}

function renderOrdersTable() {
  const list = getFilteredOrders();
  $("#orders-table tbody").innerHTML = list
    .map(
      (o) => `<tr data-id="${o.id}">
        <td>${o.queue_label}</td>
        <td>${o.order_code}</td>
        <td>${o.roblox_username}</td>
        <td>${o.tiktok_username}</td>
        <td>${o.tray_qty}</td>
        <td>${fmtMoney(o.total_price)}</td>
        <td>${badgeHtml(PAYMENT_BADGE, o.payment_status)}</td>
        <td>${badgeHtml(ORDER_BADGE, o.order_status)}</td>
        <td>${fmtTime(o.created_at)}</td>
      </tr>`
    )
    .join("");
  $all("#orders-table tbody tr").forEach((tr) => tr.addEventListener("click", () => openOrderModal(tr.dataset.id)));
}

function bindOrderFilters() {
  $("#filter-status").addEventListener("change", renderOrdersTable);
  $("#filter-search").addEventListener("input", renderOrdersTable);
  $("#btn-export-csv").addEventListener("click", exportCsv);
}

function exportCsv() {
  const list = getFilteredOrders();
  const header = ["Antrian", "Order ID", "Roblox", "TikTok", "Tray", "Harga/Tray", "Total", "Isi PO", "Catatan", "Status Bayar", "Status Order", "Waktu"];
  const rows = list.map((o) => [
    o.queue_label, o.order_code, o.roblox_username, o.tiktok_username, o.tray_qty,
    o.price_per_tray, o.total_price, (o.items_text || "").replace(/\n/g, " | "), o.notes || "",
    o.payment_status, o.order_status, fmtTime(o.created_at),
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ayycake-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// =========================================================
// ORDER DETAIL MODAL
// =========================================================
async function openOrderModal(orderId) {
  const order = allOrders.find((o) => o.id === orderId);
  if (!order) return;

  showLoading(true);
  const { data: history } = await supabase
    .from("order_status_history")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  showLoading(false);

  const historyHtml = (history || [])
    .map((h) => `<div class="history-item"><div class="time">${fmtTime(h.created_at)}</div>${h.status_value}${h.note ? " — " + h.note : ""}</div>`)
    .join("") || "<p class='hint'>Belum ada riwayat.</p>";

  $("#order-modal-content").innerHTML = `
    <div class="summary-row"><span class="label">Antrian</span><span class="value">${order.queue_label}</span></div>
    <div class="summary-row"><span class="label">Order ID</span><span class="value">${order.order_code}</span></div>
    <div class="summary-row"><span class="label">Nick Roblox</span><span class="value">${order.roblox_username}</span></div>
    <div class="summary-row"><span class="label">TikTok</span><span class="value">${order.tiktok_username}</span></div>
    <div class="summary-row"><span class="label">Jumlah Tray</span><span class="value">${order.tray_qty}</span></div>
    <div class="summary-row"><span class="label">Harga</span><span class="value">${fmtMoney(order.price_per_tray)}</span></div>
    <div class="summary-row total"><span class="label">Total</span><span class="value">${fmtMoney(order.total_price)}</span></div>
    <label class="field-label">Isi Pesanan</label>
    <div class="summary-pre">${(order.items_text || "-").replace(/</g, "&lt;")}</div>
    <label class="field-label">Catatan</label>
    <div class="summary-pre">${(order.notes || "-").replace(/</g, "&lt;")}</div>

    <label class="field-label">Status Pembayaran</label>
    <select id="modal-payment-status">
      ${["Menunggu Pembayaran", "Menunggu Konfirmasi", "Dibayar", "Pembayaran Ditolak"]
        .map((s) => `<option value="${s}" ${s === order.payment_status ? "selected" : ""}>${s}</option>`)
        .join("")}
    </select>

    <label class="field-label">Status Pesanan</label>
    <select id="modal-order-status">
      ${["Menunggu", "Diproses", "Sedang Dibuat", "Siap", "Selesai", "Dibatalkan"]
        .map((s) => `<option value="${s}" ${s === order.order_status ? "selected" : ""}>${s}</option>`)
        .join("")}
    </select>

    <button class="btn btn-primary" id="btn-save-order-status">Simpan Perubahan Status</button>

    <h3 style="margin-top:20px;">🕒 Riwayat Status</h3>
    ${historyHtml}
  `;

  $("#btn-save-order-status").addEventListener("click", async () => {
    const newPayment = $("#modal-payment-status").value;
    const newOrder = $("#modal-order-status").value;
    showLoading(true);
    try {
      if (newPayment !== order.payment_status) {
        const { error } = await supabase.rpc("admin_update_status", { p_order_id: order.id, p_status_type: "payment", p_status_value: newPayment });
        if (error) throw error;
      }
      if (newOrder !== order.order_status) {
        const { error } = await supabase.rpc("admin_update_status", { p_order_id: order.id, p_status_type: "order", p_status_value: newOrder });
        if (error) throw error;
      }
      toast("Status berhasil diubah.");
      await loadOrdersData();
      renderDashboard();
      renderOrdersTable();
      renderQueue();
      closeOrderModal();
    } catch (e) {
      console.error(e);
      toast(e.message || "Gagal menyimpan status.");
    } finally {
      showLoading(false);
    }
  });

  $("#order-modal").classList.remove("hidden");
}
function closeOrderModal() { $("#order-modal").classList.add("hidden"); }

// =========================================================
// QUEUE TAB
// =========================================================
function renderQueue() {
  const active = allOrders
    .filter((o) => !["Selesai", "Dibatalkan"].includes(o.order_status))
    .sort((a, b) => a.queue_number - b.queue_number);

  if (active.length === 0) {
    $("#queue-list").innerHTML = "<p class='hint'>Tidak ada antrian aktif saat ini.</p>";
    return;
  }
  $("#queue-list").innerHTML = active
    .map(
      (o) => `<div class="summary-row" style="cursor:pointer;" data-id="${o.id}">
        <span class="label">${o.queue_label} — ${o.roblox_username}</span>
        <span class="value">${badgeHtml(ORDER_BADGE, o.order_status)}</span>
      </div>`
    )
    .join("");
  $all("#queue-list [data-id]").forEach((el) => el.addEventListener("click", () => openOrderModal(el.dataset.id)));
}

// =========================================================
// MENU MANAGEMENT TAB
// =========================================================
function renderMenuAdmin() {
  const categories = ["Bakery", "Cake", "Food", "Sides"];
  let html = "";
  categories.forEach((cat) => {
    const items = allMenus.filter((m) => m.category === cat);
    if (items.length === 0) return;
    html += `<h3 style="color:#8a5a44; margin:16px 0 6px;">${cat}</h3>`;
    items.forEach((m) => {
      html += `<div class="menu-admin-row" data-id="${m.id}">
        <span style="flex:2;">${m.name}${m.active ? "" : " <span class='hint'>(nonaktif)</span>"}</span>
        <span style="flex:1;">${m.price ? fmtMoney(m.price) : "-"}</span>
        <button class="small-btn outline edit-menu-btn">Edit</button>
        <button class="del-btn delete-menu-btn">Hapus</button>
      </div>`;
    });
  });
  $("#menu-admin-list").innerHTML = html || "<p class='hint'>Belum ada menu.</p>";

  $all(".edit-menu-btn").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const id = e.target.closest(".menu-admin-row").dataset.id;
      openMenuModal(id);
    })
  );
  $all(".delete-menu-btn").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      const id = e.target.closest(".menu-admin-row").dataset.id;
      if (!confirm("Hapus menu ini?")) return;
      showLoading(true);
      const { error } = await supabase.from("menus").delete().eq("id", id);
      showLoading(false);
      if (error) { toast("Gagal menghapus menu."); return; }
      await loadMenusData();
      renderMenuAdmin();
      toast("Menu dihapus.");
    })
  );
}

function openMenuModal(id) {
  editingMenuId = id || null;
  if (id) {
    const m = allMenus.find((x) => x.id === id);
    $("#menu-modal-title").textContent = "Edit Menu";
    $("#menu-form-name").value = m.name;
    $("#menu-form-category").value = m.category;
    $("#menu-form-price").value = m.price ?? "";
    $("#menu-form-active").checked = m.active;
  } else {
    $("#menu-modal-title").textContent = "Tambah Menu";
    $("#menu-form-name").value = "";
    $("#menu-form-category").value = "Bakery";
    $("#menu-form-price").value = "";
    $("#menu-form-active").checked = true;
  }
  $("#menu-modal").classList.remove("hidden");
}
function closeMenuModal() { $("#menu-modal").classList.add("hidden"); }

async function saveMenu() {
  const name = $("#menu-form-name").value.trim();
  if (!name) { toast("Nama menu wajib diisi."); return; }
  const payload = {
    name,
    category: $("#menu-form-category").value,
    price: $("#menu-form-price").value ? Number($("#menu-form-price").value) : null,
    active: $("#menu-form-active").checked,
  };
  showLoading(true);
  let error;
  if (editingMenuId) {
    ({ error } = await supabase.from("menus").update(payload).eq("id", editingMenuId));
  } else {
    ({ error } = await supabase.from("menus").insert(payload));
  }
  showLoading(false);
  if (error) { toast("Gagal menyimpan menu."); return; }
  await loadMenusData();
  renderMenuAdmin();
  closeMenuModal();
  toast("Menu tersimpan.");
}

// =========================================================
// PRICE SETTINGS TAB
// =========================================================
function renderPriceForm() {
  $("#setting-price").value = settings.price_per_tray;
  $("#setting-currency").value = settings.currency_label;
}
async function savePrice() {
  const price = Number($("#setting-price").value);
  const currency = $("#setting-currency").value.trim() || "P";
  if (!price || price <= 0) { toast("Harga tidak valid."); return; }
  showLoading(true);
  const { error } = await supabase.from("settings").update({ price_per_tray: price, currency_label: currency, updated_at: new Date().toISOString() }).eq("id", 1);
  showLoading(false);
  if (error) { toast("Gagal menyimpan harga."); return; }
  await loadSettingsData();
  toast("Harga berhasil diperbarui.");
}

// =========================================================
// QR TAB
// =========================================================
function renderQrTab() {
  $("#qr-admin-preview").innerHTML = settings.qr_image_url
    ? `<img src="${settings.qr_image_url}" />`
    : "<p class='hint'>Belum ada QR aktif.</p>";
}
async function uploadQr() {
  const fileInput = $("#qr-file-input");
  const file = fileInput.files[0];
  if (!file) { toast("Pilih file gambar QR terlebih dahulu."); return; }
  showLoading(true);
  try {
    const path = `qr/qr-payment-${Date.now()}.${file.name.split(".").pop()}`;
    const { error: upErr } = await supabase.storage.from("ayycake-assets").upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from("ayycake-assets").getPublicUrl(path);
    const { error: updErr } = await supabase.from("settings").update({ qr_image_url: urlData.publicUrl }).eq("id", 1);
    if (updErr) throw updErr;
    await loadSettingsData();
    renderQrTab();
    toast("QR berhasil diupload.");
  } catch (e) {
    console.error(e);
    toast(e.message || "Gagal upload QR.");
  } finally {
    showLoading(false);
  }
}
async function deleteQr() {
  if (!confirm("Hapus QR aktif?")) return;
  showLoading(true);
  const { error } = await supabase.from("settings").update({ qr_image_url: null }).eq("id", 1);
  showLoading(false);
  if (error) { toast("Gagal menghapus QR."); return; }
  await loadSettingsData();
  renderQrTab();
  toast("QR dihapus.");
}

// =========================================================
// GENERAL SETTINGS TAB
// =========================================================
function renderSettingsForm() {
  $("#setting-shop-name").value = settings.shop_name;
  $("#setting-tagline").value = settings.shop_tagline;
  $("#setting-queue-reset").checked = settings.queue_reset_daily;
}
async function saveGeneralSettings() {
  const shop_name = $("#setting-shop-name").value.trim() || "Ayy Cake";
  const shop_tagline = $("#setting-tagline").value.trim();
  const queue_reset_daily = $("#setting-queue-reset").checked;
  showLoading(true);
  const { error } = await supabase.from("settings").update({ shop_name, shop_tagline, queue_reset_daily }).eq("id", 1);
  showLoading(false);
  if (error) { toast("Gagal menyimpan pengaturan."); return; }
  await loadSettingsData();
  toast("Pengaturan tersimpan.");
}

// =========================================================
// BIND EVENTS
// =========================================================
function bindEvents() {
  $("#btn-login").addEventListener("click", handleLogin);
  $("#btn-logout").addEventListener("click", handleLogout);
  bindTabs();
  bindOrderFilters();
  $("#btn-close-modal").addEventListener("click", closeOrderModal);
  $("#btn-add-menu").addEventListener("click", () => openMenuModal(null));
  $("#btn-close-menu-modal").addEventListener("click", closeMenuModal);
  $("#btn-save-menu").addEventListener("click", saveMenu);
  $("#btn-save-price").addEventListener("click", savePrice);
  $("#btn-upload-qr").addEventListener("click", uploadQr);
  $("#btn-delete-qr").addEventListener("click", deleteQr);
  $("#btn-save-settings").addEventListener("click", saveGeneralSettings);
}

bindEvents();
checkAuth();
