// State
let currentUser = null;
let currentRole = null;
let tasks = [];
let unsubscribe = null; // To hold the Firestore listener

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

addTaskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('task-title').value.trim();
    const worker = document.getElementById('worker-select').value;
    const priority = document.querySelector('input[name="priority"]:checked').value;

    if (title && worker) {
        addTask(title, worker, priority);
        addTaskForm.reset();
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

async function addTask(title, worker, priority) {
    const newTask = {
        title,
        worker,
        priority,
        status: 'pending',
        timestamp: new Date().toISOString()
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
            actionsHtml = `
                <div class="task-actions">
                    <button class="action-btn complete" onclick="updateTaskStatus('${task.id}', 'completed')">
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
                <div class="task-meta">
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
