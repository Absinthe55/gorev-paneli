// State
let currentUser = null;
let currentRole = null;
let tasks = [];
let unsubscribe = null; // To hold the Firestore listener
let ytPlayer = null;
let ytPlayerReady = false;
let currentYtVideoId = null;

// DOM Elements
const screens = {
    login: document.getElementById('login-screen'),
    supervisor: document.getElementById('supervisor-screen'),
    worker: document.getElementById('worker-screen')
};

const loginForm = document.getElementById('login-form');
const addTaskForm = document.getElementById('add-task-form');
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

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const usernameInput = document.getElementById('username').value;

    if (usernameInput) {
        const selectedRole = usernameInput === 'Erkan Çilingir' ? 'supervisor' : 'worker';
        login(usernameInput, selectedRole);
    }
});

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
                </div>
                ${imageHtml}
            </div>
        `;
        supervisorTasks.insertAdjacentHTML('beforeend', html);
    });
}

function renderWorkerTasks() {
    workerTasks.innerHTML = '';

    // MOCK: In a real app, filter for this specific worker. 
    // Here we show all just so the user can see them during testing,
    // or we filter by the name they entered. Let's filter by name loosely.
    const myTasks = tasks.map(t => t); // For demo, show all tasks but we can filter later

    if (myTasks.length === 0) {
        workerTasks.innerHTML = '<div class="hint">Size atanmış görev bulunmuyor.</div>';
        return;
    }

    myTasks.forEach(task => {
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
                ${actionsHtml}
            </div>
        `;
        workerTasks.insertAdjacentHTML('beforeend', html);
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
// YOUTUBE AUDIO PLAYER & BACKGROUND HACK LOGIC
// ==========================================

// Create a silent audio element to keep the browser awake
const silentAudio = new Audio('silence.mp3');
silentAudio.loop = true;

// This function is automatically called by the YouTube IFrame API script when it loads
window.onYouTubeIframeAPIReady = function () {
    ytPlayer = new YT.Player('yt-player-container', {
        height: '0',
        width: '0',
        videoId: '',
        playerVars: {
            'autoplay': 0,
            'controls': 0,
            'disablekb': 1,
            'fs': 0,
            'playsinline': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
};

function onPlayerReady(event) {
    ytPlayerReady = true;
    event.target.setVolume(50);
}

function onPlayerStateChange(event) {
    const statusText = document.getElementById('yt-status-text');
    const playIcon = document.getElementById('yt-play-icon');

    if (event.data == YT.PlayerState.PLAYING) {
        statusText.textContent = "Çalıyor...";
        playIcon.textContent = "pause";
        // Start silent audio to keep tab alive
        silentAudio.play().catch(e => console.log("Silent audio autoplay blocked, waiting for user interaction."));
        updateMediaSession('Oynatılıyor', 'Titan Görev Paneli');
    } else if (event.data == YT.PlayerState.PAUSED) {
        statusText.textContent = "Duraklatıldı";
        playIcon.textContent = "play_arrow";
        silentAudio.pause();
    } else if (event.data == YT.PlayerState.ENDED) {
        statusText.textContent = "Müzik Bitti";
        playIcon.textContent = "play_arrow";
        silentAudio.pause();
    } else if (event.data == YT.PlayerState.BUFFERING) {
        statusText.textContent = "Yükleniyor...";
    }
}

// Update the native mobile lock screen controls
function updateMediaSession(title, artist) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: artist,
            album: 'Arka Plan Müziği',
            artwork: [
                { src: 'https://cdn-icons-png.flaticon.com/512/1055/1055183.png', sizes: '512x512', type: 'image/png' }
            ]
        });

        navigator.mediaSession.setActionHandler('play', function () { window.playYtAudio(); });
        navigator.mediaSession.setActionHandler('pause', function () { window.stopYtAudio(); });
    }
}

function onPlayerError(event) {
    console.error("YouTube Player Error:", event.data);
    showToast("Video yüklenemedi. Link hatalı veya video gizli olabilir.", "error");
    document.getElementById('yt-status-text').textContent = "Hata oluştu";
}

function parseYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

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

window.playYtAudio = function () {
    if (!ytPlayerReady) {
        showToast("Player henüz yüklenmedi, bekleyin.", "warning");
        return;
    }

    // User interacted, now safe to play the silent audio hack
    silentAudio.play().catch(e => console.log(e));

    const urlInput = document.getElementById('yt-url-input').value.trim();
    if (!urlInput) {
        showToast("Lütfen bir YouTube linki girin!", "warning");
        return;
    }

    const videoId = parseYouTubeId(urlInput);
    if (!videoId) {
        showToast("Geçerli bir YouTube linki bulunamadı.", "error");
        return;
    }

    // If playing a new video
    if (videoId !== currentYtVideoId) {
        currentYtVideoId = videoId;
        ytPlayer.loadVideoById(videoId);
    } else {
        // Toggle play/pause for current video
        const state = ytPlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
            ytPlayer.pauseVideo();
        } else {
            ytPlayer.playVideo();
        }
    }
};

window.stopYtAudio = function () {
    if (ytPlayerReady && ytPlayer) {
        ytPlayer.stopVideo();
        silentAudio.pause();
        document.getElementById('yt-status-text').textContent = "Durduruldu";
        document.getElementById('yt-play-icon').textContent = "play_arrow";
    }
};

window.changeYtVolume = function (val) {
    if (ytPlayerReady && ytPlayer) {
        ytPlayer.setVolume(val);
    }
};
