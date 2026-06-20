// ============================================================
//  TITAN MAKİNA - GÖREV YÖNETİM SİSTEMİ  |  app.js
//  Firebase is initialized BEFORE this file runs; window.db is
//  guaranteed to be available when window.appInit() is called.
// ============================================================

let currentUser = null;
let currentRole = null;
let tasks = [];
let leaves = [];
let materials = [];
let documentsList = [];
let systemUsers = [];
let unsubscribe = null;
let leavesUnsubscribe = null;
let materialsUnsubscribe = null;
let docsUnsubscribe = null;
let usersUnsubscribe = null;
let selectedLoginUser = null;
let selectedLoginRole = null;
let currentTaskFilter = 'all';
let currentWorkerTaskFilter = 'all';
let currentMaterialFilter = 'all';
let presenceInterval = null;

// DOM refs
const screens = {
    login: document.getElementById('login-screen'),
    supervisor: document.getElementById('supervisor-screen'),
    worker: document.getElementById('worker-screen')
};

const matImageInput = document.getElementById('material-image');
if (matImageInput) {
    matImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const nameEl = document.getElementById('mat-file-name-display');
        const prevEl = document.getElementById('mat-image-preview');
        if (file) {
            if (nameEl) nameEl.textContent = file.name;
            const r = new FileReader();
            r.onload = ev => { if (prevEl) { prevEl.src = ev.target.result; prevEl.style.display = 'block'; } };
            r.readAsDataURL(file);
        } else {
            if (nameEl) nameEl.textContent = 'Fotoğraf Ekle (Opsiyonel)';
            if (prevEl) { prevEl.src = ''; prevEl.style.display = 'none'; }
        }
    });
}

const loginForm = document.getElementById('login-form');
const addTaskForm = document.getElementById('add-task-form');
const leaveForm = document.getElementById('leave-form');
const materialForm = document.getElementById('material-form');
const supervisorTasks = document.getElementById('supervisor-tasks');
const workerTasks = document.getElementById('worker-tasks');
const logoutBtns = document.querySelectorAll('.logout-btn');
const toastContainer = document.getElementById('toast-container');
const taskImageInput = document.getElementById('task-image');
const fileNameDisplay = document.getElementById('file-name-display');
const imagePreview = document.getElementById('image-preview');
const submitTaskBtn = document.getElementById('submit-task-btn');
const docsForm = document.getElementById('docs-form');

// Called by the Firebase module script after window.db is ready
window.appInit = function () { init(); };

// ─── LOGIN ──────────────────────────────────────────────────

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Artık bireysel satırlardan giriş yapıldığı için genel form submit sadece fallback
        if (!selectedLoginUser) return;
    });
}

function handleInlineLogin(userName, userRole, btnElement) {
    const cardGroup = btnElement.closest('.login-card-group');
    const passwordInput = cardGroup.querySelector('.inline-password-input');
    const rememberMe = cardGroup.querySelector('.remember-me-checkbox');
    const passVal = passwordInput.value.trim();

    if (!passVal) { showToast('Lütfen şifrenizi girin.', 'lock'); return; }

    btnElement.disabled = true;
    btnElement.innerHTML = '<span class="material-icons-round spinning" style="font-size:1rem;margin-right:2px">sync</span>...';

    const user = systemUsers.find(u => u.name === userName);
    if (user && user.password === passVal) {
        if (rememberMe && rememberMe.checked) {
            localStorage.setItem(`remember_${userName}`, passVal);
        } else {
            localStorage.removeItem(`remember_${userName}`);
        }
        login(user.name, user.role);
    } else {
        showToast('Hatalı şifre girdiniz.', 'lock');
    }

    btnElement.disabled = false;
    btnElement.innerHTML = 'Giriş <span class="material-icons-round" style="font-size:1rem;margin-left:2px">arrow_forward</span>';
}

// ─── TELEGRAM BİLDİRİM SİSTEMİ ─────────────────────────────
// ⚠️  Aşağıdaki iki değişkeni doldurun:
//   1) TELEGRAM_BOT_TOKEN : @BotFather'dan aldığınız bot token
//   2) SUPERVISOR_CHAT_ID : Sizin kişisel Telegram Chat ID'niz
//      (bota /start yazdıktan sonra https://api.telegram.org/bot<TOKEN>/getUpdates
//       adresinden "chat":{"id": ... } alanından öğrenebilirsiniz)

const TELEGRAM_BOT_TOKEN = '8510730673:AAFQPairc0cKhxzIEL_0hCmS-fxj84lm72U';
const SUPERVISOR_CHAT_ID = '8192869692';

async function sendTelegramNotification(chatId, message) {
    if (!chatId || !TELEGRAM_BOT_TOKEN ||
        TELEGRAM_BOT_TOKEN === 'BURAYA_BOT_TOKEN_GIRIN' ||
        String(chatId) === 'BURAYA_CHAT_ID_GIRIN') return;
    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
        });
    } catch (e) {
        console.warn('Telegram bildirimi gönderilemedi:', e);
    }
}

function getWorkerChatId(workerName) {
    const user = systemUsers.find(u => u.name === workerName);
    return user && user.telegramChatId ? user.telegramChatId : null;
}

async function saveTelegramChatId(userId, chatId) {
    try {
        await window.updateDoc(window.doc(window.db, 'users', userId), { telegramChatId: chatId.trim() });
        showToast('Telegram Chat ID kaydedildi! ✅', 'telegram');
        // systemUsers dizisini de güncelle
        const u = systemUsers.find(u => u.id === userId);
        if (u) u.telegramChatId = chatId.trim();
    } catch (e) {
        showToast('Kaydedilemedi!', 'error');
    }
}
window.saveTelegramChatId = saveTelegramChatId;

window.saveWorkerTelegramId = async function () {
    const input = document.getElementById('wrk-tg-chat-id');
    const statusEl = document.getElementById('wrk-tg-status');
    if (!input || !input.value.trim()) {
        showToast('Lütfen Chat ID girin.', 'error');
        return;
    }
    const me = systemUsers.find(u => u.name === currentUser);
    if (!me) { showToast('Kullanıcı bulunamadı.', 'error'); return; }
    await saveTelegramChatId(me.id, input.value.trim());
    if (statusEl) {
        statusEl.innerHTML = `<span style="color:var(--clr-success)">✅ Bildirimler aktif (Chat ID: ${input.value.trim()})</span>`;
    }
};

// ─── PRESENCE / ONLINE STATUS ───────────────────────────────

const PRESENCE_HEARTBEAT_MS = 30000;  // 30 saniye
const PRESENCE_STALE_MS = 90000;      // 90 saniye → bu süreden eski lastSeen = offline kabul

function formatLastSeen(ts) {
    if (!ts) return 'Hiç giriş yapmadı';
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return 'Az önce';
    if (diff < 3600) return `${Math.floor(diff / 60)} dakika önce`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
    return `${Math.floor(diff / 86400)} gün önce`;
}

// Kullanıcının gerçekten çevrimiçi olup olmadığını kontrol et (isOnline + lastSeen tazeliği)
function isUserTrulyOnline(user) {
    if (!user.isOnline) return false;
    if (!user.lastSeen) return false;
    const elapsed = Date.now() - new Date(user.lastSeen).getTime();
    return elapsed < PRESENCE_STALE_MS;
}

async function setUserPresence(isOnline) {
    const me = systemUsers.find(u => u.name === currentUser);
    if (!me) return;
    try {
        await window.updateDoc(window.doc(window.db, 'users', me.id), {
            isOnline,
            lastSeen: new Date().toISOString()
        });
    } catch (e) { /* sessizce geç */ }
}

function startPresenceHeartbeat() {
    stopPresenceHeartbeat();
    setUserPresence(true);
    presenceInterval = setInterval(() => setUserPresence(true), PRESENCE_HEARTBEAT_MS);
}

function stopPresenceHeartbeat() {
    if (presenceInterval) { clearInterval(presenceInterval); presenceInterval = null; }
}

function listenForUsers() {
    if (usersUnsubscribe) usersUnsubscribe();
    const q = window.collection(window.db, 'users');
    usersUnsubscribe = window.onSnapshot(q, (snap) => {
        snap.forEach(d => {
            const idx = systemUsers.findIndex(u => u.id === d.id);
            if (idx > -1) {
                systemUsers[idx] = { id: d.id, ...d.data() };
            } else {
                systemUsers.push({ id: d.id, ...d.data() });
            }
        });
        // Ekip sekmesi açıksa anlık güncelle
        if (currentRole === 'supervisor') renderSystemUsers();
    });
}

// Sekme/tarayıcı kapanırken offline işaretle (fetch + keepalive, sendBeacon yerine)
window.addEventListener('beforeunload', () => {
    const me = systemUsers.find(u => u.name === currentUser);
    if (!me) return;
    stopPresenceHeartbeat();
    // fetch keepalive: PATCH metodu destekler (sendBeacon yalnızca POST destekliyor)
    try {
        const url = `https://firestore.googleapis.com/v1/projects/${window.db.app.options.projectId}/databases/(default)/documents/users/${me.id}?updateMask.fieldPaths=isOnline&updateMask.fieldPaths=lastSeen`;
        const body = JSON.stringify({ fields: { isOnline: { booleanValue: false }, lastSeen: { stringValue: new Date().toISOString() } } });
        fetch(url, { method: 'PATCH', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
    } catch (e) { /* silent */ }
});

document.addEventListener('visibilitychange', () => {
    if (!currentUser) return;
    if (document.visibilityState === 'hidden') {
        stopPresenceHeartbeat();
        setUserPresence(false);
    } else {
        startPresenceHeartbeat();
    }
});

let presenceRefreshInterval = null;
function startPresenceRefresh() {
    stopPresenceRefresh();
    presenceRefreshInterval = setInterval(() => {
        if (currentRole === 'supervisor') renderSystemUsers();
    }, PRESENCE_HEARTBEAT_MS);
}
function stopPresenceRefresh() {
    if (presenceRefreshInterval) { clearInterval(presenceRefreshInterval); presenceRefreshInterval = null; }
}

if (addTaskForm) {
    addTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('task-title').value.trim();
        const worker = document.getElementById('worker-select').value;
        const priority = document.querySelector('input[name="priority"]:checked').value;
        const file = taskImageInput ? taskImageInput.files[0] : null;
        if (title && worker) {
            submitTaskBtn.disabled = true;
            submitTaskBtn.innerHTML = '<span class="material-icons-round spinning">sync</span> Yükleniyor...';
            await addTask(title, worker, priority, file);
            addTaskForm.reset();
            if (imagePreview) { imagePreview.style.display = 'none'; imagePreview.src = ''; }
            if (fileNameDisplay) fileNameDisplay.textContent = 'Fotoğraf Ekle (Opsiyonel)';
            submitTaskBtn.disabled = false;
            submitTaskBtn.innerHTML = '<span class="material-icons-round">send</span> Görevi Ata';
        }
    });
}

if (leaveForm) {
    leaveForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submit-leave-btn');
        const start = document.getElementById('leave-start').value;
        const end = document.getElementById('leave-end').value;
        if (!start || !end) return;
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round spinning">sync</span> Gönderiliyor...';
        try {
            await window.addDoc(window.collection(window.db, "leaves"), {
                worker: currentUser, start, end, status: 'pending',
                timestamp: new Date().toISOString()
            });
            showToast('İzin talebi gönderildi.', 'event_available');
            leaveForm.reset();
            renderLeaveCalendar();
            const startFmt = new Date(start).toLocaleDateString('tr-TR');
            const endFmt = new Date(end).toLocaleDateString('tr-TR');
            await sendTelegramNotification(
                SUPERVISOR_CHAT_ID,
                `📅 <b>Titan Makina - İzin Talebi</b>\n\n👷 <b>${currentUser}</b> izin talebinde bulundu.\n🗓 ${startFmt} → ${endFmt}\n\nLütfen uygulamayı kontrol edin.`
            );
        } catch (e) {
            showToast('İzin talebi gönderilemedi.', 'error');
        }
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons-round">send</span> İzin Talebi Gönder';
    });
}

if (materialForm) {
    materialForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submit-material-btn');
        const name = document.getElementById('material-name').value.trim();
        const desc = document.getElementById('material-desc').value.trim();
        if (!name) return;
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round spinning">sync</span> Gönderiliyor...';

        let imageUrl = null;
        const fileInput = document.getElementById('material-image');
        if (fileInput && fileInput.files[0]) {
            try { imageUrl = await compressImage(fileInput.files[0]); }
            catch (e) { showToast('Resim işleme hatası!', 'error'); }
        }

        try {
            await window.addDoc(window.collection(window.db, "materials"), {
                worker: currentUser,
                name,
                desc,
                imageUrl,
                status: 'pending',
                comments: [],
                timestamp: new Date().toISOString()
            });
            showToast('Malzeme talebi gönderildi.', 'inventory_2');
            materialForm.reset();
            const nameEl = document.getElementById('mat-file-name-display');
            const prevEl = document.getElementById('mat-image-preview');
            if (nameEl) nameEl.textContent = 'Fotoğraf Ekle (Opsiyonel)';
            if (prevEl) { prevEl.src = ''; prevEl.style.display = 'none'; }
            await sendTelegramNotification(
                SUPERVISOR_CHAT_ID,
                `📦 <b>Titan Makina - Malzeme Talebi</b>\n\n👷 <b>${currentUser}</b> malzeme talep etti.\n📋 <b>${name}</b>${desc ? '\n📝 ' + desc : ''}\n\nLütfen uygulamayı kontrol edin.`
            );
        } catch (e) {
            showToast('Talep gönderilemedi.', 'error');
        }
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons-round">send</span> Talep Gönder';
    });
}

function login(username, role, showWelcome = true) {
    currentUser = username;
    currentRole = role;
    localStorage.setItem('titan_user', username);
    localStorage.setItem('titan_role', role);
    document.querySelectorAll('.current-user-name').forEach(el => el.textContent = username);
    switchScreen(role === 'supervisor' ? 'supervisor' : 'worker');
    if (showWelcome) showToast(`Hoş geldin, ${username}!`, 'waving_hand');
    listenForTasks();
    listenForLeaves();
    listenForMaterials();
    listenForDocuments();
    listenForOvertimes();
    listenForUsers();
    startPresenceRefresh();
    setTimeout(() => startPresenceHeartbeat(), 1500);
}

function logout() {
    stopPresenceHeartbeat();
    stopPresenceRefresh();
    setUserPresence(false);
    currentUser = null; currentRole = null;
    localStorage.removeItem('titan_user'); localStorage.removeItem('titan_role');
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (leavesUnsubscribe) { leavesUnsubscribe(); leavesUnsubscribe = null; }
    if (overtimesUnsubscribe) { overtimesUnsubscribe(); overtimesUnsubscribe = null; }
    if (materialsUnsubscribe) { materialsUnsubscribe(); materialsUnsubscribe = null; }
    if (docsUnsubscribe) { docsUnsubscribe(); docsUnsubscribe = null; }
    if (usersUnsubscribe) { usersUnsubscribe(); usersUnsubscribe = null; }
    switchScreen('login');
    showToast('Çıkış yapıldı', 'logout');
    fetchUsers();
}

window.switchTab = function (role, tabName, navItem) {
    const prefix = role === 'supervisor' ? 'sup' : 'wrk';
    document.querySelectorAll(`#${role}-screen .tab-content`).forEach(t => t.classList.remove('active'));
    document.querySelectorAll(`#${role}-screen .nav-item`).forEach(n => n.classList.remove('active'));
    const tab = document.getElementById(`${prefix}-tab-${tabName}`);
    if (tab) tab.classList.add('active');
    if (navItem) navItem.classList.add('active');
    if (tabName === 'calendar') {
        renderLeaveCalendar();
        if (role === 'supervisor') renderSupervisorLeaves();
        if (role === 'worker') renderWorkerLeaves();
    }
    if (tabName === 'materials') {
        if (role === 'supervisor') { renderSupervisorMaterials(); updateMaterialStats(); }
        if (role === 'worker') renderWorkerMaterials();
    }
    if (tabName === 'overtime') {
        if (role === 'supervisor') renderSupervisorOvertimes();
        if (role === 'worker') {
            renderWorkerOvertimes();
            const dateInput = document.getElementById('overtime-date');
            if (dateInput && !dateInput.value) {
                dateInput.value = new Date().toISOString().split('T')[0];
            }
        }
    }
    if (tabName === 'profile') renderSystemUsers();
};

function listenForDocuments() {}
function listenForTasks() {}
function listenForLeaves() {}
function listenForMaterials() {}
function renderLeaveCalendar() {}
function renderSupervisorLeaves() {}
function renderWorkerLeaves() {}
function renderSupervisorMaterials() {}
function renderWorkerMaterials() {}
function renderSystemUsers() {}
function updateMaterialStats() {}
function switchScreen() {}
function fetchUsers() {}
function compressImage() {}
function showToast() {}

let overtimes = [];
let overtimesUnsubscribe = null;

function listenForOvertimes() {
    if (overtimesUnsubscribe) overtimesUnsubscribe();
    const q = window.query(window.collection(window.db, 'overtimes'), window.orderBy('timestamp', 'desc'));
    overtimesUnsubscribe = window.onSnapshot(q, (snap) => {
        overtimes = [];
        snap.forEach(d => overtimes.push({ id: d.id, ...d.data() }));
        if (currentRole === 'supervisor') renderSupervisorOvertimes();
        if (currentRole === 'worker') renderWorkerOvertimes();
    });
}

window.handleOvertimeSubmit = async function () {
    const btn = document.getElementById('submit-overtime-btn');
    const date = document.getElementById('overtime-date').value;
    const reason = document.getElementById('overtime-reason').value;
    const decision = document.getElementById('overtime-decision').value;
    if (!date) {
        showToast('Lütfen mesai tarihi seçiniz.', 'warning');
        return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round spinning">sync</span> Gönderiliyor...';
    try {
        await window.addDoc(window.collection(window.db, 'overtimes'), {
            worker: currentUser,
            date,
            reason,
            decision,
            status: 'pending',
            timestamp: new Date().toISOString()
        });
        showToast('Mesai durumu gönderildi.', 'event_available');
        const form = document.getElementById('overtime-form');
        if (form) form.reset();
        const dateInput = document.getElementById('overtime-date');
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

        const dateFmt = new Date(date).toLocaleDateString('tr-TR');
        const reasonText = reason ? `\n📝 ${reason}` : '';
        const decisionText = decision === 'will_stay' ? '✅ Kalacak' : '❌ Kalmayacak';
        await sendTelegramNotification(
            SUPERVISOR_CHAT_ID,
            `🕒 <b>Titan Makina - Mesai Bildirimi</b>\n\n👷 <b>${currentUser}</b> mesai durumu bildirdi.\n🗓 ${dateFmt}\n📌 Durum: <b>${decisionText}</b>${reasonText}\n\nLütfen uygulamayı kontrol edin.`
        );
    } catch (e) {
        showToast('Mesai bildirimi gönderilemedi.', 'error');
    }
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons-round">send</span> Mesai Talebi Gönder';
};

window.updateOvertimeStatus = async function (overtimeId, status) {
    try {
        await window.updateDoc(window.doc(window.db, 'overtimes', overtimeId), { status });
        const msg = status === 'approved' ? 'Mesai onaylandı.' : 'Mesai reddedildi.';
        const icon = status === 'approved' ? 'thumb_up' : 'thumb_down';
        showToast(msg, icon);
        const ov = overtimes.find(o => o.id === overtimeId);
        if (ov) {
            const workerChatId = getWorkerChatId(ov.worker);
            const statusEmoji = status === 'approved' ? '✅' : '❌';
            const statusText = status === 'approved' ? 'ONAYLANDI' : 'REDDEDİLDİ';
            const dateFmt = new Date(ov.date).toLocaleDateString('tr-TR');
            await sendTelegramNotification(
                workerChatId,
                `${statusEmoji} <b>Titan Makina - Mesai Talebi ${statusText}</b>\n\n🗓 ${dateFmt} tarihli mesai talebiniz <b>${statusText}</b>.`
            );
        }
    } catch (e) {
        showToast('Durum güncellenemedi', 'error');
    }
};

window.deleteOvertime = async function (overtimeId) {
    try {
        await window.deleteDoc(window.doc(window.db, 'overtimes', overtimeId));
        showToast('Mesai talebi silindi.', 'delete');
    } catch (e) {
        showToast('Silinemedi!', 'error');
    }
};

function renderSupervisorOvertimes() {
    const list = document.getElementById('supervisor-overtimes');
    if (!list) return;
    if (overtimes.length === 0) {
        list.innerHTML = '<div class="empty-state">Henüz mesai talebi yok.</div>';
        return;
    }
    list.innerHTML = '';
    overtimes.forEach(ov => {
        const sd = new Date(ov.date).toLocaleDateString('tr-TR');
        const statusMap = {
            pending:  { cls: 'pending', label: 'Bekliyor' },
            approved: { cls: 'completed', label: 'Onaylandı' },
            rejected: { cls: 'urgent', label: 'Reddedildi' }
        };
        const decisionMap = {
            will_stay: { cls: 'completed', label: 'Kalacak', icon: 'done' },
            will_not_stay: { cls: 'urgent', label: 'Kalmayacak', icon: 'close' }
        };
        const st = statusMap[ov.status] || statusMap.pending;
        const dec = decisionMap[ov.decision] || { cls: 'muted', label: 'Belirtilmedi', icon: 'help_outline' };
        const actions = ov.status === 'pending' ? `
            <div class="task-actions" onclick="event.stopPropagation()" style="gap:.5rem;margin-top:.8rem">
                <button class="action-btn success" onclick="window.updateOvertimeStatus('${ov.id}','approved', event)">
                    <span class="material-icons-round">thumb_up</span> Onayla
                </button>
                <button class="action-btn danger" onclick="window.updateOvertimeStatus('${ov.id}','rejected', event)">
                    <span class="material-icons-round">thumb_down</span> Reddet
                </button>
                <button class="action-btn danger" onclick="window.deleteOvertime('${ov.id}', event)">
                    <span class="material-icons-round">delete</span> Sil
                </button>
            </div>` : `
            <div class="task-actions" onclick="event.stopPropagation()" style="gap:.5rem;margin-top:.8rem">
                <button class="action-btn danger" onclick="window.deleteOvertime('${ov.id}', event)">
                    <span class="material-icons-round">delete</span> Sil
                </button>
            </div>`;
        list.insertAdjacentHTML('beforeend', `
            <div class="task-card" onclick="window.toggleTaskCard(this, event)">
                <div class="task-header">
                    <div class="task-title"><span class="material-icons-round" style="font-size:1rem;vertical-align:middle">person</span> ${ov.worker}</div>
                </div>
                ${ov.reason ? `<div style="font-size:.9rem;color:var(--text-color);margin:.5rem 0">${ov.reason}</div>` : ''}
                <div class="task-chips">
                    <span class="chip chip-muted"><span class="material-icons-round">event</span> ${sd}</span>
                    <span class="chip chip-${dec.cls}"><span class="material-icons-round" style="font-size:1rem">${dec.icon}</span> ${dec.label}</span>
                    <span class="chip chip-${st.cls}">${st.label}</span>
                </div>
                ${actions}
            </div>
        `);
    });
}

function renderWorkerOvertimes() {
    const list = document.getElementById('worker-overtimes');
    if (!list) return;
    const myOvertimes = overtimes.filter(ov => ov.worker === currentUser);
    if (myOvertimes.length === 0) {
        list.innerHTML = '<div class="empty-state">Henüz onaylanmış veya bekleyen bir mesai bulunmuyor.</div>';
        return;
    }
    list.innerHTML = '';
    myOvertimes.forEach(ov => {
        const sd = new Date(ov.date).toLocaleDateString('tr-TR');
        const statusMap = {
            pending: { cls: 'pending', label: 'Bekliyor' },
            approved: { cls: 'completed', label: 'Onaylandı' },
            rejected: { cls: 'urgent', label: 'Reddedildi' }
        };
        const decisionMap = {
            will_stay: { cls: 'completed', label: 'Kalacak', icon: 'done' },
            will_not_stay: { cls: 'urgent', label: 'Kalmayacak', icon: 'close' }
        };
        const st = statusMap[ov.status] || statusMap.pending;
        const dec = decisionMap[ov.decision] || { cls: 'muted', label: 'Belirtilmedi', icon: 'help_outline' };
        const actions = ov.status === 'pending' ? `
            <div class="task-actions" style="margin-top:.8rem">
                <button class="action-btn danger" onclick="window.deleteOvertime('${ov.id}')">
                    <span class="material-icons-round">delete</span> İptal Et
                </button>
            </div>` : '';
        list.insertAdjacentHTML('beforeend', `
            <div class="task-card">
                <div class="task-header">
                    <div class="task-title"><span class="material-icons-round" style="font-size:1rem;vertical-align:middle">more_time</span> Mesai Talebim</div>
                </div>
                ${ov.reason ? `<div style="font-size:.9rem;color:var(--text-color);margin:.5rem 0">${ov.reason}</div>` : ''}
                <div class="task-chips">
                    <span class="chip chip-muted"><span class="material-icons-round">event</span> ${sd}</span>
                    <span class="chip chip-${dec.cls}"><span class="material-icons-round" style="font-size:1rem">${dec.icon}</span> ${dec.label}</span>
                    <span class="chip chip-${st.cls}">${st.label}</span>
                </div>
                ${actions}
            </div>
        `);
    });
}
