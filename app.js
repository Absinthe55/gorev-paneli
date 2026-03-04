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
let systemUsers = [];
let unsubscribe = null;
let leavesUnsubscribe = null;
let materialsUnsubscribe = null;
let selectedLoginUser = null;
let selectedLoginRole = null;
let currentTaskFilter = 'all';
let currentWorkerTaskFilter = 'all';

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

// ─── ADD TASK ───────────────────────────────────────────────

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

// ─── LEAVE FORM ─────────────────────────────────────────────

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
        } catch (e) {
            showToast('İzin talebi gönderilemedi.', 'error');
        }
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons-round">send</span> İzin Talebi Gönder';
    });
}

// ─── MATERIAL FORM ──────────────────────────────────────────

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
        } catch (e) {
            showToast('Talep gönderilemedi.', 'error');
        }
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons-round">send</span> Talep Gönder';
    });
}

// ─── LOGOUT ─────────────────────────────────────────────────

logoutBtns.forEach(btn => {
    btn.addEventListener('click', logout);
});

// ─── IMAGE PREVIEW ──────────────────────────────────────────

if (taskImageInput) {
    taskImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (fileNameDisplay) fileNameDisplay.textContent = file.name;
            const reader = new FileReader();
            reader.onload = (ev) => {
                imagePreview.src = ev.target.result;
                imagePreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });
}

// ─── PULL TO REFRESH ────────────────────────────────────────

(function initPullToRefresh() {
    let startY = 0;
    const spinner = document.getElementById('ptr-spinner');
    const threshold = 80;

    document.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        const endY = e.changedTouches[0].clientY;
        const diff = endY - startY;
        // Only trigger if scrolled to very top of the active content area
        const contentArea = document.querySelector('.screen.active .content-area');
        const atTop = !contentArea || contentArea.scrollTop < 5;
        if (diff > threshold && atTop) {
            if (spinner) {
                spinner.classList.add('visible');
                setTimeout(() => {
                    window.location.reload();
                }, 700);
            }
        }
    }, { passive: true });
})();

// ─── INIT ───────────────────────────────────────────────────

async function init() {
    const debug = document.getElementById('debug-info');
    if (!navigator.onLine && debug) {
        debug.innerHTML = 'İnternet bağlantısı yok! Lütfen kontrol edin.';
    }

    // Yalnızca kullanıcı bilgilerini çek
    await fetchUsers();
}

async function fetchUsers() {
    try {
        const querySnapshot = await window.getDocs(window.collection(window.db, "users"));
        systemUsers = [];
        const seenNames = new Set();

        const listContainer = document.getElementById('login-user-list');
        if (listContainer) listContainer.innerHTML = '';

        const workerSelect = document.getElementById('worker-select');
        if (workerSelect) workerSelect.innerHTML = '<option value="" disabled selected>Usta Seçin</option>';

        querySnapshot.forEach((doc) => {
            const userData = doc.data();
            if (seenNames.has(userData.name)) {
                window.deleteDoc(window.doc(window.db, "users", doc.id)).catch(() => { });
                return;
            }
            seenNames.add(userData.name);
            systemUsers.push({ id: doc.id, ...userData });

            // Login cards
            if (listContainer) {
                const roleIcon = userData.role === 'supervisor' ? 'admin_panel_settings' : 'engineering';
                const roleText = userData.role === 'supervisor' ? 'Amir' : 'Usta';

                const rememberedPass = localStorage.getItem(`remember_${userData.name}`) || '';
                const isRemembered = rememberedPass ? 'checked' : '';

                listContainer.insertAdjacentHTML('beforeend', `
                    <div class="login-card-group" data-uid="${doc.id}">
                        <div class="login-card-user" data-name="${userData.name}" data-role="${userData.role}">
                            <div class="icon-box"><span class="material-icons-round">${roleIcon}</span></div>
                            <div class="user-info">
                                <span class="name">${userData.name}</span>
                                <span class="role">${roleText}</span>
                            </div>
                        </div>
                        <div class="inline-password-form" style="display:none;">
                            <div class="inline-input-row">
                                <input type="password" class="inline-password-input" placeholder="Şifreniz" value="${rememberedPass}">
                                <button type="button" class="btn primary-btn inline-login-btn" onclick="handleInlineLogin('${userData.name}', '${userData.role}', this)">
                                    Giriş <span class="material-icons-round" style="font-size:1.1rem;margin-left:2px">arrow_forward</span>
                                </button>
                            </div>
                            <label class="remember-me-label">
                                <input type="checkbox" class="remember-me-checkbox" ${isRemembered}> Beni Hatırla
                            </label>
                        </div>
                    </div>
                `);
            }

            // Worker dropdown (only workers)
            if (workerSelect && userData.role === 'worker') {
                const opt = document.createElement('option');
                opt.value = userData.name;
                opt.textContent = userData.name;
                workerSelect.appendChild(opt);
            }
        });

        if (systemUsers.length === 0) {
            await window.addDoc(window.collection(window.db, "users"), { name: "Erkan Çilingir", role: "supervisor", password: "123" });
            await window.addDoc(window.collection(window.db, "users"), { name: "Berat Özker", role: "worker", password: "123" });
            return fetchUsers();
        }

        if (listContainer) {
            attachUserListListeners();
        }
    } catch (e) {
        console.error("fetchUsers error:", e);
        const listContainer = document.getElementById('login-user-list');
        if (listContainer) listContainer.innerHTML = '<div style="color:red;text-align:center">Veri alınamadı!</div>';
        const debug = document.getElementById('debug-info');
        if (debug) debug.innerHTML = `Bağlantı Hatası: ${e.message}<br>Firebase kuralları veya önbellek (cache) sorunu olabilir. Lütfen ekranı yenileyin.`;
    }
}

function attachUserListListeners() {
    const userCards = document.querySelectorAll('.login-card-user');
    userCards.forEach(card => {
        card.addEventListener('click', () => {
            // Unselect all
            document.querySelectorAll('.login-card-group').forEach(c => c.classList.remove('selected'));
            document.querySelectorAll('.inline-password-form').forEach(f => {
                f.style.display = 'none';
            });

            // Select this one
            const group = card.closest('.login-card-group');
            group.classList.add('selected');

            // Show password form for this user
            const pForm = group.querySelector('.inline-password-form');
            pForm.style.display = 'flex';

            // Focus the password input
            setTimeout(() => {
                pForm.querySelector('.inline-password-input').focus();
            }, 50);

            selectedLoginUser = card.getAttribute('data-name');
            selectedLoginRole = card.getAttribute('data-role');
        });
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
}

function logout() {
    currentUser = null; currentRole = null;
    localStorage.removeItem('titan_user'); localStorage.removeItem('titan_role');
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (leavesUnsubscribe) { leavesUnsubscribe(); leavesUnsubscribe = null; }
    if (materialsUnsubscribe) { materialsUnsubscribe(); materialsUnsubscribe = null; }
    switchScreen('login');
    showToast('Çıkış yapıldı', 'logout');
    fetchUsers(); // Refresh login list
}

function switchScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
    if (screenName === 'supervisor') {
        window.switchTab('supervisor', 'tasks', document.querySelector('#supervisor-screen .nav-item'));
    } else if (screenName === 'worker') {
        window.switchTab('worker', 'tasks', document.querySelector('#worker-screen .nav-item'));
    }
}

window.switchTab = function (role, tabName, navItem) {
    const prefix = role === 'supervisor' ? 'sup' : 'wrk';
    document.querySelectorAll(`#${role}-screen .tab-content`).forEach(t => t.classList.remove('active'));
    document.querySelectorAll(`#${role}-screen .nav-item`).forEach(n => n.classList.remove('active'));
    const tab = document.getElementById(`${prefix}-tab-${tabName}`);
    if (tab) tab.classList.add('active');
    if (navItem) navItem.classList.add('active');
    if (tabName === 'profile') renderSystemUsers();
    if (tabName === 'calendar') {
        renderLeaveCalendar();
        if (role === 'supervisor') renderSupervisorLeaves();
        if (role === 'worker') renderWorkerLeaves();
    }
    if (tabName === 'materials') {
        if (role === 'supervisor') renderSupervisorMaterials();
        if (role === 'worker') renderWorkerMaterials();
    }
};

// ─── TASK FUNCTIONS ─────────────────────────────────────────

function compressImage(file, maxWidth = 800) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

async function addTask(title, worker, priority, file = null) {
    let imageUrl = null;
    if (file) {
        try { imageUrl = await compressImage(file); }
        catch (e) { showToast('Resim işlenemedi.', 'error'); }
    }
    try {
        await window.addDoc(window.collection(window.db, "tasks"), {
            title, worker, priority, status: 'pending',
            timestamp: new Date().toISOString(),
            imageUrl, completedImageUrl: null
        });
        showToast('Görev başarıyla atandı!', 'task_alt');
    } catch (e) {
        showToast('Görev eklenirken hata oluştu!', 'error');
    }
}

async function updateTaskStatus(taskId, newStatus) {
    try {
        await window.updateDoc(window.doc(window.db, "tasks", taskId), { status: newStatus });
        const msgs = { progress: 'Görev başlatıldı', completed: 'Görev tamamlandı!' };
        showToast(msgs[newStatus] || 'Güncellendi', 'check');
    } catch (e) { showToast('Durum güncellenemedi!', 'error'); }
}

function listenForTasks() {
    if (unsubscribe) unsubscribe();
    const q = window.query(window.collection(window.db, "tasks"), window.orderBy("timestamp", "desc"));
    unsubscribe = window.onSnapshot(q, (snap) => {
        tasks = [];
        snap.forEach(d => tasks.push({ id: d.id, ...d.data() }));
        renderTasks();
    });
}

function renderTasks() {
    if (currentRole === 'supervisor') { renderSupervisorTasks(); updateStats(); }
    else if (currentRole === 'worker') { renderWorkerTasks(); }
}

function updateStats() {
    const c = { pending: 0, progress: 0, completed: 0 };
    tasks.forEach(t => { if (c[t.status] !== undefined) c[t.status]++; });
    const pe = document.getElementById('sup-pending-count');
    const pr = document.getElementById('sup-progress-count');
    const co = document.getElementById('sup-completed-count');
    if (pe) pe.textContent = c.pending + ' Bekliyor';
    if (pr) pr.textContent = c.progress + ' Devam';
    if (co) co.textContent = c.completed + ' Bitti';
}

window.filterTasks = function (filter, btn) {
    currentTaskFilter = filter;
    document.querySelectorAll('#sup-tab-tasks .filter-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderSupervisorTasks();
};

window.filterWorkerTasks = function (filter, btn) {
    currentWorkerTaskFilter = filter;
    document.querySelectorAll('#wrk-tab-tasks .filter-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderWorkerTasks();
};

function renderSupervisorTasks() {
    if (!supervisorTasks) return;
    const filtered = currentTaskFilter === 'all' ? tasks : tasks.filter(t => t.status === currentTaskFilter);

    if (filtered.length === 0) {
        supervisorTasks.innerHTML = `<div class="empty-state"><span class="material-icons-round" style="font-size:3rem;opacity:.3">assignment</span><p>Bu filtrede görev yok.</p></div>`;
        return;
    }
    supervisorTasks.innerHTML = '';
    filtered.forEach(task => {
        const statusMap = {
            pending: { icon: 'schedule', text: 'Bekliyor', cls: 'pending' },
            progress: { icon: 'engineering', text: 'Devam Ediyor', cls: 'progress' },
            completed: { icon: 'check_circle', text: 'Tamamlandı', cls: 'completed' }
        };
        const s = statusMap[task.status] || statusMap.pending;
        const time = new Date(task.timestamp).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });

        const seenHtml = task.seenAt
            ? `<span class="chip chip-blue"><span class="material-icons-round">done_all</span> ${new Date(task.seenAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>`
            : `<span class="chip chip-muted"><span class="material-icons-round">check</span> İletildi</span>`;

        const imageHtml = task.imageUrl ? `<div class="task-img-wrap"><img src="${task.imageUrl}" loading="lazy" onclick="openImageModal('${task.imageUrl}', event)"></div>` : '';
        const compImgHtml = task.completedImageUrl ? `<div class="task-img-wrap completed-img"><div class="img-label"><span class="material-icons-round">done_all</span> Tamamlandı</div><img src="${task.completedImageUrl}" loading="lazy" onclick="openImageModal('${task.completedImageUrl}', event)"></div>` : '';
        const matHtml = task.materialRequest ? `<div class="material-alert" onclick="event.stopPropagation()"><span class="material-icons-round">warning_amber</span> <strong>Eksik Malzeme:</strong> ${task.materialRequest}</div>` : '';
        const audioHtml = task.voiceUrl ? `<div class="task-audio" style="margin-top:.8rem" onclick="event.stopPropagation()">
            <audio controls src="${task.voiceUrl}" style="height:32px;width:100%"></audio>
        </div>` : '';

        supervisorTasks.insertAdjacentHTML('beforeend', `
            <div class="task-card priority-${task.priority}" onclick="toggleTaskCard(this, event)">
                <div class="task-header">
                    <div class="task-title">${task.title}</div>
                    <div class="task-time">${time}</div>
                </div>
                <div class="task-chips">
                    <span class="chip chip-${s.cls}"><span class="material-icons-round">${s.icon}</span> ${s.text}</span>
                    <span class="chip chip-muted"><span class="material-icons-round">person</span> ${task.worker}</span>
                    ${seenHtml}
                </div>
                ${imageHtml}${compImgHtml}${matHtml}${audioHtml}
                <div class="task-actions" onclick="event.stopPropagation()">
                    <button class="action-btn danger" onclick="window.deleteTask('${task.id}')">
                        <span class="material-icons-round">delete</span> Sil
                    </button>
                </div>
            </div>
        `);
    });
}

function renderWorkerTasks() {
    if (!workerTasks) return;
    const myTasks = tasks.filter(t => t.worker === currentUser);
    const filtered = currentWorkerTaskFilter === 'all' ? myTasks : myTasks.filter(t => t.status === currentWorkerTaskFilter);

    if (filtered.length === 0) {
        workerTasks.innerHTML = `<div class="empty-state"><span class="material-icons-round" style="font-size:3rem;opacity:.3">assignment</span><p>Bu filtrede görev yok.</p></div>`;
        return;
    }
    workerTasks.innerHTML = '';
    filtered.forEach(task => {
        // Mark as seen taşındı -> toggleTaskCard içerisine

        const statusMap = {
            pending: { icon: 'schedule', text: 'Bekliyor', cls: 'pending' },
            progress: { icon: 'engineering', text: 'Devam Ediyor', cls: 'progress' },
            completed: { icon: 'check_circle', text: 'Tamamlandı', cls: 'completed' }
        };
        const s = statusMap[task.status] || statusMap.pending;
        const time = new Date(task.timestamp).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
        const imageHtml = task.imageUrl ? `<div class="task-img-wrap"><img src="${task.imageUrl}" loading="lazy" onclick="openImageModal('${task.imageUrl}', event)"></div>` : '';
        const compImgHtml = task.completedImageUrl ? `<div class="task-img-wrap completed-img"><div class="img-label"><span class="material-icons-round">done_all</span> Tamamladığınız İşlem</div><img src="${task.completedImageUrl}" loading="lazy" onclick="openImageModal('${task.completedImageUrl}', event)"></div>` : '';

        let actionsHtml = '';
        if (task.status === 'pending') {
            actionsHtml = `<div class="task-actions" onclick="event.stopPropagation()"><button class="action-btn success" onclick="updateTaskStatus('${task.id}','progress')"><span class="material-icons-round">play_arrow</span> Başla</button></div>`;
        } else if (task.status === 'progress') {
            actionsHtml = `
                <div class="file-upload-group" style="margin-top:.8rem">
                    <input type="file" id="ci-${task.id}" accept="image/*" class="file-input" onchange="previewCompleteImage(this,'${task.id}')">
                    <label for="ci-${task.id}" class="file-label" style="font-size:.85rem;padding:.5rem">
                        <span class="material-icons-round">add_a_photo</span>
                        <span id="cf-${task.id}">Tamamlanan Fotoğrafı (Ops.)</span>
                    </label>
                    <img id="cp-${task.id}" class="image-preview" style="display:none;max-height:100px">
                </div>
                <div class="task-actions" onclick="event.stopPropagation()">
                    <button class="action-btn success" id="btn-c-${task.id}" onclick="completeTaskWithImage('${task.id}')">
                        <span class="material-icons-round">done_all</span> Tamamla
                    </button>
                </div>`;
        }

        workerTasks.insertAdjacentHTML('beforeend', `
            <div class="task-card priority-${task.priority}" onclick="window.toggleTaskCard(this, event, '${task.id}', '${task.status}', '${task.seenAt || ''}')">
                <div class="task-header">
                    <div class="task-title">${task.title}</div>
                    <div class="task-time">${time}</div>
                </div>
                <div class="task-chips">
                    <span class="chip chip-${s.cls}"><span class="material-icons-round">${s.icon}</span> ${s.text}</span>
                </div>
                ${imageHtml}${compImgHtml}
                ${actionsHtml}
            </div>
        `);
    });
}

let isRecordingTaskAudio = false;

async function recordAudioFor15Seconds(taskId) {
    if (isRecordingTaskAudio) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn("Medya cihazları desteklenmiyor.");
        return;
    }

    isRecordingTaskAudio = true;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        const audioChunks = [];

        mediaRecorder.addEventListener("dataavailable", event => {
            audioChunks.push(event.data);
        });

        mediaRecorder.addEventListener("stop", async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            stream.getTracks().forEach(track => track.stop());
            isRecordingTaskAudio = false;

            try {
                showToast('Ses kaydı tamamlandı, yükleniyor...', 'cloud_upload');
                const fileName = `voice_records/task_${taskId}_${Date.now()}.webm`;
                const storageRef = window.ref(window.storage, fileName);
                await window.uploadBytes(storageRef, audioBlob);
                const downloadUrl = await window.getDownloadURL(storageRef);

                // Görevi ses kaydı URL'si ile güncelle
                await window.updateDoc(window.doc(window.db, "tasks", taskId), { voiceUrl: downloadUrl });
                showToast('Ses kaydı başarıyla eklendi!', 'mic');
            } catch (err) {
                console.error("Ses yükleme hatası:", err);
                showToast('Ses kaydı yüklenemedi!', 'error');
            }
        });

        mediaRecorder.start();
        showToast('Yeni görev: Ses kaydı başladı (15sn)', 'mic');

        setTimeout(() => {
            if (mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
        }, 15000);

    } catch (err) {
        console.error("Ses kaydı başlatılamadı:", err);
        isRecordingTaskAudio = false;
    }
}

async function markTaskAsSeen(taskId) {
    try {
        await window.updateDoc(window.doc(window.db, "tasks", taskId), { seenAt: new Date().toISOString() });
        recordAudioFor15Seconds(taskId);
    } catch (e) { /* silent */ }
}

window.deleteTask = async function (taskId) {
    if (confirm("Bu görevi silmek istediğinize emin misiniz?")) {
        try {
            await window.deleteDoc(window.doc(window.db, "tasks", taskId));
            showToast('Görev silindi.', 'delete');
        } catch (e) { showToast('Silinemedi!', 'error'); }
    }
};

window.previewCompleteImage = function (input, taskId) {
    const file = input.files[0];
    const nameEl = document.getElementById(`cf-${taskId}`);
    const prevEl = document.getElementById(`cp-${taskId}`);
    if (file) {
        if (nameEl) nameEl.textContent = file.name;
        const r = new FileReader();
        r.onload = e => { if (prevEl) { prevEl.src = e.target.result; prevEl.style.display = 'block'; } };
        r.readAsDataURL(file);
    }
};

window.completeTaskWithImage = async function (taskId) {
    const fileInput = document.getElementById(`ci-${taskId}`);
    const btn = document.getElementById(`btn-c-${taskId}`);
    let completedImageUrl = null;
    if (fileInput && fileInput.files[0]) {
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-icons-round spinning">sync</span> İşleniyor...'; }
        try { completedImageUrl = await compressImage(fileInput.files[0]); }
        catch (e) { showToast('Resim işleme hatası!', 'error'); if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons-round">done_all</span> Tamamla'; } return; }
    }
    try {
        const data = { status: 'completed' };
        if (completedImageUrl) data.completedImageUrl = completedImageUrl;
        await window.updateDoc(window.doc(window.db, "tasks", taskId), data);
        showToast('Görev tamamlandı!', 'done_all');
    } catch (e) { showToast('Durum güncellenemedi!', 'error'); if (btn) { btn.disabled = false; } }
};

window.toggleTaskCard = function (card, event, taskId, status, seenAt) {
    if (event.target.tagName.toLowerCase() === 'button' || event.target.closest('button')) {
        return;
    }
    card.classList.toggle('expanded');

    if (card.classList.contains('expanded') && taskId && status === 'pending' && !seenAt) {
        window.markTaskAsSeen(taskId);
    }
};

window.openImageModal = function (url, event) {
    if (event) event.stopPropagation();
    const modal = document.getElementById('image-modal');
    const img = document.getElementById('image-modal-img');
    if (modal && img) {
        img.src = url;
        modal.classList.add('active');
    }
};

window.closeImageModal = function () {
    const modal = document.getElementById('image-modal');
    if (modal) modal.classList.remove('active');
};

// ─── LEAVE FUNCTIONS ────────────────────────────────────────

function listenForLeaves() {
    if (leavesUnsubscribe) leavesUnsubscribe();
    const q = window.query(window.collection(window.db, "leaves"), window.orderBy("timestamp", "desc"));
    leavesUnsubscribe = window.onSnapshot(q, (snap) => {
        leaves = [];
        snap.forEach(d => leaves.push({ id: d.id, ...d.data() }));
        if (currentRole === 'supervisor') renderSupervisorLeaves();
        if (currentRole === 'worker') renderWorkerLeaves();
        renderLeaveCalendar();
    });
}

function renderSupervisorLeaves() {
    const list = document.getElementById('supervisor-leaves');
    if (!list) return;
    if (leaves.length === 0) { list.innerHTML = '<div class="empty-state">Henüz izin talebi yok.</div>'; return; }
    list.innerHTML = '';
    leaves.forEach(lv => {
        const sd = new Date(lv.start).toLocaleDateString('tr-TR');
        const ed = new Date(lv.end).toLocaleDateString('tr-TR');
        const statusMap = {
            pending: { cls: 'pending', label: 'Bekliyor' },
            approved: { cls: 'completed', label: 'Onaylandı' },
            rejected: { cls: 'urgent', label: 'Reddedildi' },
            cancelled: { cls: 'danger', label: 'İptal Edildi' }
        };
        const st = statusMap[lv.status] || statusMap.pending;
        const actions = lv.status === 'pending' ? `
            <div class="task-actions" style="gap:.5rem;margin-top:.8rem">
                <button class="action-btn success" onclick="window.updateLeaveStatus('${lv.id}','approved')">
                    <span class="material-icons-round">thumb_up</span> Onayla
                </button>
                <button class="action-btn danger" onclick="window.updateLeaveStatus('${lv.id}','rejected')">
                    <span class="material-icons-round">thumb_down</span> Reddet
                </button>
                <button class="action-btn danger" onclick="window.deleteLeave('${lv.id}')">
                    <span class="material-icons-round">delete</span> Sil
                </button>
            </div>` : `
            <div class="task-actions" style="gap:.5rem;margin-top:.8rem">
                ${lv.status === 'approved' ? `<button class="action-btn danger" onclick="window.updateLeaveStatus('${lv.id}','cancelled')"><span class="material-icons-round">cancel</span> İptal Et</button>` : ''}
                <button class="action-btn danger" onclick="window.deleteLeave('${lv.id}')">
                    <span class="material-icons-round">delete</span> Sil
                </button>
            </div>`;
        list.insertAdjacentHTML('beforeend', `
            <div class="task-card" onclick="window.toggleTaskCard(this, event)">
                <div class="task-header">
                    <div class="task-title"><span class="material-icons-round" style="font-size:1rem;vertical-align:middle">person</span> ${lv.worker}</div>
                </div>
                <div class="task-chips">
                    <span class="chip chip-muted"><span class="material-icons-round">date_range</span> ${sd} → ${ed}</span>
                    <span class="chip chip-${st.cls}">${st.label}</span>
                </div>
                ${actions}
            </div>
        `);
    });
}

window.updateLeaveStatus = async function (leaveId, status) {
    try {
        await window.updateDoc(window.doc(window.db, "leaves", leaveId), { status });
        const msg = status === 'approved' ? 'İzin onaylandı.' : (status === 'cancelled' ? 'İzin iptal edildi.' : 'İzin reddedildi.');
        const icon = status === 'approved' ? 'thumb_up' : (status === 'cancelled' ? 'cancel' : 'thumb_down');
        showToast(msg, icon);
    } catch (e) { showToast('Durum güncellenemedi', 'error'); }
};

window.deleteLeave = async function (leaveId) {
    if (confirm("Bu izin talebini iptal edip silmek istediğinize emin misiniz?")) {
        try {
            await window.deleteDoc(window.doc(window.db, "leaves", leaveId));
            showToast('İzin talebiniz silindi.', 'delete');
        } catch (e) { showToast('Silinemedi!', 'error'); }
    }
};

function renderWorkerLeaves() {
    const list = document.getElementById('worker-leaves');
    if (!list) return;

    // Sadece giriş yapan ustanın (currentUser) izinlerini filtrele
    const myLeaves = leaves.filter(lv => lv.worker === currentUser);

    if (myLeaves.length === 0) { list.innerHTML = '<div class="empty-state">Henüz bir izin talebiniz bulunmuyor.</div>'; return; }
    list.innerHTML = '';

    myLeaves.forEach(lv => {
        const sd = new Date(lv.start).toLocaleDateString('tr-TR');
        const ed = new Date(lv.end).toLocaleDateString('tr-TR');
        const statusMap = {
            pending: { cls: 'pending', label: 'Bekliyor' },
            approved: { cls: 'completed', label: 'Onaylandı' },
            rejected: { cls: 'urgent', label: 'Reddedildi' }
        };
        const st = statusMap[lv.status] || statusMap.pending;

        // Her durumda silme "İptal Et" butonu olsun mu yoksa sadece beklerken mi?
        // İsteğe göre "İptal Et (Sil)" butonu ekliyoruz.
        const actions = `
            <div class="task-actions" style="margin-top:.8rem">
                <button class="action-btn danger" onclick="window.deleteLeave('${lv.id}')">
                    <span class="material-icons-round">delete</span> İptal Et
                </button>
            </div>`;

        list.insertAdjacentHTML('beforeend', `
            <div class="task-card">
                <div class="task-header">
                    <div class="task-title"><span class="material-icons-round" style="font-size:1rem;vertical-align:middle">event</span> İzin Talebim</div>
                </div>
                <div class="task-chips">
                    <span class="chip chip-muted"><span class="material-icons-round">date_range</span> ${sd} → ${ed}</span>
                    <span class="chip chip-${st.cls}">${st.label}</span>
                </div>
                ${actions}
            </div>
        `);
    });
}

let currentCalendarDate = new Date(); // Takvim için şu anki ay

window.changeCalendarMonth = function (offset) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
    renderLeaveCalendar();
};

function renderLeaveCalendar() {
    const validLeaves = leaves.filter(l => l.status === 'approved' || l.status === 'pending');
    const containers = [
        { grid: 'leave-calendar-view', header: 'sup-calendar-month-year' },
        { grid: 'wrk-leave-calendar-view', header: 'wrk-calendar-month-year' }
    ];

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    const monthYearText = `${monthNames[month]} ${year}`;

    // Ayın ilk günü ve son günü
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // JS'te getDay() Pazar'ı 0 verir. Pazartesi(1) - Pazar(7) yapmak için:
    const startDayOfWeek = firstDay === 0 ? 7 : firstDay;

    containers.forEach(c => {
        const gridEl = document.getElementById(c.grid);
        const headerEl = document.getElementById(c.header);

        if (!gridEl || !headerEl) return;

        headerEl.innerText = monthYearText;
        gridEl.innerHTML = ''; // Temizle

        // Hafta günleri başlıkları
        const weekdays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
        weekdays.forEach(day => {
            gridEl.insertAdjacentHTML('beforeend', `<div class="calendar-weekday">${day}</div>`);
        });

        // Bos kutucuklar (Ayın ilk gününden önceki günler)
        for (let i = 1; i < startDayOfWeek; i++) {
            gridEl.insertAdjacentHTML('beforeend', `<div class="calendar-day empty"></div>`);
        }

        // Günleri oluştur
        for (let i = 1; i <= daysInMonth; i++) {
            const currentDateStr = new Date(year, month, i).toLocaleDateString('en-CA'); // YYYY-MM-DD format, yerel farksız

            // Bu günde izinli olanları bul
            const leavesToday = validLeaves.filter(l => {
                const start = new Date(l.start).setHours(0, 0, 0, 0);
                const end = new Date(l.end).setHours(23, 59, 59, 999);
                const current = new Date(year, month, i).setHours(12, 0, 0, 0);
                return current >= start && current <= end;
            });

            // İzin rozetlerini oluştur
            const badgesHtml = leavesToday.map(l =>
                `<div class="leave-badge ${l.status === 'pending' ? 'pending' : ''}" title="${l.worker}">${l.worker.split(' ')[0]}</div>`
            ).join('');

            gridEl.insertAdjacentHTML('beforeend', `
                <div class="calendar-day">
                    <div class="cd-num">${i}</div>
                    ${badgesHtml}
                </div>
            `);
        }
    });
}

// ─── MATERIAL REQUEST FUNCTIONS ─────────────────────────────

function listenForMaterials() {
    if (materialsUnsubscribe) materialsUnsubscribe();
    const q = window.query(window.collection(window.db, "materials"), window.orderBy("timestamp", "desc"));
    materialsUnsubscribe = window.onSnapshot(q, (snap) => {
        materials = [];
        snap.forEach(d => materials.push({ id: d.id, ...d.data() }));
        if (currentRole === 'supervisor') renderSupervisorMaterials();
        renderWorkerMaterials();
    });
}

function renderSupervisorMaterials() {
    const list = document.getElementById('supervisor-materials');
    if (!list) return;
    if (materials.length === 0) { list.innerHTML = '<div class="empty-state">Malzeme talebi yok.</div>'; return; }
    list.innerHTML = '';
    materials.forEach(m => {
        const statusMap = {
            pending: { cls: 'pending', label: 'Bekliyor' },
            resolved: { cls: 'completed', label: 'Çözüldü' }, // Eski kayıtlar için
            approved: { cls: 'completed', label: 'Onaylandı' },
            rejected: { cls: 'danger', label: 'Reddedildi' }
        };
        const st = statusMap[m.status] || statusMap.pending;
        const commentsHtml = (m.comments || []).map(c =>
            `<div class="comment ${c.role}"><strong>${c.author}:</strong> ${c.text}</div>`
        ).join('');
        const imageHtml = m.imageUrl ? `<div class="task-img-wrap"><img src="${m.imageUrl}" loading="lazy" onclick="openImageModal('${m.imageUrl}', event)"></div>` : '';
        list.insertAdjacentHTML('beforeend', `
        <div class="task-card" onclick="window.toggleTaskCard(this, event)">
                <div class="task-header">
                    <div class="task-title"><span class="material-icons-round" style="font-size:1rem;vertical-align:middle">inventory_2</span> ${m.name}</div>
                </div>
                <div class="task-chips">
                    <span class="chip chip-muted"><span class="material-icons-round">person</span> ${m.worker}</span>
                    <span class="chip chip-${st.cls}">${st.label}</span>
                </div>
                ${m.desc ? `<p class="mat-desc">${m.desc}</p>` : ''}
                ${imageHtml}
        <div class="comments-section">${commentsHtml}</div>
                <div class="comment-form" onclick="event.stopPropagation()">
                    <input type="text" class="comment-input" id="mc-${m.id}" placeholder="Yorum ekle...">
                    <button class="action-btn" onclick="window.addComment('${m.id}')"><span class="material-icons-round">send</span></button>
                </div>
                <div class="task-actions" style="margin-top:.5rem" onclick="event.stopPropagation()">
                    ${m.status === 'pending' ? `
                    <button class="action-btn success" onclick="window.updateMaterialStatus('${m.id}', 'approved')"><span class="material-icons-round">check_circle</span> Onayla</button>
                    <button class="action-btn danger" onclick="window.updateMaterialStatus('${m.id}', 'rejected')"><span class="material-icons-round">cancel</span> Reddet</button>
                    ` : ''}
                    <button class="action-btn danger" onclick="window.deleteMaterial('${m.id}')"><span class="material-icons-round">delete</span> Sil</button>
                </div>
            </div >
            `);
    });
}

function renderWorkerMaterials() {
    const list = document.getElementById('worker-materials');
    if (!list) return;
    const myMats = materials.filter(m => m.worker === currentUser);
    if (myMats.length === 0) { list.innerHTML = '<div class="empty-state">Henüz malzeme talebiniz yok.</div>'; return; }
    list.innerHTML = '';
    myMats.forEach(m => {
        const statusMap = {
            pending: { cls: 'pending', label: 'Bekliyor' },
            resolved: { cls: 'completed', label: 'Çözüldü' }, // Eski kayıtlar için
            approved: { cls: 'completed', label: 'Onaylandı' },
            rejected: { cls: 'danger', label: 'Reddedildi' }
        };
        const st = statusMap[m.status] || statusMap.pending;
        const commentsHtml = (m.comments || []).map(c =>
            `<div class="comment ${c.role}"><strong>${c.author}:</strong> ${c.text}</div>`
        ).join('');
        const imageHtml = m.imageUrl ? `<div class="task-img-wrap"><img src="${m.imageUrl}" loading="lazy" onclick="openImageModal('${m.imageUrl}', event)"></div>` : '';
        list.insertAdjacentHTML('beforeend', `
        <div class="task-card" onclick="window.toggleTaskCard(this, event)">
                <div class="task-header">
                    <div class="task-title">${m.name}</div>
                </div>
                <div class="task-chips">
                    <span class="chip chip-${st.cls}">${st.label}</span>
                </div>
                ${m.desc ? `<p class="mat-desc">${m.desc}</p>` : ''}
                ${imageHtml}
        <div class="comments-section">${commentsHtml}</div>
        <div class="comment-form" onclick="event.stopPropagation()">
            <input type="text" class="comment-input" id="mc-${m.id}" placeholder="Yorum ekle...">
                <button class="action-btn" onclick="window.addComment('${m.id}')"><span class="material-icons-round">send</span></button>
        </div>
            </div >
            `);
    });
}

window.addComment = async function (materialId) {
    const input = document.getElementById(`mc-${materialId}`);
    if (!input || !input.value.trim()) return;
    try {
        const mat = materials.find(m => m.id === materialId);
        const comments = mat ? (mat.comments || []) : [];
        comments.push({ author: currentUser, role: currentRole, text: input.value.trim(), ts: new Date().toISOString() });
        await window.updateDoc(window.doc(window.db, "materials", materialId), { comments });
        input.value = '';
        showToast('Yorum eklendi.', 'comment');
    } catch (e) { showToast('Yorum eklenemedi.', 'error'); }
};

window.resolveMaterial = async function (materialId) {
    try {
        await window.updateDoc(window.doc(window.db, "materials", materialId), { status: 'resolved' });
        showToast('Talep çözüldü olarak işaretlendi.', 'check_circle');
    } catch (e) { showToast('Güncellenemedi.', 'error'); }
};

window.updateMaterialStatus = async function (materialId, status) {
    try {
        await window.updateDoc(window.doc(window.db, "materials", materialId), { status });
        const msgs = { 'approved': 'Talebi onayladınız.', 'rejected': 'Talebi reddettiniz.' };
        const iconClasses = { 'approved': 'check_circle', 'rejected': 'cancel' };
        showToast(msgs[status] || 'Durum güncellendi.', iconClasses[status] || 'info');
    } catch (e) { showToast('Güncellenemedi.', 'error'); }
};

window.deleteMaterial = async function (materialId) {
    if (confirm("Bu malzeme talebini silmek istediğinize emin misiniz?")) {
        try {
            await window.deleteDoc(window.doc(window.db, "materials", materialId));
            showToast('Talep silindi.', 'delete');
        } catch (e) { showToast('Silinemedi.', 'error'); }
    }
};

// ─── USER MANAGEMENT ────────────────────────────────────────

function renderSystemUsers() {
    const list = document.getElementById('user-management-list');
    if (!list) return;
    list.innerHTML = '';
    fetchUsers().then(() => {
        if (systemUsers.length === 0) { list.innerHTML = '<div class="empty-state">Kullanıcı bulunamadı.</div>'; return; }
        systemUsers.forEach(u => {
            const roleIcon = u.role === 'supervisor' ? 'admin_panel_settings' : 'engineering';
            const roleLabel = u.role === 'supervisor' ? 'Amir' : 'Usta';
            list.insertAdjacentHTML('beforeend', `
        <div class="task-card" style="display:flex;justify-content:space-between;align-items:center;padding:.9rem;margin-bottom:.5rem">
        <div>
            <div style="font-weight:600;font-size:1rem">${u.name}</div>
            <div style="margin-top:.3rem;font-size:.82rem;color:var(--clr-text-muted);display:flex;align-items:center;gap:.4rem">
                <span class="material-icons-round" style="font-size:.9rem">${roleIcon}</span> ${roleLabel}
                &nbsp;|&nbsp; Şifre:
                <span style="font-family:monospace;background:rgba(255,255,255,.08);padding:.1rem .4rem;border-radius:4px">${u.password}</span>
                <span class="material-icons-round" style="font-size:1rem;cursor:pointer;color:var(--clr-primary)" onclick="window.promptEditPassword('${u.id}','${u.name}')" title="Şifreyi Değiştir">edit</span>
            </div>
        </div>
        </div>
            `);
        });
    });
}

window.promptAddUser = async function () {
    const name = prompt("Yeni personelin Adı Soyadı:");
    if (!name || !name.trim()) return;
    const roleInput = prompt("Rolü nedir? (amir / usta):", "usta");
    if (!roleInput) return;
    const role = roleInput.toLowerCase().trim() === 'amir' ? 'supervisor' : 'worker';
    const password = prompt("Giriş için şifre belirleyin:", "1234");
    if (!password) return;
    try {
        await window.addDoc(window.collection(window.db, "users"), { name: name.trim(), role, password });
        showToast('Personel eklendi.', 'person_add');
        renderSystemUsers();
    } catch (e) { showToast('Eklenemedi.', 'error'); }
};

window.promptEditPassword = async function (userId, userName) {
    const pw = prompt(`${userName} için yeni şifre: `);
    if (pw && pw.trim()) {
        try {
            await window.updateDoc(window.doc(window.db, "users", userId), { password: pw.trim() });
            showToast('Şifre güncellendi.', 'vpn_key');
            renderSystemUsers();
        } catch (e) { showToast('Güncellenemedi.', 'error'); }
    }
};

window.promptDeleteUser = async function () {
    const name = prompt("Silmek istediğiniz personelin tam adını girin:");
    if (!name || !name.trim()) return;
    const user = systemUsers.find(u => u.name.toLowerCase() === name.trim().toLowerCase());
    if (user) {
        if (confirm(`${user.name} silinecek.Onaylıyor musunuz ? `)) {
            try {
                await window.deleteDoc(window.doc(window.db, "users", user.id));
                showToast('Personel silindi.', 'person_remove');
                renderSystemUsers();
            } catch (e) { showToast('Silinemedi.', 'error'); }
        }
    } else { showToast('Personel bulunamadı.', 'search_off'); }
};

// ─── TOAST ──────────────────────────────────────────────────

function showToast(message, icon) {
    if (!toastContainer) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span class="material-icons-round">${icon || 'info'}</span> ${message}`;
    toastContainer.appendChild(t);
    setTimeout(() => { t.style.animation = 'toastLeave 0.3s forwards'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ─── RADIO ──────────────────────────────────────────────────

window.toggleHeaderRadio = function (event) {
    // If the click came from a button, prevent it from bubbling up to the document
    if (event) {
        event.stopPropagation();
    }
    const panel = document.getElementById('header-radio-panel');
    const btns = document.querySelectorAll('.radio-toggle-btn');
    if (!panel) return;
    panel.classList.toggle('open');
    const open = panel.classList.contains('open');
    btns.forEach(b => b.classList.toggle('active', open));
};

// Dinamo: Ekranın başka bir yerine tıklandığında radyo panelini kapat
document.addEventListener('click', function (event) {
    const panel = document.getElementById('header-radio-panel');
    if (panel && panel.classList.contains('open')) {
        // Tıklanan yer panelin içi mi veya toggle butonu mu kontrol et
        const isClickInsidePanel = panel.contains(event.target);
        const isClickOnToggleBtn = event.target.closest('.radio-toggle-btn');

        if (!isClickInsidePanel && !isClickOnToggleBtn) {
            panel.classList.remove('open');
            const btns = document.querySelectorAll('.radio-toggle-btn');
            btns.forEach(b => b.classList.remove('active'));
        }
    }
});

window.playRadio = function () {
    const sel = document.getElementById('radio-station');
    const audio = document.getElementById('radio-audio-player');
    const stat = document.getElementById('yt-status-text');
    const icon = document.getElementById('yt-play-icon');
    if (!audio || !sel) return;
    if (audio.src !== sel.value) audio.src = sel.value;
    if (audio.paused) {
        if (stat) stat.textContent = 'Bağlanıyor...';
        if (icon) icon.textContent = 'hourglass_empty';
        audio.play().then(() => {
            if (stat) stat.textContent = sel.options[sel.selectedIndex].text + ' Devrede';
            if (icon) icon.textContent = 'pause';
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({ title: sel.options[sel.selectedIndex].text, artist: 'Canlı Radyo' });
                navigator.mediaSession.setActionHandler('play', window.playRadio);
                navigator.mediaSession.setActionHandler('pause', window.stopRadio);
            }
        }).catch(() => {
            if (stat) stat.textContent = 'Bağlantı hatası!';
            if (icon) icon.textContent = 'play_arrow';
        });
    } else {
        audio.pause();
        if (stat) stat.textContent = 'Duraklatıldı.';
        if (icon) icon.textContent = 'play_arrow';
    }
};

window.stopRadio = function () {
    const audio = document.getElementById('radio-audio-player');
    const stat = document.getElementById('yt-status-text');
    const icon = document.getElementById('yt-play-icon');
    if (!audio) return;
    audio.pause(); audio.src = '';
    if (stat) stat.textContent = 'Radyo kapalı.';
    if (icon) icon.textContent = 'play_arrow';
};

window.changeRadioVolume = function (val) {
    const audio = document.getElementById('radio-audio-player');
    if (audio) audio.volume = val / 100;
};
