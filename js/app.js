// =========================================================
// AYY CAKE — app.js
// Logic untuk halaman pembeli (index.html)
// =========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- State ----------
const state = {
  settings: null,
  menus: [],
  roblox: "",
  tiktok: "",
  tray: 1,
  itemsText: "",
  notes: "",
  lastOrder: null, // { order_code, queue_label, total_price, price_per_tray }
};

const CATEGORY_EMOJI = { Bakery: "🥐", Cake: "🍰", Food: "🍔", Sides: "🥗" };

// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);
const $all = (sel) => document.querySelectorAll(sel);

function showView(id) {
  $all(".view").forEach((el) => el.classList.add("hidden"));
  $(id).classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "instant" });
}

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
  return Number(n).toLocaleString("id-ID") + (state.settings?.currency_label || "P");
}

// ---------- Load initial data ----------
async function loadSettings() {
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
  if (error) {
    console.error(error);
    toast("Gagal memuat pengaturan toko. Cek koneksi Supabase.");
    return;
  }
  state.settings = data;
  $("#shop-name-text").textContent = data.shop_name;
  $("#shop-tagline-text").textContent = data.shop_tagline;
  document.title = data.shop_name + " — Bloxburg PO";
  $("#price-per-tray-text").textContent = fmtMoney(data.price_per_tray);
}

async function loadMenus() {
  const { data, error } = await supabase
    .from("menus")
    .select("*")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  state.menus = data;
  renderMenu();
}

function renderMenu() {
  const container = $("#menu-list");
  container.innerHTML = "";
  const categories = ["Bakery", "Cake", "Food", "Sides"];
  categories.forEach((cat) => {
    const items = state.menus.filter((m) => m.category === cat);
    if (items.length === 0) return;
    const block = document.createElement("div");
    block.className = "category-block";
    block.innerHTML = `<div class="category-title">${CATEGORY_EMOJI[cat] || "🍽️"} ${cat.toUpperCase()}</div>
      <div class="menu-grid">
        ${items
          .map(
            (m) => `<div class="menu-item"><span class="emoji">${CATEGORY_EMOJI[cat] || "🍽️"}</span>${m.name}</div>`
          )
          .join("")}
      </div>`;
    container.appendChild(block);
  });
}

// ---------- Step: Identity ----------
function validateIdentity() {
  let ok = true;
  const roblox = $("#input-roblox").value.trim();
  const tiktok = $("#input-tiktok").value.trim();

  if (!roblox) {
    $("#err-roblox").classList.add("show");
    $("#input-roblox").classList.add("invalid");
    ok = false;
  } else {
    $("#err-roblox").classList.remove("show");
    $("#input-roblox").classList.remove("invalid");
  }

  if (!tiktok) {
    $("#err-tiktok").classList.add("show");
    $("#input-tiktok").classList.add("invalid");
    ok = false;
  } else {
    $("#err-tiktok").classList.remove("show");
    $("#input-tiktok").classList.remove("invalid");
  }

  if (ok) {
    state.roblox = roblox;
    state.tiktok = tiktok;
  }
  return ok;
}

// ---------- Step: Order (tray + PO + notes) ----------
function updateTrayUI() {
  $("#tray-count").textContent = state.tray;
  const total = state.tray * (state.settings?.price_per_tray || 0);
  $("#tray-total-amount").textContent = fmtMoney(total);
  $("#btn-tray-minus").disabled = state.tray <= 1;
}

function bindTrayStepper() {
  $("#btn-tray-plus").addEventListener("click", () => {
    if (state.tray < 50) state.tray++;
    updateTrayUI();
  });
  $("#btn-tray-minus").addEventListener("click", () => {
    if (state.tray > 1) state.tray--;
    updateTrayUI();
  });
}

// ---------- Step: Summary ----------
function buildSummary() {
  const total = state.tray * (state.settings?.price_per_tray || 0);
  $("#summary-roblox").textContent = state.roblox;
  $("#summary-tiktok").textContent = state.tiktok;
  $("#summary-tray").textContent = state.tray + " Tray";
  $("#summary-price-per-tray").textContent = fmtMoney(state.settings.price_per_tray) + " / Tray";
  $("#summary-total").textContent = fmtMoney(total);
  $("#summary-items").textContent = state.itemsText.trim() || "-";
  $("#summary-notes").textContent = state.notes.trim() || "-";
}

// ---------- Submit order ----------
async function submitOrder() {
  const btn = $("#btn-submit-order");
  btn.disabled = true;
  showLoading(true);
  try {
    const { data, error } = await supabase.rpc("create_order", {
      p_roblox_username: state.roblox,
      p_tiktok_username: state.tiktok,
      p_items_text: state.itemsText.trim(),
      p_tray_qty: state.tray,
      p_notes: state.notes.trim(),
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    state.lastOrder = {
      order_code: row.out_order_code,
      queue_label: row.out_queue_label,
      total_price: row.out_total_price,
      price_per_tray: row.out_price_per_tray,
    };
    renderPaymentView();
    showView("#view-payment");
  } catch (e) {
    console.error(e);
    toast(e.message || "Gagal membuat order. Coba lagi.");
    btn.disabled = false;
  } finally {
    showLoading(false);
  }
}

function renderPaymentView() {
  $("#payment-order-code").textContent = state.lastOrder.order_code;
  $("#payment-total").textContent = fmtMoney(state.lastOrder.total_price);
  const qrWrap = $("#qr-wrap");
  if (state.settings.qr_image_url) {
    qrWrap.innerHTML = `<img src="${state.settings.qr_image_url}" alt="QR Payment" />`;
  } else {
    qrWrap.innerHTML = `<div class="qr-empty">QR belum diatur oleh Admin. Hubungi admin toko untuk info pembayaran.</div>`;
  }
  $("#btn-already-paid").disabled = false;
}

async function markAlreadyPaid() {
  const btn = $("#btn-already-paid");
  btn.disabled = true;
  showLoading(true);
  try {
    const { error } = await supabase.rpc("mark_paid_by_buyer", {
      p_order_code: state.lastOrder.order_code,
    });
    if (error) throw error;
    renderSuccessView();
    showView("#view-success");
  } catch (e) {
    console.error(e);
    toast(e.message || "Gagal mengirim konfirmasi. Coba lagi.");
    btn.disabled = false;
  } finally {
    showLoading(false);
  }
}

function renderSuccessView() {
  $("#success-queue-label").textContent = state.lastOrder.queue_label;
  $("#success-order-code").textContent = state.lastOrder.order_code;
  $("#success-roblox").textContent = state.roblox;
  $("#success-tiktok").textContent = state.tiktok;
  $("#success-total").textContent = fmtMoney(state.lastOrder.total_price);
}

// ---------- Status check ----------
function statusBadge(paymentStatus, orderStatus) {
  const map = {
    "Menunggu Pembayaran": ["🟡", "badge-yellow"],
    "Menunggu Konfirmasi": ["🟠", "badge-orange"],
    "Dibayar": ["🟢", "badge-green"],
    "Pembayaran Ditolak": ["🔴", "badge-red"],
  };
  const orderMap = {
    "Menunggu": ["⚪", "badge-gray"],
    "Diproses": ["🔵", "badge-blue"],
    "Sedang Dibuat": ["🔵", "badge-blue"],
    "Siap": ["🟣", "badge-purple"],
    "Selesai": ["✅", "badge-green"],
    "Dibatalkan": ["❌", "badge-red"],
  };
  const p = map[paymentStatus] || ["⚪", "badge-gray"];
  const o = orderMap[orderStatus] || ["⚪", "badge-gray"];
  return `
    <span class="status-pill ${p[1]}">${p[0]} ${paymentStatus}</span>
    <span class="status-pill ${o[1]}">${o[0]} ${orderStatus}</span>
  `;
}

async function checkStatus() {
  const code = $("#input-status-code").value.trim();
  if (!code) {
    toast("Masukkan Order ID atau Nomor Antrian.");
    return;
  }
  showLoading(true);
  try {
    const { data, error } = await supabase.rpc("get_order_status", { p_order_code: code });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const resultBox = $("#status-result");
    if (!row) {
      resultBox.innerHTML = `<p class="hint">Order tidak ditemukan. Periksa kembali Order ID / Nomor Antrian kamu.</p>`;
      resultBox.classList.remove("hidden");
      return;
    }
    resultBox.innerHTML = `
      <div class="summary-row"><span class="label">Nomor Antrian</span><span class="value">${row.queue_label}</span></div>
      <div class="summary-row"><span class="label">Order ID</span><span class="value">${row.order_code}</span></div>
      <div class="summary-row"><span class="label">Nick Roblox</span><span class="value">${row.roblox_username}</span></div>
      <div class="summary-row"><span class="label">Total</span><span class="value">${fmtMoney(row.total_price)}</span></div>
      <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">${statusBadge(row.payment_status, row.order_status)}</div>
    `;
    resultBox.classList.remove("hidden");
  } catch (e) {
    console.error(e);
    toast("Gagal mengambil status order.");
  } finally {
    showLoading(false);
  }
}

// ---------- Navigation bindings ----------
function bindNav() {
  $("#btn-go-order").addEventListener("click", () => showView("#view-identity"));
  $("#btn-go-status-landing").addEventListener("click", () => showView("#view-status"));
  $$backButtons();

  $("#btn-identity-next").addEventListener("click", () => {
    if (!validateIdentity()) return;
    showView("#view-menu");
  });

  $("#btn-menu-next").addEventListener("click", () => {
    state.itemsText = $("#input-items").value;
    state.notes = $("#input-notes").value;
    buildSummary();
    showView("#view-summary");
  });

  $("#btn-submit-order").addEventListener("click", submitOrder);
  $("#btn-already-paid").addEventListener("click", markAlreadyPaid);
  $("#btn-success-status").addEventListener("click", () => {
    $("#input-status-code").value = state.lastOrder.order_code;
    showView("#view-status");
    checkStatus();
  });
  $("#btn-check-status").addEventListener("click", checkStatus);
  $("#btn-back-landing-from-status").addEventListener("click", () => showView("#view-landing"));
}

function $$backButtons() {
  $all("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.getAttribute("data-back")));
  });
}

// ---------- Init ----------
async function init() {
  showLoading(true);
  bindNav();
  bindTrayStepper();
  await Promise.all([loadSettings(), loadMenus()]);
  updateTrayUI();
  showLoading(false);
}

init();
