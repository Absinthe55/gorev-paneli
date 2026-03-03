// State
let currentUser = null;
let currentRole = null;
let tasks = [];
let leaves = [];
let unsubscribe = null; // To hold the Firestore listener
let leavesUnsubscribe = null;
// DOM Elements
const screens = {
    login: document.getElementById('login-screen'),
    supervisor: document.getElementById('supervisor-screen'),
    worker: document.getElementById('worker-screen')
};

const addTaskForm = document.getElementById('add-task-form');
const leaveForm = document.getElementById('leave-form');
const supervisorTasks = document.getElementById('supervisor-tasks');
const workerTasks = document.getElementById('worker-tasks');
const logoutBtns = document.querySelectorAll('.logout-btn');
const toastContainer = document.getElementById('toast-container');
const taskImageInput = document.getElementById('task-image');
const fileNameDisplay = document.getElementById('file-name-display');
const imagePreview = document.getElementById('image-preview');
const submitTaskBtn = document.getElementById('submit-task-btn');

// Event Listeners
document.addEventListener('DOMContentLoaded', init);

addTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('task-title').value.trim();
    const worker = document.getElementById('worker-select').value;
    const priority = document.querySelector('input[name="priority"]:checked').value;
    const file = taskImageInput.files[0];

    if (title && worker) {
        // Disable button during upload
        submitTaskBtn.disabled = true;
        submitTaskBtn.innerHTML = '<span class="material-icons-round">hourglass_empty</span> Yükleniyor...';

        await addTask(title, worker, priority, file);

        addTaskForm.reset();
        imagePreview.style.display = 'none';
        imagePreview.src = '';
        fileNameDisplay.textContent = 'Fotoğraf Ekle (Opsiyonel)';

        submitTaskBtn.disabled = false;
        submitTaskBtn.innerHTML = '<span class="material-icons-round">add_task</span> Görevi Gönder';
    }
});

taskImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        fileNameDisplay.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        fileNameDisplay.textContent = 'Fotoğraf Ekle (Opsiyonel)';
        imagePreview.style.display = 'none';
        imagePreview.src = '';
    }
});

logoutBtns.forEach(btn => btn.addEventListener('click', logout));

// Functions
function init() {
    // Check local storage for session
    const savedUser = localStorage.getItem('titan_user');
    const savedRole = localStorage.getItem('titan_role');

    if (savedUser && savedRole) {
        login(savedUser, savedRole, false);
    }
}

function login(username, role, showToastData = true) {
    currentUser = username;
    currentRole = role;

    // Save session
    localStorage.setItem('titan_user', username);
    localStorage.setItem('titan_role', role);

    // Update UI info
    document.querySelectorAll('.current-user-name').forEach(el => {
        el.textContent = username;
    });

    // Switch screen
    switchScreen(role === 'supervisor' ? 'supervisor' : 'worker');

    if (showToastData) {
        showToast(`Hoş geldin, ${username} (${role === 'supervisor' ? 'Amir' : 'Usta'})`, 'login');
    }

    listenForTasks();
    listenForLeaves();
}

function logout() {
    currentUser = null;
    currentRole = null;
    localStorage.removeItem('titan_user');
    localStorage.removeItem('titan_role');
    switchScreen('login');
    showToast('Çıkış yapıldı', 'logout');
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
    if (leavesUnsubscribe) {
        leavesUnsubscribe();
        leavesUnsubscribe = null;
    }
}

function switchScreen(screenName) {
    Object.values(screens).forEach(screen => {
        screen.classList.remove('active');
    });
    screens[screenName].classList.add('active');
}

// Resizes and converts image to base64
function compressImage(file, maxWidth = 800) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Compress to JPEG with 0.7 quality to keep size small enough for Firestore
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                resolve(dataUrl);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}

async function addTask(title, worker, priority, file = null) {
    let imageUrl = null;

    // Convert image to base64 if selected
    if (file) {
        try {
            imageUrl = await compressImage(file);
        } catch (error) {
            console.error("Error processing image:", error);
            showToast('Resim işlenemedi, sadece metin eklenecek.', 'error');
        }
    }

    const newTask = {
        title,
        worker,
        priority,
        status: 'pending',
        timestamp: new Date().toISOString(),
        imageUrl: imageUrl, // Save image URL if exists
        completedImageUrl: null
    };

    try {
        const docRef = await window.addDoc(window.collection(window.db, "tasks"), newTask);
        showToast('Görev başarıyla atandı!', 'task_alt');
    } catch (e) {
        console.error("Error adding document: ", e);
        showToast('Görev eklenirken hata oluştu!', 'error');
    }
}

async function updateTaskStatus(taskId, newStatus) {
    try {
        const taskRef = window.doc(window.db, "tasks", taskId);
        await window.updateDoc(taskRef, {
            status: newStatus
        });

        const statusMsgs = {
            'progress': 'Görev başlatıldı',
            'completed': 'Görev tamamlandı!'
        };
        showToast(statusMsgs[newStatus], 'update');
    } catch (e) {
        console.error("Error updating document: ", e);
        showToast('Durum güncellenemedi!', 'error');
    }
}

function listenForTasks() {
    if (unsubscribe) unsubscribe();

    const q = window.query(window.collection(window.db, "tasks"), window.orderBy("timestamp", "desc"));

    unsubscribe = window.onSnapshot(q, (querySnapshot) => {
        tasks = [];
        querySnapshot.forEach((doc) => {
            tasks.push({ id: doc.id, ...doc.data() });
        });
        renderTasks();
    });
}

function renderTasks() {
    if (currentRole === 'supervisor') {
        renderSupervisorTasks();
        updateStats();
    } else if (currentRole === 'worker') {
        renderWorkerTasks();
    }
}

function updateStats() {
    const counts = {
        pending: tasks.filter(t => t.status === 'pending').length,
        progress: tasks.filter(t => t.status === 'progress').length,
        completed: tasks.filter(t => t.status === 'completed').length
    };

    document.getElementById('sup-pending-count').textContent = `${counts.pending} Bekliyor`;
    document.getElementById('sup-progress-count').textContent = `${counts.progress} Devam Ediyor`;
    document.getElementById('sup-completed-count').textContent = `${counts.completed} Biten`;
}

function listenForLeaves() {
    if (leavesUnsubscribe) leavesUnsubscribe();
    const q = window.query(window.collection(window.db, "leaves"), window.orderBy("timestamp", "desc"));
    leavesUnsubscribe = window.onSnapshot(q, (querySnapshot) => {
        leaves = [];
        querySnapshot.forEach((doc) => {
            leaves.push({ id: doc.id, ...doc.data() });
        });

        if (currentRole === 'supervisor') {
            renderSupervisorLeaves();
        }
    });
}

function renderSupervisorTasks() {
    supervisorTasks.innerHTML = '';

    if (tasks.length === 0) {
        supervisorTasks.innerHTML = '<div class="hint">Henüz görev atamadınız.</div>';
        return;
    }

    tasks.forEach(task => {
        const priorityClass = task.priority === 'high' ? 'priority-high' : '';
        const statusClass = `status-${task.status}`;

        let statusIcon, statusText;
        if (task.status === 'pending') { statusIcon = 'schedule'; statusText = 'Bekliyor'; }
        else if (task.status === 'progress') { statusIcon = 'engineering'; statusText = 'Yapılıyor'; }
        else { statusIcon = 'check_circle'; statusText = 'Tamamlandı'; }

        const timeString = new Date(task.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

        let imageHtml = '';
        if (task.imageUrl) {
            imageHtml = `
            <div class="task-image-container">
                <img src="${task.imageUrl}" alt="Görev Görseli" loading="lazy">
            </div>`;
        }

        if (task.completedImageUrl) {
            imageHtml += `
            <div class="task-image-container" style="border-color: var(--clr-status-completed)">
                <div style="padding:4px 8px; font-size: 0.8rem; background: rgba(16, 185, 129, 0.2); color: #34d399;">Tamamlanan İşlem:</div>
                <img src="${task.completedImageUrl}" alt="Tamamlanan İşlem Görseli" loading="lazy">
            </div>`;
        }

        let seenHtml = '';
        if (task.seenAt) {
            const seenTime = new Date(task.seenAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            seenHtml = `
            <div class="meta-item" title="Görüldü Zamanı" style="color: #60a5fa;">
                <span class="material-icons-round" style="font-size: 1rem;">done_all</span>
                ${seenTime}
            </div>`;
        } else {
            seenHtml = `
            <div class="meta-item" title="İletildi, henüz bakılmadı" style="opacity: 0.5;">
                <span class="material-icons-round" style="font-size: 1rem;">check</span>
                İletildi
            </div>`;
        }

        let materialHtml = '';
        if (task.materialRequest) {
            materialHtml = `
                <div style="margin-top:0.5rem; padding: 0.75rem; background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b; font-size: 0.85rem; color: #fcd34d; border-radius: 0 4px 4px 0;">
                    <span class="material-icons-round" style="font-size: 1rem; vertical-align: middle; margin-right: 0.3rem;">warning</span>
                    <strong>Eksik Malzeme İsteniyor:</strong> ${task.materialRequest}
                </div>
            `;
        }

        const html = `
            <div class="task-card ${priorityClass} ${statusClass}">
                <div class="task-header">
                    <div class="task-title">${task.title}</div>
                    <div class="task-time">${timeString}</div>
                </div>
                <div class="task-meta">
                    <div class="meta-item" title="Atanan Usta">
                        <span class="material-icons-round">person</span>
                        ${task.worker}
                    </div>
                    <div class="meta-item status-text-${task.status}" title="Durum">
                        <span class="material-icons-round">${statusIcon}</span>
                        ${statusText}
                    </div>
                    ${seenHtml}
                </div>
                ${imageHtml}
                ${materialHtml}
                <div class="task-actions">
                    <button class="action-btn" style="background: rgba(239, 68, 68, 0.1); color: var(--clr-status-urgent); border: 1px solid rgba(239, 68, 68, 0.3);" onclick="deleteTask('${task.id}')">
                        <span class="material-icons-round">delete_outline</span> Sil
                    </button>
                </div>
            </div>
        `;
        supervisorTasks.insertAdjacentHTML('beforeend', html);
    });
}

function renderWorkerTasks() {
    workerTasks.innerHTML = '';

    // Filter tasks only for the currently logged in worker
    const myTasks = tasks.filter(t => t.worker === currentUser);

    if (myTasks.length === 0) {
        workerTasks.innerHTML = '<div class="hint">Size atanmış görev bulunmuyor.</div>';
        return;
    }

    myTasks.forEach(task => {
        // Log "seen" receipt if not already recorded
        if (!task.seenAt && task.status === 'pending') {
            markTaskAsSeen(task.id);
        }

        const priorityClass = task.priority === 'high' ? 'priority-high' : '';
        const statusClass = `status-${task.status}`;

        let statusIcon, statusText;
        if (task.status === 'pending') { statusIcon = 'schedule'; statusText = 'Bekliyor'; }
        else if (task.status === 'progress') { statusIcon = 'engineering'; statusText = 'Yapılıyor'; }
        else { statusIcon = 'check_circle'; statusText = 'Tamamlandı'; }

        const timeString = new Date(task.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

        let imageHtml = '';
        if (task.imageUrl) {
            imageHtml = `
            <div class="task-image-container">
                <img src="${task.imageUrl}" alt="Görev Görseli" loading="lazy">
            </div>`;
        }

        if (task.completedImageUrl) {
            imageHtml += `
            <div class="task-image-container" style="border-color: var(--clr-status-completed)">
                <div style="padding:4px 8px; font-size: 0.8rem; background: rgba(16, 185, 129, 0.2); color: #34d399;">Tarafınızdan Biten İşlem:</div>
                <img src="${task.completedImageUrl}" alt="Tamamlanan İşlem Görseli" loading="lazy">
            </div>`;
        }

        let actionsHtml = '';
        if (task.status === 'pending') {
            actionsHtml = `
                <div class="task-actions">
                    <button class="action-btn start" onclick="updateTaskStatus('${task.id}', 'progress')">
                        <span class="material-icons-round">play_arrow</span> Başla
                    </button>
                </div>
            `;
        } else if (task.status === 'progress') {
            // Include a mini form to upload an image when completing
            actionsHtml = `
                <div class="file-upload-group" style="margin-top: 1rem;">
                     <input type="file" id="complete-image-${task.id}" accept="image/*" class="file-input" onchange="previewCompleteImage(this, '${task.id}')">
                     <label for="complete-image-${task.id}" class="file-label" style="font-size:0.8rem; padding: 0.5rem;">
                         <span class="material-icons-round" style="font-size: 1.2rem;">add_a_photo</span>
                         <span id="complete-file-name-${task.id}">Bitmiş Halinin Fotoğrafı (Ops)</span>
                     </label>
                     <img id="complete-preview-${task.id}" class="image-preview" style="display: none; max-height: 100px;" />
                </div>
                <div class="task-actions">
                    <button class="action-btn complete" onclick="completeTaskWithImage('${task.id}')" id="btn-complete-${task.id}">
                        <span class="material-icons-round">done_all</span> Bitir
                    </button>
                </div>
            `;
        }

        let materialHtml = '';
        if (task.materialRequest) {
            materialHtml = `
                <div style="margin-top:0.5rem; padding: 0.75rem; background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b; font-size: 0.85rem; color: #fcd34d; border-radius: 0 4px 4px 0;">
                    <strong>Malzeme Talebiniz:</strong> ${task.materialRequest}
                </div>
            `;
        } else if (task.status !== 'completed') {
            materialHtml = `
                <div style="margin-top: 0.5rem;">
                    <button class="action-btn" style="background: rgba(245, 158, 11, 0.1); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.3); padding: 0.5rem; font-size: 0.8rem; height: auto;" onclick="requestMaterial('${task.id}')">
                        <span class="material-icons-round" style="font-size: 1rem;">build_circle</span> Eksik Malzeme İste
                    </button>
                </div>
            `;
        }

        const html = `
            <div class="task-card ${priorityClass} ${statusClass}">
                <div class="task-header">
                    <div class="task-title">${task.title}</div>
                    <div class="task-time">${timeString}</div>
                </div>
                ${imageHtml}
                <div class="task-meta" style="margin-top: 0.5rem;">
                     <div class="meta-item" title="Atanan Usta">
                        <span class="material-icons-round">person</span>
                        ${task.worker}
                    </div>
                    <div class="meta-item status-text-${task.status}">
                        <span class="material-icons-round">${statusIcon}</span>
                        ${statusText}
                    </div>
                </div>
                ${materialHtml}
                ${actionsHtml}
            </div>
        `;
        workerTasks.insertAdjacentHTML('beforeend', html);
    });
}

async function markTaskAsSeen(taskId) {
    try {
        const taskRef = window.doc(window.db, "tasks", taskId);
        await window.updateDoc(taskRef, {
            seenAt: new Date().toISOString()
        });
    } catch (e) {
        console.error("Seen receipt could not be sent", e);
    }
}

window.deleteTask = async function (taskId) {
    if (confirm("Bu görevi geri dönüşümsüz olarak silmek istediğinize emin misiniz?")) {
        try {
            await window.deleteDoc(window.doc(window.db, "tasks", taskId));
            showToast('Görev başarıyla silindi', 'delete');
        } catch (e) {
            console.error("Error deleting document: ", e);
            showToast('Görev silinirken hata oluştu', 'error');
        }
    }
}

window.requestMaterial = async function (taskId) {
    const item = prompt("Hangi malzeme eksik?");
    if (item && item.trim() !== '') {
        try {
            const taskRef = window.doc(window.db, "tasks", taskId);
            await window.updateDoc(taskRef, {
                materialRequest: item.trim()
            });
            showToast('Malzeme talebi amire iletildi.', 'shopping_cart_checkout');
        } catch (e) {
            console.error("Material req error: ", e);
            showToast('Talep gönderilemedi.', 'error');
        }
    }
}

// Yıllık İzin İşlemleri
if (leaveForm) {
    leaveForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const Btn = document.getElementById('submit-leave-btn');
        const start = document.getElementById('leave-start').value;
        const end = document.getElementById('leave-end').value;

        if (start && end) {
            Btn.disabled = true;
            Btn.innerHTML = '<span class="material-icons-round">hourglass_empty</span> Gönderiliyor...';

            const newLeave = {
                worker: currentUser,
                start: start,
                end: end,
                status: 'pending',
                timestamp: new Date().toISOString()
            };

            try {
                await window.addDoc(window.collection(window.db, "leaves"), newLeave);
                showToast('İzin talebi gönderildi.', 'event_available');
                leaveForm.reset();
            } catch (error) {
                console.error("Leave error: ", error);
                showToast('İzin talebi gönderilemedi.', 'error');
            }

            Btn.disabled = false;
            Btn.innerHTML = '<span class="material-icons-round">send</span> İzin Talebi Gönder';
        }
    });
}

window.updateLeaveStatus = async function (leaveId, status) {
    try {
        await window.updateDoc(window.doc(window.db, "leaves", leaveId), { status });
        showToast('İzin durumu güncellendi', 'update');
    } catch (e) {
        console.error(e);
        showToast('Durum güncellenemedi', 'error');
    }
}

function renderSupervisorLeaves() {
    const list = document.getElementById('supervisor-leaves');
    if (!list) return;
    list.innerHTML = '';

    if (leaves.length === 0) {
        list.innerHTML = '<div class="hint">Bekleyen veya onaylanmış izin talebi yok.</div>';
        return;
    }

    leaves.forEach(lv => {
        let statusBadge = '';
        let actions = '';

        // Format dates
        const startDate = new Date(lv.start).toLocaleDateString('tr-TR');
        const endDate = new Date(lv.end).toLocaleDateString('tr-TR');

        if (lv.status === 'pending') {
            statusBadge = `<span style="color:var(--clr-status-pending)">Bekliyor</span>`;
            actions = `
                <button class="action-btn" style="background: rgba(16, 185, 129, 0.1); color: var(--clr-status-completed); border: 1px solid rgba(16, 185, 129, 0.3);" onclick="updateLeaveStatus('${lv.id}', 'approved')">
                    <span class="material-icons-round">thumb_up</span> Onayla
                </button>
                <button class="action-btn" style="background: rgba(239, 68, 68, 0.1); color: var(--clr-status-urgent); border: 1px solid rgba(239, 68, 68, 0.3);" onclick="updateLeaveStatus('${lv.id}', 'rejected')">
                    <span class="material-icons-round">thumb_down</span> Reddet
                </button>
            `;
        } else if (lv.status === 'approved') {
            statusBadge = `<span style="color:var(--clr-status-completed)">Onaylandı</span>`;
        } else {
            statusBadge = `<span style="color:var(--clr-status-urgent)">Reddedildi</span>`;
        }

        const html = `
            <div class="task-card">
                <div class="task-header">
                    <div class="task-title" style="font-size: 1rem;"><span class="material-icons-round" style="vertical-align: text-bottom; font-size: 1.2rem;">person</span> ${lv.worker} - İzin Talebi</div>
                </div>
                <div class="task-meta" style="margin-top: 0.5rem;">
                    <div class="meta-item"><span class="material-icons-round">calendar_today</span> ${startDate} - ${endDate}</div>
                    <div class="meta-item">${statusBadge}</div>
                </div>
                ${actions ? `<div class="task-actions" style="margin-top:0.8rem">${actions}</div>` : ''}
            </div>
        `;
        list.insertAdjacentHTML('beforeend', html);
    });
}

function previewCompleteImage(inputElem, taskId) {
    const file = inputElem.files[0];
    const fileNameDisplay = document.getElementById(`complete-file-name-${taskId}`);
    const imagePreview = document.getElementById(`complete-preview-${taskId}`);

    if (file) {
        fileNameDisplay.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        fileNameDisplay.textContent = 'Bitmiş Halinin Fotoğrafı (Ops)';
        imagePreview.style.display = 'none';
        imagePreview.src = '';
    }
}

async function completeTaskWithImage(taskId) {
    const fileInput = document.getElementById(`complete-image-${taskId}`);
    const btn = document.getElementById(`btn-complete-${taskId}`);
    let completedImageUrl = null;

    if (fileInput && fileInput.files[0]) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round">sync</span> İşleniyor...';
        showToast('Fotoğraf işleniyor, lütfen bekleyin...', 'cloud_upload');

        try {
            const file = fileInput.files[0];
            completedImageUrl = await compressImage(file);
        } catch (error) {
            console.error("Error compressing completion image:", error);
            showToast('Resim işleme hatası!', 'error');
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons-round">done_all</span> Bitir';
            return; // Stop completion if processing fails
        }
    }

    try {
        const taskRef = window.doc(window.db, "tasks", taskId);
        const updateData = { status: 'completed' };
        if (completedImageUrl) {
            updateData.completedImageUrl = completedImageUrl;
        }

        await window.updateDoc(taskRef, updateData);
        showToast('Görev tamamlandı!', 'done_all');
    } catch (e) {
        console.error("Error updating document: ", e);
        showToast('Durum güncellenemedi!', 'error');
        if (btn) btn.disabled = false;
    }
}

function showToast(message, icon) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <span class="material-icons-round">${icon}</span>
        ${message}
    `;

    toastContainer.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'toastLeave 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==========================================
// CANLI RADYO (ARKA PLAN OYNATMA) MANTIĞI
// ==========================================

const radioAudio = document.getElementById('radio-audio-player');
const statusText = document.getElementById('yt-status-text');
const playIcon = document.getElementById('yt-play-icon');

window.toggleYtPlayer = function () {
    const body = document.getElementById('yt-body');
    const icon = document.getElementById('yt-toggle-icon');

    if (body.classList.contains('active')) {
        body.classList.remove('active');
        icon.textContent = "expand_more";
    } else {
        body.classList.add('active');
        icon.textContent = "expand_less";
    }
};

window.playRadio = function () {
    const selectElem = document.getElementById('radio-station');
    const streamUrl = selectElem.value;
    const radioName = selectElem.options[selectElem.selectedIndex].text;

    // Check if we are resuming the same stream or starting a new one
    if (radioAudio.src !== streamUrl) {
        radioAudio.src = streamUrl;
    }

    // Toggle play/pause
    if (radioAudio.paused) {
        statusText.textContent = "Bağlanıyor...";
        playIcon.textContent = "hourglass_empty";

        radioAudio.play().then(() => {
            statusText.textContent = radioName + " Devrede";
            playIcon.textContent = "pause";
            updateMediaSession(radioName, 'Titan Fabrika Radyosu');
        }).catch(err => {
            console.error('Radyo oynatılamadı:', err);
            showToast("Radyo yayın akışına bağlanılamadı!", "error");
            statusText.textContent = "Bağlantı Hatası";
            playIcon.textContent = "play_arrow";
        });
    } else {
        radioAudio.pause();
        statusText.textContent = "Radyo Duraklatıldı.";
        playIcon.textContent = "play_arrow";
    }
};

window.stopRadio = function () {
    if (!radioAudio.paused) {
        radioAudio.pause();
    }
    radioAudio.src = ""; // Clear buffer
    statusText.textContent = "Radyo Kapatıldı.";
    playIcon.textContent = "play_arrow";
};

window.changeRadioVolume = function (val) {
    radioAudio.volume = val / 100;
};

// Update the native mobile lock screen controls (Keeps it playing!)
function updateMediaSession(title, artist) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title + " (Canlı Yayın)",
            artist: artist,
            album: 'Çalışma Müzikleri',
            artwork: [
                { src: 'https://cdn-icons-png.flaticon.com/512/1055/1055183.png', sizes: '512x512', type: 'image/png' }
            ]
        });

        navigator.mediaSession.setActionHandler('play', function () { window.playRadio(); });
        navigator.mediaSession.setActionHandler('pause', function () { window.stopRadio(); });
        navigator.mediaSession.setActionHandler('stop', function () { window.stopRadio(); });
    }
}
