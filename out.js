(() => {
  // public/app.js
  var currentUser = null;
  var currentRole = null;
  var tasks = [];
  var leaves = [];
  var overtimes = [];
  var materials = [];
  var documentsList = [];
  var systemUsers = [];
  var unsubscribe = null;
  var leavesUnsubscribe = null;
  var overtimesUnsubscribe = null;
  var materialsUnsubscribe = null;
  var docsUnsubscribe = null;
  var usersUnsubscribe = null;
  var selectedLoginUser = null;
  var selectedLoginRole = null;
  var currentTaskFilter = "all";
  var currentWorkerTaskFilter = "all";
  var currentMaterialFilter = "all";
  var presenceInterval = null;
  var screens = {
    login: document.getElementById("login-screen"),
    supervisor: document.getElementById("supervisor-screen"),
    worker: document.getElementById("worker-screen")
  };
  var matImageInput = document.getElementById("material-image");
  if (matImageInput) {
    matImageInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      const nameEl = document.getElementById("mat-file-name-display");
      const prevEl = document.getElementById("mat-image-preview");
      if (file) {
        if (nameEl) nameEl.textContent = file.name;
        const r = new FileReader();
        r.onload = (ev) => {
          if (prevEl) {
            prevEl.src = ev.target.result;
            prevEl.style.display = "block";
          }
        };
        r.readAsDataURL(file);
      } else {
        if (nameEl) nameEl.textContent = "Foto\u011Fraf Ekle (Opsiyonel)";
        if (prevEl) {
          prevEl.src = "";
          prevEl.style.display = "none";
        }
      }
    });
  }
  var loginForm = document.getElementById("login-form");
  var addTaskForm = document.getElementById("add-task-form");
  var leaveForm = document.getElementById("leave-form");
  var overtimeForm = document.getElementById("overtime-form");
  var materialForm = document.getElementById("material-form");
  var supervisorTasks = document.getElementById("supervisor-tasks");
  var workerTasks = document.getElementById("worker-tasks");
  var logoutBtns = document.querySelectorAll(".logout-btn");
  var toastContainer = document.getElementById("toast-container");
  var taskImageInput = document.getElementById("task-image");
  var fileNameDisplay = document.getElementById("file-name-display");
  var imagePreview = document.getElementById("image-preview");
  var submitTaskBtn = document.getElementById("submit-task-btn");
  var docsForm = document.getElementById("docs-form");
  window.appInit = function() {
    init();
  };
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!selectedLoginUser) return;
    });
  }
  var TELEGRAM_BOT_TOKEN = "8510730673:AAFQPairc0cKhxzIEL_0hCmS-fxj84lm72U";
  var SUPERVISOR_CHAT_ID = "8192869692";
  async function sendTelegramNotification(chatId, message) {
    if (!chatId || !TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === "BURAYA_BOT_TOKEN_GIRIN" || String(chatId) === "BURAYA_CHAT_ID_GIRIN") return;
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" })
      });
    } catch (e) {
      console.warn("Telegram bildirimi g\xF6nderilemedi:", e);
    }
  }
  function getWorkerChatId(workerName) {
    const user = systemUsers.find((u) => u.name === workerName);
    return user && user.telegramChatId ? user.telegramChatId : null;
  }
  async function saveTelegramChatId(userId, chatId) {
    try {
      await window.updateDoc(window.doc(window.db, "users", userId), { telegramChatId: chatId.trim() });
      showToast("Telegram Chat ID kaydedildi! \u2705", "telegram");
      const u = systemUsers.find((u2) => u2.id === userId);
      if (u) u.telegramChatId = chatId.trim();
    } catch (e) {
      showToast("Kaydedilemedi!", "error");
    }
  }
  window.saveTelegramChatId = saveTelegramChatId;
  window.saveWorkerTelegramId = async function() {
    const input = document.getElementById("wrk-tg-chat-id");
    const statusEl = document.getElementById("wrk-tg-status");
    if (!input || !input.value.trim()) {
      showToast("L\xFCtfen Chat ID girin.", "error");
      return;
    }
    const me = systemUsers.find((u) => u.name === currentUser);
    if (!me) {
      showToast("Kullan\u0131c\u0131 bulunamad\u0131.", "error");
      return;
    }
    await saveTelegramChatId(me.id, input.value.trim());
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:var(--clr-success)">\u2705 Bildirimler aktif (Chat ID: ${input.value.trim()})</span>`;
    }
  };
  var PRESENCE_HEARTBEAT_MS = 3e4;
  var PRESENCE_STALE_MS = 9e4;
  function formatLastSeen(ts) {
    if (!ts) return "Hi\xE7 giri\u015F yapmad\u0131";
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1e3);
    if (diff < 60) return "Az \xF6nce";
    if (diff < 3600) return `${Math.floor(diff / 60)} dakika \xF6nce`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} saat \xF6nce`;
    return `${Math.floor(diff / 86400)} g\xFCn \xF6nce`;
  }
  function isUserTrulyOnline(user) {
    if (!user.isOnline) return false;
    if (!user.lastSeen) return false;
    const elapsed = Date.now() - new Date(user.lastSeen).getTime();
    return elapsed < PRESENCE_STALE_MS;
  }
  async function setUserPresence(isOnline) {
    const me = systemUsers.find((u) => u.name === currentUser);
    if (!me) return;
    try {
      await window.updateDoc(window.doc(window.db, "users", me.id), {
        isOnline,
        lastSeen: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (e) {
    }
  }
  function startPresenceHeartbeat() {
    stopPresenceHeartbeat();
    setUserPresence(true);
    presenceInterval = setInterval(() => setUserPresence(true), PRESENCE_HEARTBEAT_MS);
  }
  function stopPresenceHeartbeat() {
    if (presenceInterval) {
      clearInterval(presenceInterval);
      presenceInterval = null;
    }
  }
  function listenForUsers() {
    if (usersUnsubscribe) usersUnsubscribe();
    const q = window.collection(window.db, "users");
    usersUnsubscribe = window.onSnapshot(q, (snap) => {
      snap.forEach((d) => {
        const idx = systemUsers.findIndex((u) => u.id === d.id);
        if (idx > -1) {
          systemUsers[idx] = { id: d.id, ...d.data() };
        } else {
          systemUsers.push({ id: d.id, ...d.data() });
        }
      });
      if (currentRole === "supervisor") renderSystemUsers();
    });
  }
  window.addEventListener("beforeunload", () => {
    const me = systemUsers.find((u) => u.name === currentUser);
    if (!me) return;
    stopPresenceHeartbeat();
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${window.db.app.options.projectId}/databases/(default)/documents/users/${me.id}?updateMask.fieldPaths=isOnline&updateMask.fieldPaths=lastSeen`;
      const body = JSON.stringify({ fields: { isOnline: { booleanValue: false }, lastSeen: { stringValue: (/* @__PURE__ */ new Date()).toISOString() } } });
      fetch(url, { method: "PATCH", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {
      });
    } catch (e) {
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!currentUser) return;
    if (document.visibilityState === "hidden") {
      stopPresenceHeartbeat();
      setUserPresence(false);
    } else {
      startPresenceHeartbeat();
    }
  });
  var presenceRefreshInterval = null;
  function startPresenceRefresh() {
    stopPresenceRefresh();
    presenceRefreshInterval = setInterval(() => {
      if (currentRole === "supervisor") renderSystemUsers();
    }, PRESENCE_HEARTBEAT_MS);
  }
  function stopPresenceRefresh() {
    if (presenceRefreshInterval) {
      clearInterval(presenceRefreshInterval);
      presenceRefreshInterval = null;
    }
  }
  window.handleAddTaskSubmit = async function() {
    const title = document.getElementById("task-title").value.trim();
    const worker = document.getElementById("worker-select").value;
    const priority = document.querySelector('input[name="priority"]:checked').value;
    const file = taskImageInput ? taskImageInput.files[0] : null;
    if (!title || !worker) {
      showToast("L\xFCtfen g\xF6rev ba\u015Fl\u0131\u011F\u0131 ve usta se\xE7iniz.", "warning");
      return;
    }
    if (title && worker) {
      submitTaskBtn.disabled = true;
      submitTaskBtn.innerHTML = '<span class="material-icons-round spinning">sync</span> Y\xFCkleniyor...';
      await addTask(title, worker, priority, file);
      const addTaskForm2 = document.getElementById("add-task-form");
      if (addTaskForm2) addTaskForm2.reset();
      if (imagePreview) {
        imagePreview.style.display = "none";
        imagePreview.src = "";
      }
      if (fileNameDisplay) fileNameDisplay.textContent = "Foto\u011Fraf Ekle (Opsiyonel)";
      submitTaskBtn.disabled = false;
      submitTaskBtn.innerHTML = '<span class="material-icons-round">send</span> G\xF6revi Ata';
    }
  };
  window.handleLeaveSubmit = async function() {
    const btn = document.getElementById("submit-leave-btn");
    const start = document.getElementById("leave-start").value;
    const end = document.getElementById("leave-end").value;
    if (!start || !end) {
      showToast("L\xFCtfen ba\u015Flang\u0131\xE7 ve biti\u015F tarihlerini se\xE7iniz.", "warning");
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round spinning">sync</span> G\xF6nderiliyor...';
    try {
      await window.addDoc(window.collection(window.db, "leaves"), {
        worker: currentUser,
        start,
        end,
        status: "pending",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      showToast("\u0130zin talebi g\xF6nderildi.", "event_available");
      const leaveForm2 = document.getElementById("leave-form");
      if (leaveForm2) leaveForm2.reset();
      renderLeaveCalendar();
      const startFmt = new Date(start).toLocaleDateString("tr-TR");
      const endFmt = new Date(end).toLocaleDateString("tr-TR");
      await sendTelegramNotification(
        SUPERVISOR_CHAT_ID,
        `\u{1F4C5} <b>Titan Makina - \u0130zin Talebi</b>

\u{1F477} <b>${currentUser}</b> izin talebinde bulundu.
\u{1F5D3} ${startFmt} \u2192 ${endFmt}

L\xFCtfen uygulamay\u0131 kontrol edin.`
      );
    } catch (e) {
      showToast("\u0130zin talebi g\xF6nderilemedi.", "error");
    }
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons-round">send</span> \u0130zin Talebi G\xF6nder';
  };
  window.handleOvertimeSubmit = async function() {
    const btn = document.getElementById("submit-overtime-btn");
    const date = document.getElementById("overtime-date").value;
    const reason = document.getElementById("overtime-reason").value;
    const decision = document.getElementById("overtime-decision").value;
    if (!date) {
      showToast("L\xFCtfen mesai tarihi se\xE7iniz.", "warning");
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round spinning">sync</span> G\xF6nderiliyor...';
    try {
      await window.addDoc(window.collection(window.db, "overtimes"), {
        worker: currentUser,
        date,
        reason,
        decision,
        status: "pending",
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      showToast("Mesai durumu g\xF6nderildi.", "event_available");
      const overtimeForm2 = document.getElementById("overtime-form");
      if (overtimeForm2) overtimeForm2.reset();
      const dateInput = document.getElementById("overtime-date");
      if (dateInput) {
        dateInput.value = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      }
      const dateFmt = new Date(date).toLocaleDateString("tr-TR");
      const reasonText = reason ? `
\u{1F4DD} ${reason}` : "";
      const decisionText = decision === "will_stay" ? "\u2705 Kalacak" : "\u274C Kalmayacak";
      await sendTelegramNotification(
        SUPERVISOR_CHAT_ID,
        `\u{1F552} <b>Titan Makina - Mesai Bildirimi</b>

\u{1F477} <b>${currentUser}</b> mesai durumu bildirdi.
\u{1F5D3} ${dateFmt}
\u{1F4CC} Durum: <b>${decisionText}</b>${reasonText}

L\xFCtfen uygulamay\u0131 kontrol edin.`
      );
    } catch (e) {
      showToast("Mesai bildirim g\xF6nderilemedi.", "error");
    }
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons-round">send</span> Mesai Talebi G\xF6nder';
  };
  window.handleMaterialSubmit = async function() {
    const btn = document.getElementById("submit-material-btn");
    const name = document.getElementById("material-name").value.trim();
    const desc = document.getElementById("material-desc").value.trim();
    if (!name) {
      showToast("L\xFCtfen malzeme ad\u0131n\u0131 yaz\u0131n\u0131z.", "warning");
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round spinning">sync</span> G\xF6nderiliyor...';
    let imageUrl = null;
    const fileInput = document.getElementById("material-image");
    if (fileInput && fileInput.files[0]) {
      try {
        imageUrl = await compressImage(fileInput.files[0]);
      } catch (e) {
        showToast("Resim i\u015Fleme hatas\u0131!", "error");
      }
    }
    try {
      await window.addDoc(window.collection(window.db, "materials"), {
        worker: currentUser,
        name,
        desc,
        imageUrl,
        status: "pending",
        comments: [],
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      showToast("Malzeme talebi g\xF6nderildi.", "inventory_2");
      const materialForm2 = document.getElementById("material-form");
      if (materialForm2) materialForm2.reset();
      const nameEl = document.getElementById("mat-file-name-display");
      const prevEl = document.getElementById("mat-image-preview");
      if (nameEl) nameEl.textContent = "Foto\u011Fraf Ekle (Opsiyonel)";
      if (prevEl) {
        prevEl.src = "";
        prevEl.style.display = "none";
      }
      await sendTelegramNotification(
        SUPERVISOR_CHAT_ID,
        `\u{1F4E6} <b>Titan Makina - Malzeme Talebi</b>

\u{1F477} <b>${currentUser}</b> malzeme talep etti.
\u{1F4CB} <b>${name}</b>${desc ? "\n\u{1F4DD} " + desc : ""}

L\xFCtfen uygulamay\u0131 kontrol edin.`
      );
    } catch (e) {
      showToast("Talep g\xF6nderilemedi.", "error");
    }
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons-round">send</span> Talep G\xF6nder';
  };
  window.handleDocsSubmit = async function() {
    const btn = document.getElementById("submit-doc-btn");
    const title = document.getElementById("doc-title").value.trim();
    const fileInput = document.getElementById("doc-file");
    const file = fileInput.files[0];
    if (!title || !file) {
      showToast("L\xFCtfen d\xF6k\xFCman ba\u015Fl\u0131\u011F\u0131 ve dosyas\u0131 se\xE7iniz.", "warning");
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round spinning">sync</span> Y\xFCkleniyor...';
    const timeoutPromise = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("\u0130\u015Flem zaman a\u015F\u0131m\u0131na u\u011Frad\u0131 (Ba\u011Flant\u0131 veya Yetki sorunu).")), ms));
    try {
      console.log("Documents upload started for:", file.name);
      const fileName = `documents/${Date.now()}_${file.name}`;
      let downloadUrls = [];
      if (file.type === "application/pdf") {
        btn.innerHTML = '<span class="material-icons-round spinning">sync</span> PDF sayfalar\u0131 resme \xE7evriliyor...';
        try {
          const arrayBuffer = await file.arrayBuffer();
          console.log("ArrayBuffer loaded, passing to pdf.js...");
          const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
          console.log("PDF parsed successfully. Total pages:", pdf.numPages);
          const totalPages = pdf.numPages;
          for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            btn.innerHTML = `<span class="material-icons-round spinning">sync</span> Sayfa i\u015Fleniyor (${pageNum}/${totalPages})...`;
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1 });
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: ctx, viewport }).promise;
            const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
            downloadUrls.push(dataUrl);
            console.log(`Page ${pageNum} rendered and converted to base64. Size: ~${Math.round(dataUrl.length / 1024)}KB`);
          }
        } catch (pdfErr) {
          console.error("PDF \u0130\u015Fleme Hatas\u0131:", pdfErr);
          throw new Error("PDF dosyas\u0131 okunamad\u0131 veya bozuk: " + pdfErr.message);
        }
      } else {
        btn.innerHTML = `<span class="material-icons-round spinning">sync</span> Resim i\u015Fleniyor...`;
        console.log("Compressing standard image...");
        const dataUrl = await compressImage(file, 1e3);
        downloadUrls.push(dataUrl);
        console.log(`Image compressed explicitly. Size: ~${Math.round(dataUrl.length / 1024)}KB`);
      }
      console.log("Adding doc to Firestore...");
      btn.innerHTML = '<span class="material-icons-round spinning">sync</span> Sisteme kaydediliyor...';
      let totalSize = downloadUrls.reduce((acc, curr) => acc + curr.length, 0);
      console.log("Total Firestore Payload Size: ~" + Math.round(totalSize / 1024) + " KB");
      if (totalSize > 9e5) {
        throw new Error("Dosya boyutu veya sayfa say\u0131s\u0131 veritaban\u0131 limitini a\u015F\u0131yor. L\xFCtfen daha az sayfal\u0131 veya daha d\xFC\u015F\xFCk boyutlu/\xE7\xF6z\xFCn\xFCrl\xFCkl\xFC bir dosya se\xE7in.");
      }
      await Promise.race([
        window.addDoc(window.collection(window.db, "documents"), {
          title,
          urls: downloadUrls,
          // Artık bir dizi olarak kaydediyoruz
          uploader: currentUser,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }),
        timeoutPromise(1e4)
      ]);
      showToast("D\xF6k\xFCman ba\u015Far\u0131yla y\xFCklendi.", "cloud_done");
      const docsForm2 = document.getElementById("docs-form");
      if (docsForm2) docsForm2.reset();
      const docNameEl = document.getElementById("doc-file-name-display");
      if (docNameEl) docNameEl.textContent = "Dosya Se\xE7 (Sadece PDF, PNG, JPG)";
    } catch (err) {
      console.error("D\xF6k\xFCman y\xFCkleme hatas\u0131 detaylar\u0131:", err);
      let errMsg = "D\xF6k\xFCman y\xFCklenemedi!";
      if (err.message && err.message.includes("zaman a\u015F\u0131m\u0131na")) {
        errMsg = "Firebase ba\u011Flant\u0131s\u0131 koptu veya Storage kapal\u0131.";
        alert("Hata: Firebase Storage hen\xFCz projenizde aktif edilmemi\u015F olabilir veya ba\u011Flant\u0131n\u0131z yava\u015F. L\xFCtfen Firebase Console \xFCzerinden Build > Storage b\xF6l\xFCm\xFCne girip servisi ba\u015Flatt\u0131\u011F\u0131n\u0131zdan emin olun.");
      } else if (err.code && err.code.includes("unauthorized")) {
        alert("Hata: Firebase Storage g\xFCvenlik kurallar\u0131 izinsiz (unauthorized) y\xFCklemeye izin vermiyor. Firebase Console > Storage > Rules b\xF6l\xFCm\xFCnde allow write izni vermelisiniz.");
      }
      showToast(errMsg, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons-round">cloud_upload</span> D\xF6k\xFCman\u0131 Y\xFCkle';
    }
  };
  logoutBtns.forEach((btn) => {
    btn.addEventListener("click", logout);
  });
  if (taskImageInput) {
    taskImageInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        if (fileNameDisplay) fileNameDisplay.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (ev) => {
          imagePreview.src = ev.target.result;
          imagePreview.style.display = "block";
        };
        reader.readAsDataURL(file);
      }
    });
  }
  var docFileInput = document.getElementById("doc-file");
  if (docFileInput) {
    docFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      const nameDisplay = document.getElementById("doc-file-name-display");
      if (file && nameDisplay) {
        nameDisplay.textContent = file.name;
      } else if (nameDisplay) {
        nameDisplay.textContent = "Dosya Se\xE7 (PDF, Word, Excel, Resim)";
      }
    });
  }
  async function init() {
    const debug = document.getElementById("debug-info");
    if (!navigator.onLine && debug) {
      debug.innerHTML = "\u0130nternet ba\u011Flant\u0131s\u0131 yok! L\xFCtfen kontrol edin.";
    }
    await fetchUsers();
    const remembered = systemUsers.find((u) => {
      const savedPass = localStorage.getItem(`remember_${u.name}`);
      return savedPass && savedPass === u.password;
    });
    if (remembered) {
      login(remembered.name, remembered.role, false);
    }
  }
  async function fetchUsers() {
    try {
      const querySnapshot = await window.getDocs(window.collection(window.db, "users"));
      systemUsers = [];
      const seenNames = /* @__PURE__ */ new Set();
      const listContainer = document.getElementById("login-user-list");
      if (listContainer) listContainer.innerHTML = "";
      const workerSelect = document.getElementById("worker-select");
      if (workerSelect) workerSelect.innerHTML = '<option value="" disabled selected>Usta Se\xE7in</option>';
      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        if (seenNames.has(userData.name)) {
          window.deleteDoc(window.doc(window.db, "users", doc.id)).catch(() => {
          });
          return;
        }
        seenNames.add(userData.name);
        systemUsers.push({ id: doc.id, ...userData });
        if (listContainer) {
          const roleIcon = userData.role === "supervisor" ? "admin_panel_settings" : "engineering";
          const roleText = userData.role === "supervisor" ? "Amir" : "Usta";
          const rememberedPass = localStorage.getItem(`remember_${userData.name}`) || "";
          const isRemembered = rememberedPass ? "checked" : "";
          listContainer.insertAdjacentHTML("beforeend", `
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
                                <input type="password" class="inline-password-input" placeholder="\u015Eifreniz" value="${rememberedPass}">
                                <button type="button" class="btn primary-btn inline-login-btn" onclick="handleInlineLogin('${userData.name}', '${userData.role}', this)">
                                    Giri\u015F <span class="material-icons-round" style="font-size:1.1rem;margin-left:2px">arrow_forward</span>
                                </button>
                            </div>
                            <label class="remember-me-label">
                                <input type="checkbox" class="remember-me-checkbox" ${isRemembered}> Beni Hat\u0131rla
                            </label>
                        </div>
                    </div>
                `);
        }
        if (workerSelect && userData.role === "worker") {
          const opt = document.createElement("option");
          opt.value = userData.name;
          opt.textContent = userData.name;
          workerSelect.appendChild(opt);
        }
      });
      if (systemUsers.length === 0) {
        await window.addDoc(window.collection(window.db, "users"), { name: "Erkan \xC7ilingir", role: "supervisor", password: "123" });
        await window.addDoc(window.collection(window.db, "users"), { name: "Berat \xD6zker", role: "worker", password: "123" });
        return fetchUsers();
      }
      if (listContainer) {
        attachUserListListeners();
      }
    } catch (e) {
      console.error("fetchUsers error:", e);
      const listContainer = document.getElementById("login-user-list");
      if (listContainer) listContainer.innerHTML = '<div style="color:red;text-align:center">Veri al\u0131namad\u0131!</div>';
      const debug = document.getElementById("debug-info");
      if (debug) debug.innerHTML = `Ba\u011Flant\u0131 Hatas\u0131: ${e.message}<br>Firebase kurallar\u0131 veya \xF6nbellek (cache) sorunu olabilir. L\xFCtfen ekran\u0131 yenileyin.`;
    }
  }
  function attachUserListListeners() {
    const userCards = document.querySelectorAll(".login-card-user");
    userCards.forEach((card) => {
      card.addEventListener("click", () => {
        document.querySelectorAll(".login-card-group").forEach((c) => c.classList.remove("selected"));
        document.querySelectorAll(".inline-password-form").forEach((f) => {
          f.style.display = "none";
        });
        const group = card.closest(".login-card-group");
        group.classList.add("selected");
        const pForm = group.querySelector(".inline-password-form");
        pForm.style.display = "flex";
        setTimeout(() => {
          pForm.querySelector(".inline-password-input").focus();
        }, 50);
        selectedLoginUser = card.getAttribute("data-name");
        selectedLoginRole = card.getAttribute("data-role");
      });
    });
  }
  function login(username, role, showWelcome = true) {
    currentUser = username;
    currentRole = role;
    localStorage.setItem("titan_user", username);
    localStorage.setItem("titan_role", role);
    document.querySelectorAll(".current-user-name").forEach((el) => el.textContent = username);
    switchScreen(role === "supervisor" ? "supervisor" : "worker");
    if (showWelcome) showToast(`Ho\u015F geldin, ${username}!`, "waving_hand");
    listenForTasks();
    listenForLeaves();
    listenForOvertimes();
    listenForMaterials();
    listenForDocuments();
    listenForUsers();
    startPresenceRefresh();
    setTimeout(() => startPresenceHeartbeat(), 1500);
  }
  function logout() {
    stopPresenceHeartbeat();
    stopPresenceRefresh();
    setUserPresence(false);
    currentUser = null;
    currentRole = null;
    localStorage.removeItem("titan_user");
    localStorage.removeItem("titan_role");
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (leavesUnsubscribe) {
      leavesUnsubscribe();
      leavesUnsubscribe = null;
    }
    if (overtimesUnsubscribe) {
      overtimesUnsubscribe();
      overtimesUnsubscribe = null;
    }
    if (materialsUnsubscribe) {
      materialsUnsubscribe();
      materialsUnsubscribe = null;
    }
    if (docsUnsubscribe) {
      docsUnsubscribe();
      docsUnsubscribe = null;
    }
    if (usersUnsubscribe) {
      usersUnsubscribe();
      usersUnsubscribe = null;
    }
    switchScreen("login");
    showToast("\xC7\u0131k\u0131\u015F yap\u0131ld\u0131", "logout");
    fetchUsers();
  }
  function switchScreen(screenName) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[screenName].classList.add("active");
    if (screenName === "supervisor") {
      window.switchTab("supervisor", "tasks", document.querySelector("#supervisor-screen .nav-item"));
    } else if (screenName === "worker") {
      window.switchTab("worker", "tasks", document.querySelector("#worker-screen .nav-item"));
    }
  }
  window.switchTab = function(role, tabName, navItem) {
    const prefix = role === "supervisor" ? "sup" : "wrk";
    document.querySelectorAll(`#${role}-screen .tab-content`).forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(`#${role}-screen .nav-item`).forEach((n) => n.classList.remove("active"));
    const tab = document.getElementById(`${prefix}-tab-${tabName}`);
    if (tab) tab.classList.add("active");
    if (navItem) navItem.classList.add("active");
    if (tabName === "tasks" && role === "supervisor") {
      currentMaterialFilter = "all";
      updateStats();
      const pe = document.getElementById("sup-pending-count");
      const pr = document.getElementById("sup-progress-count");
      const co = document.getElementById("sup-completed-count");
      if (pr) {
        pr.parentElement.className = "stat-chip progress";
        pr.parentElement.onclick = null;
        pr.parentElement.style.cursor = "";
        pr.parentElement.style.opacity = "1";
      }
      if (co) {
        co.parentElement.className = "stat-chip completed";
        co.parentElement.onclick = null;
        co.parentElement.style.cursor = "";
        co.parentElement.style.opacity = "1";
      }
      if (pe) {
        pe.parentElement.onclick = null;
        pe.parentElement.style.cursor = "";
        pe.parentElement.style.opacity = "1";
      }
    }
    if (tabName === "calendar") {
      renderLeaveCalendar();
      if (role === "supervisor") renderSupervisorLeaves();
      if (role === "worker") renderWorkerLeaves();
    }
    if (tabName === "overtime") {
      if (role === "supervisor") renderSupervisorOvertimes();
      if (role === "worker") {
        renderWorkerOvertimes();
        const dateInput = document.getElementById("overtime-date");
        if (dateInput && !dateInput.value) {
          dateInput.value = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        }
      }
    }
    if (tabName === "materials") {
      if (role === "supervisor") {
        renderSupervisorMaterials();
        updateMaterialStats();
      }
      if (role === "worker") renderWorkerMaterials();
    }
    if (tabName === "profile") renderSystemUsers();
    if (tabName === "telegram" && role === "worker") {
      const me = systemUsers.find((u) => u.name === currentUser);
      const input = document.getElementById("wrk-tg-chat-id");
      const statusEl = document.getElementById("wrk-tg-status");
      if (input && me) {
        input.value = me.telegramChatId || "";
        if (statusEl) {
          statusEl.innerHTML = me.telegramChatId ? `<span style="color:var(--clr-success)">\u2705 Bildirimler aktif (Chat ID: ${me.telegramChatId})</span>` : `<span style="color:var(--clr-text-muted)">\u26A0\uFE0F Hen\xFCz Chat ID girilmedi. Bildirimler devre d\u0131\u015F\u0131.</span>`;
        }
      }
    }
  };
  function compressImage(file, maxWidth = 800) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let w = img.width, h = img.height;
          if (w > maxWidth) {
            h = Math.round(h * maxWidth / w);
            w = maxWidth;
          }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  }
  async function addTask(title, worker, priority, file = null) {
    let imageUrl = null;
    if (file) {
      try {
        imageUrl = await compressImage(file);
      } catch (e) {
        showToast("Resim i\u015Flenemedi.", "error");
      }
    }
    try {
      await window.addDoc(window.collection(window.db, "tasks"), {
        title,
        worker,
        priority,
        status: "pending",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        imageUrl,
        completedImageUrl: null
      });
      showToast("G\xF6rev ba\u015Far\u0131yla atand\u0131!", "task_alt");
      const workerChatId = getWorkerChatId(worker);
      const priorityLabel = { low: "\u{1F7E2} D\xFC\u015F\xFCk", medium: "\u{1F7E1} Normal", high: "\u{1F534} Acil" }[priority] || priority;
      await sendTelegramNotification(
        workerChatId,
        `\u{1F527} <b>Titan Makina - Yeni G\xF6rev</b>

\u{1F4CB} <b>${title}</b>
\xD6ncelik: ${priorityLabel}

L\xFCtfen uygulamay\u0131 kontrol edin.`
      );
    } catch (e) {
      showToast("G\xF6rev eklenirken hata olu\u015Ftu!", "error");
    }
  }
  function listenForTasks() {
    if (unsubscribe) unsubscribe();
    const q = window.query(window.collection(window.db, "tasks"), window.orderBy("timestamp", "desc"));
    unsubscribe = window.onSnapshot(q, (snap) => {
      tasks = [];
      snap.forEach((d) => tasks.push({ id: d.id, ...d.data() }));
      renderTasks();
    });
  }
  function renderTasks() {
    if (currentRole === "supervisor") {
      renderSupervisorTasks();
      updateStats();
    } else if (currentRole === "worker") {
      renderWorkerTasks();
    }
  }
  function sortByStatus(items) {
    const order = { pending: 0, progress: 1, approved: 2, resolved: 2, rejected: 2, completed: 3, cancelled: 3 };
    return [...items].sort((a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1));
  }
  function updateStats() {
    const c = { pending: 0, progress: 0, completed: 0 };
    tasks.forEach((t) => {
      if (c[t.status] !== void 0) c[t.status]++;
    });
    const pe = document.getElementById("sup-pending-count");
    const pr = document.getElementById("sup-progress-count");
    const co = document.getElementById("sup-completed-count");
    if (pe) pe.textContent = c.pending + " Bekliyor";
    if (pr) pr.textContent = c.progress + " Devam";
    if (co) co.textContent = c.completed + " Bitti";
  }
  function updateMaterialStats() {
    const c = { pending: 0, approved: 0, rejected: 0 };
    materials.forEach((m) => {
      if (m.status === "pending") c.pending++;
      else if (m.status === "approved" || m.status === "resolved") c.approved++;
      else if (m.status === "rejected") c.rejected++;
    });
    const pe = document.getElementById("sup-pending-count");
    const pr = document.getElementById("sup-progress-count");
    const co = document.getElementById("sup-completed-count");
    if (pe) {
      pe.textContent = c.pending + " Bekliyor";
      pe.parentElement.onclick = () => window.filterMaterials("pending");
      pe.parentElement.style.cursor = "pointer";
    }
    if (pr) {
      pr.textContent = c.approved + " Onayl\u0131";
      pr.parentElement.className = "stat-chip completed";
      pr.parentElement.onclick = () => window.filterMaterials("approved");
      pr.parentElement.style.cursor = "pointer";
    }
    if (co) {
      co.textContent = c.rejected + " Reddedildi";
      co.parentElement.className = "stat-chip progress";
      co.parentElement.onclick = () => window.filterMaterials("rejected");
      co.parentElement.style.cursor = "pointer";
    }
  }
  window.filterMaterials = function(filter) {
    currentMaterialFilter = currentMaterialFilter === filter ? "all" : filter;
    renderSupervisorMaterials();
    const pe = document.getElementById("sup-pending-count");
    const pr = document.getElementById("sup-progress-count");
    const co = document.getElementById("sup-completed-count");
    [pe, pr, co].forEach((el) => {
      if (el) el.parentElement.style.opacity = "1";
    });
    if (currentMaterialFilter !== "all") {
      [pe, pr, co].forEach((el) => {
        if (el) el.parentElement.style.opacity = "0.4";
      });
      if (currentMaterialFilter === "pending" && pe) pe.parentElement.style.opacity = "1";
      if (currentMaterialFilter === "approved" && pr) pr.parentElement.style.opacity = "1";
      if (currentMaterialFilter === "rejected" && co) co.parentElement.style.opacity = "1";
    }
  };
  window.filterTasks = function(filter, btn) {
    currentTaskFilter = filter;
    document.querySelectorAll("#sup-tab-tasks .filter-tab").forEach((b) => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    renderSupervisorTasks();
  };
  window.filterWorkerTasks = function(filter, btn) {
    currentWorkerTaskFilter = filter;
    document.querySelectorAll("#wrk-tab-tasks .filter-tab").forEach((b) => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    renderWorkerTasks();
  };
  function renderSupervisorTasks() {
    if (!supervisorTasks) return;
    const base = currentTaskFilter === "all" ? tasks : tasks.filter((t) => t.status === currentTaskFilter);
    const filtered = currentTaskFilter === "all" ? sortByStatus(base) : base;
    if (filtered.length === 0) {
      supervisorTasks.innerHTML = `<div class="empty-state"><span class="material-icons-round" style="font-size:3rem;opacity:.3">assignment</span><p>Bu filtrede g\xF6rev yok.</p></div>`;
      return;
    }
    supervisorTasks.innerHTML = "";
    filtered.forEach((task) => {
      const statusMap = {
        pending: { icon: "schedule", text: "Bekliyor", cls: "pending" },
        progress: { icon: "engineering", text: "Devam Ediyor", cls: "progress" },
        completed: { icon: "check_circle", text: "Tamamland\u0131", cls: "completed" }
      };
      const s = statusMap[task.status] || statusMap.pending;
      const time = new Date(task.timestamp).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
      const seenHtml = task.seenAt ? `<span class="chip chip-blue"><span class="material-icons-round">done_all</span> ${new Date(task.seenAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>` : `<span class="chip chip-muted"><span class="material-icons-round">check</span> \u0130letildi</span>`;
      const imageHtml = task.imageUrl ? `<div class="task-img-wrap"><img src="${task.imageUrl}" loading="lazy" onclick="openImageModal('${task.imageUrl}', event)"></div>` : "";
      const compImgHtml = task.completedImageUrl ? `<div class="task-img-wrap completed-img"><div class="img-label"><span class="material-icons-round">done_all</span> Tamamland\u0131</div><img src="${task.completedImageUrl}" loading="lazy" onclick="openImageModal('${task.completedImageUrl}', event)"></div>` : "";
      const matHtml = task.materialRequest ? `<div class="material-alert" onclick="event.stopPropagation()"><span class="material-icons-round">warning_amber</span> <strong>Eksik Malzeme:</strong> ${task.materialRequest}</div>` : "";
      const originalTitleHtml = task.originalTitle ? `<div style="font-size:.75rem;color:var(--clr-text-muted);margin-top:.2rem;opacity:.7">(\xF6nceki: ${task.originalTitle})</div>` : "";
      const editedHtml = task.editedBy ? `<span class="chip chip-muted" style="font-size:.7rem"><span class="material-icons-round" style="font-size:.75rem">edit</span> ${task.editedBy}</span>` : "";
      supervisorTasks.insertAdjacentHTML("beforeend", `
            <div class="task-card priority-${task.priority}" onclick="toggleTaskCard(this, event)">
                <div class="task-header">
                    <div class="task-title">
                        ${task.title}
                        <span class="material-icons-round" style="font-size:.9rem;vertical-align:middle;color:var(--clr-primary);cursor:pointer;margin-left:.3rem" onclick="event.stopPropagation();window.startEditTask('${task.id}')" title="D\xFCzenle">edit</span>
                        ${originalTitleHtml}
                    </div>
                    <div class="task-time">${time}</div>
                </div>
                <div class="task-chips">
                    <span class="chip chip-${s.cls}"><span class="material-icons-round">${s.icon}</span> ${s.text}</span>
                    <span class="chip chip-muted"><span class="material-icons-round">person</span> ${task.worker}</span>
                    ${seenHtml}
                    ${editedHtml}
                </div>
                ${imageHtml}${compImgHtml}${matHtml}
                ${buildTaskCommentsHtml(task)}
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
    const myTasks = tasks.filter((t) => t.worker === currentUser);
    const base = currentWorkerTaskFilter === "all" ? myTasks : myTasks.filter((t) => t.status === currentWorkerTaskFilter);
    const filtered = currentWorkerTaskFilter === "all" ? sortByStatus(base) : base;
    if (filtered.length === 0) {
      workerTasks.innerHTML = `<div class="empty-state"><span class="material-icons-round" style="font-size:3rem;opacity:.3">assignment</span><p>Bu filtrede g\xF6rev yok.</p></div>`;
      return;
    }
    workerTasks.innerHTML = "";
    filtered.forEach((task) => {
      const statusMap = {
        pending: { icon: "schedule", text: "Bekliyor", cls: "pending" },
        progress: { icon: "engineering", text: "Devam Ediyor", cls: "progress" },
        completed: { icon: "check_circle", text: "Tamamland\u0131", cls: "completed" }
      };
      const s = statusMap[task.status] || statusMap.pending;
      const time = new Date(task.timestamp).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
      const imageHtml = task.imageUrl ? `<div class="task-img-wrap"><img src="${task.imageUrl}" loading="lazy" onclick="openImageModal('${task.imageUrl}', event)"></div>` : "";
      const compImgHtml = task.completedImageUrl ? `<div class="task-img-wrap completed-img"><div class="img-label"><span class="material-icons-round">done_all</span> Tamamlad\u0131\u011F\u0131n\u0131z \u0130\u015Flem</div><img src="${task.completedImageUrl}" loading="lazy" onclick="openImageModal('${task.completedImageUrl}', event)"></div>` : "";
      let actionsHtml = "";
      if (task.status === "pending") {
        actionsHtml = `<div class="task-actions" onclick="event.stopPropagation()"><button class="action-btn success" onclick="updateTaskStatus('${task.id}','progress')"><span class="material-icons-round">play_arrow</span> Ba\u015Fla</button></div>`;
      } else if (task.status === "progress") {
        actionsHtml = `
                <div class="file-upload-group" style="margin-top:.8rem">
                    <input type="file" id="ci-${task.id}" accept="image/*" class="file-input" onchange="previewCompleteImage(this,'${task.id}')">
                    <label for="ci-${task.id}" class="file-label" style="font-size:.85rem;padding:.5rem">
                        <span class="material-icons-round">add_a_photo</span>
                        <span id="cf-${task.id}">Tamamlanan Foto\u011Fraf\u0131 (Ops.)</span>
                    </label>
                    <img id="cp-${task.id}" class="image-preview" style="display:none;max-height:100px">
                </div>
                <div class="task-actions" onclick="event.stopPropagation()">
                    <button class="action-btn success" id="btn-c-${task.id}" onclick="completeTaskWithImage('${task.id}')">
                        <span class="material-icons-round">done_all</span> Tamamla
                    </button>
                </div>`;
      }
      const origTitleHtml = task.originalTitle ? `<div style="font-size:.75rem;color:var(--clr-text-muted);margin-top:.2rem;opacity:.7">(\xF6nceki: ${task.originalTitle})</div>` : "";
      workerTasks.insertAdjacentHTML("beforeend", `
            <div class="task-card priority-${task.priority}" onclick="window.toggleTaskCard(this, event, '${task.id}', '${task.status}', '${task.seenAt || ""}')">
                <div class="task-header">
                    <div class="task-title">
                        ${task.title}
                        ${origTitleHtml}
                    </div>
                    <div class="task-time">${time}</div>
                </div>
                <div class="task-chips">
                    <span class="chip chip-${s.cls}"><span class="material-icons-round">${s.icon}</span> ${s.text}</span>
                </div>
                ${imageHtml}${compImgHtml}
                ${buildTaskCommentsHtml(task)}
                ${actionsHtml}
            </div>
        `);
    });
  }
  window.deleteTask = async function(taskId) {
    try {
      await window.deleteDoc(window.doc(window.db, "tasks", taskId));
      showToast("G\xF6rev silindi.", "delete");
    } catch (e) {
      showToast("Silinemedi!", "error");
    }
  };
  window.startEditTask = function(taskId) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newTitle = prompt("G\xF6rev ba\u015Fl\u0131\u011F\u0131n\u0131 d\xFCzenle:", task.title);
    if (newTitle === null || !newTitle.trim() || newTitle.trim() === task.title) return;
    window.saveEditTask(taskId, task.title, newTitle.trim());
  };
  window.saveEditTask = async function(taskId, oldTitle, newTitle) {
    const task = tasks.find((t) => t.id === taskId);
    const update = { title: newTitle, editedBy: currentUser, editedAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (!task.originalTitle) update.originalTitle = oldTitle;
    try {
      await window.updateDoc(window.doc(window.db, "tasks", taskId), update);
      showToast("G\xF6rev g\xFCncellendi.", "edit");
    } catch (e) {
      showToast("G\xFCncellenemedi.", "error");
    }
  };
  window.startEditMaterial = function(materialId) {
    const mat = materials.find((m) => m.id === materialId);
    if (!mat) return;
    const newName = prompt("Malzeme ad\u0131n\u0131 d\xFCzenle:", mat.name);
    if (newName === null || !newName.trim() || newName.trim() === mat.name) return;
    window.saveEditMaterial(materialId, mat, newName.trim());
  };
  window.saveEditMaterial = async function(materialId, mat, newName) {
    const update = { name: newName, editedBy: currentUser, editedAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (!mat.originalName) update.originalName = mat.name;
    try {
      await window.updateDoc(window.doc(window.db, "materials", materialId), update);
      showToast("Malzeme g\xFCncellendi.", "edit");
    } catch (e) {
      showToast("G\xFCncellenemedi.", "error");
    }
  };
  window.startEditComment = function(materialId, commentIndex) {
    const mat = materials.find((m) => m.id === materialId);
    if (!mat || !mat.comments || !mat.comments[commentIndex]) return;
    const comment = mat.comments[commentIndex];
    if (comment.author !== currentUser) {
      showToast("Sadece kendi yorumunuzu d\xFCzenleyebilirsiniz.", "error");
      return;
    }
    const newText = prompt("Yorumu d\xFCzenle:", comment.text);
    if (newText === null || !newText.trim() || newText.trim() === comment.text) return;
    window.saveEditComment(materialId, commentIndex, comment, newText.trim());
  };
  window.saveEditComment = async function(materialId, commentIndex, comment, newText) {
    const mat = materials.find((m) => m.id === materialId);
    if (!mat) return;
    const comments = [...mat.comments || []];
    const updated = { ...comments[commentIndex], text: newText, editedAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (!updated.originalText) updated.originalText = comment.text;
    comments[commentIndex] = updated;
    try {
      await window.updateDoc(window.doc(window.db, "materials", materialId), { comments });
      showToast("Yorum g\xFCncellendi.", "edit");
    } catch (e) {
      showToast("G\xFCncellenemedi.", "error");
    }
  };
  window.addTaskComment = async function(taskId) {
    const input = document.getElementById(`tc-${taskId}`);
    if (!input || !input.value.trim()) return;
    const commentText = input.value.trim();
    try {
      const task = tasks.find((t) => t.id === taskId);
      const comments = task ? task.comments || [] : [];
      comments.push({ author: currentUser, role: currentRole, text: commentText, ts: (/* @__PURE__ */ new Date()).toISOString() });
      await window.updateDoc(window.doc(window.db, "tasks", taskId), { comments });
      input.value = "";
      showToast("Yorum eklendi.", "chat");
      if (task) {
        const taskName = task.title || "G\xF6rev";
        if (currentRole === "worker") {
          await sendTelegramNotification(
            SUPERVISOR_CHAT_ID,
            `\u{1F4AC} <b>Titan Makina - G\xF6rev Yorumu</b>

\u{1F477} <b>${currentUser}</b>, "<b>${taskName}</b>" g\xF6revine yorum yazd\u0131:

"${commentText}"`
          );
        } else if (currentRole === "supervisor") {
          const workerChatId = getWorkerChatId(task.worker);
          await sendTelegramNotification(
            workerChatId,
            `\u{1F4AC} <b>Titan Makina - G\xF6rev Yorumu</b>

\u{1F514} "<b>${taskName}</b>" g\xF6revinize amir yorum yazd\u0131:

"${commentText}"`
          );
        }
      }
    } catch (e) {
      showToast("Yorum eklenemedi.", "error");
    }
  };
  window.editTaskComment = function(taskId, commentIndex) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !task.comments || !task.comments[commentIndex]) return;
    const comment = task.comments[commentIndex];
    if (comment.author !== currentUser) {
      showToast("Sadece kendi yorumunuzu d\xFCzenleyebilirsiniz.", "error");
      return;
    }
    const newText = prompt("Yorumu d\xFCzenle:", comment.text);
    if (newText === null || !newText.trim() || newText.trim() === comment.text) return;
    window.saveEditTaskComment(taskId, commentIndex, comment, newText.trim());
  };
  window.saveEditTaskComment = async function(taskId, commentIndex, comment, newText) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const comments = [...task.comments || []];
    const updated = { ...comments[commentIndex], text: newText, editedAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (!updated.originalText) updated.originalText = comment.text;
    comments[commentIndex] = updated;
    try {
      await window.updateDoc(window.doc(window.db, "tasks", taskId), { comments });
      showToast("Yorum g\xFCncellendi.", "edit");
    } catch (e) {
      showToast("G\xFCncellenemedi.", "error");
    }
  };
  function buildTaskCommentsHtml(task) {
    const commentsHtml = (task.comments || []).map((c, idx) => {
      const commentTime = c.ts ? `<span style="font-size:0.7rem;color:var(--clr-text-muted);margin-left:5px">(${new Date(c.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })})</span>` : "";
      const origHtml = c.originalText ? `<span style="font-size:.75rem;color:var(--clr-text-muted);opacity:.65;margin-left:.3rem">(\xF6nceki: ${c.originalText})</span>` : "";
      const editIcon = c.author === currentUser ? `<span class="material-icons-round" style="font-size:.8rem;vertical-align:middle;color:var(--clr-primary);cursor:pointer;margin-left:.4rem" onclick="event.stopPropagation();window.editTaskComment('${task.id}',${idx})" title="D\xFCzenle">edit</span>` : "";
      return `<div class="comment ${c.role}"><strong>${c.author}:</strong> ${c.text} ${origHtml}${editIcon}${commentTime}</div>`;
    }).join("");
    return `
        <div class="comments-section">${commentsHtml}</div>
        <div class="comment-form" onclick="event.stopPropagation()">
            <input type="text" class="comment-input" id="tc-${task.id}" placeholder="Yorum ekle...">
            <button class="action-btn" onclick="window.addTaskComment('${task.id}')"><span class="material-icons-round">send</span></button>
        </div>`;
  }
  window.previewCompleteImage = function(input, taskId) {
    const file = input.files[0];
    const nameEl = document.getElementById(`cf-${taskId}`);
    const prevEl = document.getElementById(`cp-${taskId}`);
    if (file) {
      if (nameEl) nameEl.textContent = file.name;
      const r = new FileReader();
      r.onload = (e) => {
        if (prevEl) {
          prevEl.src = e.target.result;
          prevEl.style.display = "block";
        }
      };
      r.readAsDataURL(file);
    }
  };
  window.completeTaskWithImage = async function(taskId) {
    const fileInput = document.getElementById(`ci-${taskId}`);
    const btn = document.getElementById(`btn-c-${taskId}`);
    let completedImageUrl = null;
    if (fileInput && fileInput.files[0]) {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round spinning">sync</span> \u0130\u015Fleniyor...';
      }
      try {
        completedImageUrl = await compressImage(fileInput.files[0]);
      } catch (e) {
        showToast("Resim i\u015Fleme hatas\u0131!", "error");
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-icons-round">done_all</span> Tamamla';
        }
        return;
      }
    }
    try {
      const data = { status: "completed" };
      if (completedImageUrl) data.completedImageUrl = completedImageUrl;
      await window.updateDoc(window.doc(window.db, "tasks", taskId), data);
      showToast("G\xF6rev tamamland\u0131!", "done_all");
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        await sendTelegramNotification(
          SUPERVISOR_CHAT_ID,
          `\u2705 <b>Titan Makina - G\xF6rev Tamamland\u0131</b>

\u{1F4CB} <b>${task.title}</b>
\u{1F477} ${task.worker} g\xF6revi tamamlad\u0131.`
        );
      }
    } catch (e) {
      showToast("Durum g\xFCncellenemedi!", "error");
      if (btn) {
        btn.disabled = false;
      }
    }
  };
  window.toggleTaskCard = function(card, event, taskId, status, seenAt) {
    if (event.target.tagName.toLowerCase() === "button" || event.target.closest("button")) {
      return;
    }
    card.classList.toggle("expanded");
    if (card.classList.contains("expanded") && taskId && status === "pending" && !seenAt) {
      window.markTaskAsSeen(taskId);
    }
  };
  window.openImageModal = function(url, event) {
    if (event) event.stopPropagation();
    const modal = document.getElementById("image-modal");
    const img = document.getElementById("image-modal-img");
    if (modal && img) {
      img.src = url;
      modal.classList.add("open");
    }
  };
  window.closeImageModal = function() {
    const modal = document.getElementById("image-modal");
    const img = document.getElementById("image-modal-img");
    if (modal) {
      modal.classList.remove("open");
      if (img) setTimeout(() => {
        img.src = "";
      }, 300);
    }
  };
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") window.closeImageModal();
  });
  function listenForLeaves() {
    if (leavesUnsubscribe) leavesUnsubscribe();
    const q = window.query(window.collection(window.db, "leaves"), window.orderBy("timestamp", "desc"));
    leavesUnsubscribe = window.onSnapshot(q, (snap) => {
      leaves = [];
      snap.forEach((d) => leaves.push({ id: d.id, ...d.data() }));
      if (currentRole === "supervisor") renderSupervisorLeaves();
      if (currentRole === "worker") renderWorkerLeaves();
      renderLeaveCalendar();
    });
  }
  function renderSupervisorLeaves() {
    const list = document.getElementById("supervisor-leaves");
    if (!list) return;
    if (leaves.length === 0) {
      list.innerHTML = '<div class="empty-state">Hen\xFCz izin talebi yok.</div>';
      return;
    }
    list.innerHTML = "";
    leaves.forEach((lv) => {
      const sd = new Date(lv.start).toLocaleDateString("tr-TR");
      const ed = new Date(lv.end).toLocaleDateString("tr-TR");
      const statusMap = {
        pending: { cls: "pending", label: "Bekliyor" },
        approved: { cls: "completed", label: "Onayland\u0131" },
        rejected: { cls: "urgent", label: "Reddedildi" },
        cancelled: { cls: "danger", label: "\u0130ptal Edildi" }
      };
      const st = statusMap[lv.status] || statusMap.pending;
      const actions = lv.status === "pending" ? `
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
                ${lv.status === "approved" ? `<button class="action-btn danger" onclick="window.updateLeaveStatus('${lv.id}','cancelled')"><span class="material-icons-round">cancel</span> \u0130ptal Et</button>` : ""}
                <button class="action-btn danger" onclick="window.deleteLeave('${lv.id}')">
                    <span class="material-icons-round">delete</span> Sil
                </button>
            </div>`;
      list.insertAdjacentHTML("beforeend", `
            <div class="task-card" onclick="window.toggleTaskCard(this, event)">
                <div class="task-header">
                    <div class="task-title"><span class="material-icons-round" style="font-size:1rem;vertical-align:middle">person</span> ${lv.worker}</div>
                </div>
                <div class="task-chips">
                    <span class="chip chip-muted"><span class="material-icons-round">date_range</span> ${sd} \u2192 ${ed}</span>
                    <span class="chip chip-${st.cls}">${st.label}</span>
                </div>
                ${actions}
            </div>
        `);
    });
  }
  window.updateLeaveStatus = async function(leaveId, status) {
    try {
      await window.updateDoc(window.doc(window.db, "leaves", leaveId), { status });
      const msg = status === "approved" ? "\u0130zin onayland\u0131." : status === "cancelled" ? "\u0130zin iptal edildi." : "\u0130zin reddedildi.";
      const icon = status === "approved" ? "thumb_up" : status === "cancelled" ? "cancel" : "thumb_down";
      showToast(msg, icon);
      if (status === "approved" || status === "rejected") {
        const leave = leaves.find((l) => l.id === leaveId);
        if (leave) {
          const workerChatId = getWorkerChatId(leave.worker);
          const statusEmoji = status === "approved" ? "\u2705" : "\u274C";
          const statusText = status === "approved" ? "ONAYLANDI" : "REDDED\u0130LD\u0130";
          const startFmt = new Date(leave.start).toLocaleDateString("tr-TR");
          const endFmt = new Date(leave.end).toLocaleDateString("tr-TR");
          await sendTelegramNotification(
            workerChatId,
            `${statusEmoji} <b>Titan Makina - \u0130zin Talebi ${statusText}</b>

\u{1F5D3} ${startFmt} \u2192 ${endFmt} tarihli izin talebiniz <b>${statusText}</b>.`
          );
        }
      }
    } catch (e) {
      showToast("Durum g\xFCncellenemedi", "error");
    }
  };
  window.deleteLeave = async function(leaveId) {
    try {
      await window.deleteDoc(window.doc(window.db, "leaves", leaveId));
      showToast("\u0130zin talebiniz silindi.", "delete");
    } catch (e) {
      showToast("Silinemedi!", "error");
    }
  };
  function renderWorkerLeaves() {
    const list = document.getElementById("worker-leaves");
    if (!list) return;
    const myLeaves = leaves.filter((lv) => lv.worker === currentUser);
    if (myLeaves.length === 0) {
      list.innerHTML = '<div class="empty-state">Hen\xFCz bir izin talebiniz bulunmuyor.</div>';
      return;
    }
    list.innerHTML = "";
    myLeaves.forEach((lv) => {
      const sd = new Date(lv.start).toLocaleDateString("tr-TR");
      const ed = new Date(lv.end).toLocaleDateString("tr-TR");
      const statusMap = {
        pending: { cls: "pending", label: "Bekliyor" },
        approved: { cls: "completed", label: "Onayland\u0131" },
        rejected: { cls: "urgent", label: "Reddedildi" }
      };
      const st = statusMap[lv.status] || statusMap.pending;
      const actions = `
            <div class="task-actions" style="margin-top:.8rem">
                <button class="action-btn danger" onclick="window.deleteLeave('${lv.id}')">
                    <span class="material-icons-round">delete</span> \u0130ptal Et
                </button>
            </div>`;
      list.insertAdjacentHTML("beforeend", `
            <div class="task-card">
                <div class="task-header">
                    <div class="task-title"><span class="material-icons-round" style="font-size:1rem;vertical-align:middle">event</span> \u0130zin Talebim</div>
                </div>
                <div class="task-chips">
                    <span class="chip chip-muted"><span class="material-icons-round">date_range</span> ${sd} \u2192 ${ed}</span>
                    <span class="chip chip-${st.cls}">${st.label}</span>
                </div>
                ${actions}
            </div>
        `);
    });
  }
  function listenForOvertimes() {
    if (overtimesUnsubscribe) overtimesUnsubscribe();
    const q = window.query(window.collection(window.db, "overtimes"), window.orderBy("timestamp", "desc"));
    overtimesUnsubscribe = window.onSnapshot(q, (snap) => {
      overtimes = [];
      snap.forEach((d) => overtimes.push({ id: d.id, ...d.data() }));
      if (currentRole === "supervisor") renderSupervisorOvertimes();
      if (currentRole === "worker") renderWorkerOvertimes();
    });
  }
  function renderSupervisorOvertimes() {
    const list = document.getElementById("supervisor-overtimes");
    if (!list) return;
    if (overtimes.length === 0) {
      list.innerHTML = '<div class="empty-state">Hen\xFCz mesai talebi yok.</div>';
      return;
    }
    list.innerHTML = "";
    overtimes.forEach((ov) => {
      const sd = new Date(ov.date).toLocaleDateString("tr-TR");
      const statusMap = {
        pending: { cls: "pending", label: "Bekliyor" },
        approved: { cls: "completed", label: "Onayland\u0131" },
        rejected: { cls: "urgent", label: "Reddedildi" }
      };
      const decisionMap = {
        will_stay: { cls: "completed", label: "Kalacak", icon: "done" },
        will_not_stay: { cls: "urgent", label: "Kalmayacak", icon: "close" }
      };
      const st = statusMap[ov.status] || statusMap.pending;
      const dec = decisionMap[ov.decision] || { cls: "muted", label: "Belirtilmedi", icon: "help_outline" };
      const actions = ov.status === "pending" ? `
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
      list.insertAdjacentHTML("beforeend", `
            <div class="task-card" onclick="window.toggleTaskCard(this, event)">
                <div class="task-header">
                    <div class="task-title"><span class="material-icons-round" style="font-size:1rem;vertical-align:middle">person</span> ${ov.worker}</div>
                </div>
                ${ov.reason ? `<div style="font-size:.9rem; color:var(--text-color); margin: .5rem 0;">${ov.reason}</div>` : ""}
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
  window.updateOvertimeStatus = async function(overtimeId, status) {
    try {
      await window.updateDoc(window.doc(window.db, "overtimes", overtimeId), { status });
      const msg = status === "approved" ? "Mesai onayland\u0131." : "Mesai reddedildi.";
      const icon = status === "approved" ? "thumb_up" : "thumb_down";
      showToast(msg, icon);
      if (status === "approved" || status === "rejected") {
        const ov = overtimes.find((o) => o.id === overtimeId);
        if (ov) {
          const workerChatId = getWorkerChatId(ov.worker);
          const statusEmoji = status === "approved" ? "\u2705" : "\u274C";
          const statusText = status === "approved" ? "ONAYLANDI" : "REDDED\u0130LD\u0130";
          const dateFmt = new Date(ov.date).toLocaleDateString("tr-TR");
          await sendTelegramNotification(
            workerChatId,
            `${statusEmoji} <b>Titan Makina - Mesai Talebi ${statusText}</b>

\u{1F5D3} ${dateFmt} tarihli mesai talebiniz <b>${statusText}</b>.`
          );
        }
      }
    } catch (e) {
      showToast("Durum g\xFCncellenemedi", "error");
    }
  };
  window.deleteOvertime = async function(overtimeId) {
    try {
      await window.deleteDoc(window.doc(window.db, "overtimes", overtimeId));
      showToast("Mesai talebi silindi.", "delete");
    } catch (e) {
      showToast("Silinemedi!", "error");
    }
  };
  function renderWorkerOvertimes() {
    const list = document.getElementById("worker-overtimes");
    if (!list) return;
    if (overtimes.length === 0) {
      list.innerHTML = '<div class="empty-state">Hen\xFCz onaylanm\u0131\u015F veya bekleyen bir mesai bulunmuyor.</div>';
      return;
    }
    list.innerHTML = "";
    overtimes.forEach((ov) => {
      const sd = new Date(ov.date).toLocaleDateString("tr-TR");
      const statusMap = {
        pending: { cls: "pending", label: "Bekliyor" },
        approved: { cls: "completed", label: "Onayland\u0131" },
        rejected: { cls: "urgent", label: "Reddedildi" }
      };
      const decisionMap = {
        will_stay: { cls: "completed", label: "Kalacak", icon: "done" },
        will_not_stay: { cls: "urgent", label: "Kalmayacak", icon: "close" }
      };
      const st = statusMap[ov.status] || statusMap.pending;
      const dec = decisionMap[ov.decision] || { cls: "muted", label: "Belirtilmedi", icon: "help_outline" };
      const actions = ov.worker === currentUser && ov.status === "pending" ? `
            <div class="task-actions" style="margin-top:.8rem">
                <button class="action-btn danger" onclick="window.deleteOvertime('${ov.id}')">
                    <span class="material-icons-round">delete</span> \u0130ptal Et
                </button>
            </div>` : "";
      const isMe = ov.worker === currentUser;
      const titleText = isMe ? "Mesai Talebim" : ov.worker;
      const titleIcon = isMe ? "more_time" : "person";
      list.insertAdjacentHTML("beforeend", `
            <div class="task-card">
                <div class="task-header">
                    <div class="task-title"><span class="material-icons-round" style="font-size:1rem;vertical-align:middle">${titleIcon}</span> ${titleText}</div>
                </div>
                ${ov.reason ? `<div style="font-size:.9rem; color:var(--text-color); margin: .5rem 0;">${ov.reason}</div>` : ""}
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
  var currentCalendarDate = /* @__PURE__ */ new Date();
  window.changeCalendarMonth = function(offset) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
    renderLeaveCalendar();
  };
  function renderLeaveCalendar() {
    const validLeaves = leaves.filter((l) => l.status === "approved" || l.status === "pending");
    const containers = [
      { grid: "leave-calendar-view", header: "sup-calendar-month-year" },
      { grid: "wrk-leave-calendar-view", header: "wrk-calendar-month-year" }
    ];
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const monthNames = ["Ocak", "\u015Eubat", "Mart", "Nisan", "May\u0131s", "Haziran", "Temmuz", "A\u011Fustos", "Eyl\xFCl", "Ekim", "Kas\u0131m", "Aral\u0131k"];
    const monthYearText = `${monthNames[month]} ${year}`;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDayOfWeek = firstDay === 0 ? 7 : firstDay;
    containers.forEach((c) => {
      const gridEl = document.getElementById(c.grid);
      const headerEl = document.getElementById(c.header);
      if (!gridEl || !headerEl) return;
      headerEl.innerText = monthYearText;
      gridEl.innerHTML = "";
      const weekdays = ["Pzt", "Sal", "\xC7ar", "Per", "Cum", "Cmt", "Paz"];
      weekdays.forEach((day) => {
        gridEl.insertAdjacentHTML("beforeend", `<div class="calendar-weekday">${day}</div>`);
      });
      for (let i = 1; i < startDayOfWeek; i++) {
        gridEl.insertAdjacentHTML("beforeend", `<div class="calendar-day empty"></div>`);
      }
      for (let i = 1; i <= daysInMonth; i++) {
        const currentDateStr = new Date(year, month, i).toLocaleDateString("en-CA");
        const leavesToday = validLeaves.filter((l) => {
          const start = new Date(l.start).setHours(0, 0, 0, 0);
          const end = new Date(l.end).setHours(23, 59, 59, 999);
          const current = new Date(year, month, i).setHours(12, 0, 0, 0);
          return current >= start && current <= end;
        });
        const badgesHtml = leavesToday.map(
          (l) => `<div class="leave-badge ${l.status === "pending" ? "pending" : ""}" title="${l.worker}">${l.worker.split(" ")[0]}</div>`
        ).join("");
        gridEl.insertAdjacentHTML("beforeend", `
                <div class="calendar-day">
                    <div class="cd-num">${i}</div>
                    ${badgesHtml}
                </div>
            `);
      }
    });
  }
  function listenForMaterials() {
    if (materialsUnsubscribe) materialsUnsubscribe();
    const q = window.query(window.collection(window.db, "materials"), window.orderBy("timestamp", "desc"));
    materialsUnsubscribe = window.onSnapshot(q, (snap) => {
      materials = [];
      snap.forEach((d) => materials.push({ id: d.id, ...d.data() }));
      if (currentRole === "supervisor") renderSupervisorMaterials();
      renderWorkerMaterials();
    });
  }
  function renderSupervisorMaterials() {
    const list = document.getElementById("supervisor-materials");
    if (!list) return;
    if (materials.length === 0) {
      list.innerHTML = '<div class="empty-state">Malzeme talebi yok.</div>';
      return;
    }
    list.innerHTML = "";
    let filtered = sortByStatus(materials);
    if (currentMaterialFilter === "pending") filtered = filtered.filter((m) => m.status === "pending");
    else if (currentMaterialFilter === "approved") filtered = filtered.filter((m) => m.status === "approved" || m.status === "resolved");
    else if (currentMaterialFilter === "rejected") filtered = filtered.filter((m) => m.status === "rejected");
    if (filtered.length === 0) {
      list.innerHTML = '<div class="empty-state">Bu filtrede malzeme talebi yok.</div>';
      return;
    }
    filtered.forEach((m) => {
      const statusMap = {
        pending: { cls: "pending", label: "Bekliyor" },
        resolved: { cls: "completed", label: "\xC7\xF6z\xFCld\xFC" },
        // Eski kayıtlar için
        approved: { cls: "completed", label: "Onayland\u0131" },
        rejected: { cls: "danger", label: "Reddedildi" }
      };
      const st = statusMap[m.status] || statusMap.pending;
      const openTime = m.timestamp ? new Date(m.timestamp).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "";
      const resolvedTime = m.resolvedAt && (m.status === "resolved" || m.status === "approved" || m.status === "rejected") ? ` | Kapan\u0131\u015F: ${new Date(m.resolvedAt).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}` : "";
      const timeHtml = `<div class="task-time">${openTime}${resolvedTime}</div>`;
      const commentsHtml = (m.comments || []).map((c, idx) => {
        const commentTime = c.ts ? `<span style="font-size:0.7rem;color:var(--clr-text-muted);margin-left:5px">(${new Date(c.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })})</span>` : "";
        const originalCommentHtml = c.originalText ? `<span style="font-size:.75rem;color:var(--clr-text-muted);opacity:.65;margin-left:.3rem">(\xF6nceki: ${c.originalText})</span>` : "";
        const editIcon = c.author === currentUser ? `<span class="material-icons-round" style="font-size:.8rem;vertical-align:middle;color:var(--clr-primary);cursor:pointer;margin-left:.4rem" onclick="event.stopPropagation();window.startEditComment('${m.id}',${idx})" title="D\xFCzenle">edit</span>` : "";
        return `<div class="comment ${c.role}"><strong>${c.author}:</strong> ${c.text} ${originalCommentHtml}${editIcon}${commentTime}</div>`;
      }).join("");
      const imageHtml = m.imageUrl ? `<div class="task-img-wrap"><img src="${m.imageUrl}" loading="lazy" onclick="openImageModal('${m.imageUrl}', event)"></div>` : "";
      const origNameHtml = m.originalName ? `<div style="font-size:.75rem;color:var(--clr-text-muted);opacity:.7;margin-top:.15rem">(\xF6nceki: ${m.originalName})</div>` : "";
      list.insertAdjacentHTML("beforeend", `
        <div class="task-card" onclick="window.toggleTaskCard(this, event)">
                <div class="task-header">
                    <div class="task-title">
                        <span class="material-icons-round" style="font-size:1rem;vertical-align:middle">inventory_2</span> ${m.name}
                        <span class="material-icons-round" style="font-size:.9rem;vertical-align:middle;color:var(--clr-primary);cursor:pointer;margin-left:.3rem" onclick="event.stopPropagation();window.startEditMaterial('${m.id}')" title="D\xFCzenle">edit</span>
                        ${origNameHtml}
                    </div>
                    ${timeHtml}
                </div>
                <div class="task-chips">
                    <span class="chip chip-muted"><span class="material-icons-round">person</span> ${m.worker}</span>
                    <span class="chip chip-${st.cls}">${st.label}</span>
                </div>
                ${m.desc ? `<p class="mat-desc">${m.desc}</p>` : ""}
                ${imageHtml}
        <div class="comments-section">${commentsHtml}</div>
                <div class="comment-form" onclick="event.stopPropagation()">
                    <input type="text" class="comment-input" id="mc-${m.id}" placeholder="Yorum ekle...">
                    <button class="action-btn" onclick="window.addComment('${m.id}')"><span class="material-icons-round">send</span></button>
                </div>
                <div class="task-actions" style="margin-top:.5rem" onclick="event.stopPropagation()">
                    ${m.status === "pending" ? `
                    <button class="action-btn success" onclick="window.updateMaterialStatus('${m.id}', 'approved')"><span class="material-icons-round">check_circle</span> Onayla</button>
                    <button class="action-btn danger" onclick="window.updateMaterialStatus('${m.id}', 'rejected')"><span class="material-icons-round">cancel</span> Reddet</button>
                    ` : ""}
                    <button class="action-btn danger" onclick="window.deleteMaterial('${m.id}')"><span class="material-icons-round">delete</span> Sil</button>
                </div>
            </div >
            `);
    });
  }
  function renderWorkerMaterials() {
    const list = document.getElementById("worker-materials");
    if (!list) return;
    const myMats = sortByStatus(materials.filter((m) => m.worker === currentUser));
    if (myMats.length === 0) {
      list.innerHTML = '<div class="empty-state">Hen\xFCz malzeme talebiniz yok.</div>';
      return;
    }
    list.innerHTML = "";
    myMats.forEach((m) => {
      const statusMap = {
        pending: { cls: "pending", label: "Bekliyor" },
        resolved: { cls: "completed", label: "\xC7\xF6z\xFCld\xFC" },
        // Eski kayıtlar için
        approved: { cls: "completed", label: "Onayland\u0131" },
        rejected: { cls: "danger", label: "Reddedildi" }
      };
      const st = statusMap[m.status] || statusMap.pending;
      const openTime = m.timestamp ? new Date(m.timestamp).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "";
      const resolvedTime = m.resolvedAt && (m.status === "resolved" || m.status === "approved" || m.status === "rejected") ? ` | Kapan\u0131\u015F: ${new Date(m.resolvedAt).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}` : "";
      const timeHtml = `<div class="task-time">${openTime}${resolvedTime}</div>`;
      const commentsHtml = (m.comments || []).map((c, idx) => {
        const commentTime = c.ts ? `<span style="font-size:0.7rem;color:var(--clr-text-muted);margin-left:5px">(${new Date(c.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })})</span>` : "";
        const originalCommentHtml = c.originalText ? `<span style="font-size:.75rem;color:var(--clr-text-muted);opacity:.65;margin-left:.3rem">(\xF6nceki: ${c.originalText})</span>` : "";
        const editIcon = c.author === currentUser ? `<span class="material-icons-round" style="font-size:.8rem;vertical-align:middle;color:var(--clr-primary);cursor:pointer;margin-left:.4rem" onclick="event.stopPropagation();window.startEditComment('${m.id}',${idx})" title="D\xFCzenle">edit</span>` : "";
        return `<div class="comment ${c.role}"><strong>${c.author}:</strong> ${c.text} ${originalCommentHtml}${editIcon}${commentTime}</div>`;
      }).join("");
      const imageHtml = m.imageUrl ? `<div class="task-img-wrap"><img src="${m.imageUrl}" loading="lazy" onclick="openImageModal('${m.imageUrl}', event)"></div>` : "";
      const selfApproveHtml = m.status === "pending" ? `
        <div style="margin-top:.6rem" onclick="event.stopPropagation()">
            <button class="action-btn success" style="width:100%;" onclick="window.workerSelfApproveMaterial('${m.id}')">
                <span class="material-icons-round">check_circle</span> Onayla (Temin Ettim)
            </button>
        </div>` : "";
      list.insertAdjacentHTML("beforeend", `
        <div class="task-card" onclick="window.toggleTaskCard(this, event)">
                <div class="task-header">
                    <div class="task-title">
                        ${m.name}
                        <span class="material-icons-round" style="font-size:.9rem;vertical-align:middle;color:var(--clr-primary);cursor:pointer;margin-left:.3rem" onclick="event.stopPropagation();window.startEditMaterial('${m.id}')" title="D\xFCzenle">edit</span>
                        ${m.originalName ? `<div style="font-size:.75rem;color:var(--clr-text-muted);opacity:.7;margin-top:.15rem">(\xF6nceki: ${m.originalName})</div>` : ""}
                    </div>
                    ${timeHtml}
                </div>
                <div class="task-chips">
                    <span class="chip chip-${st.cls}">${st.label}</span>
                </div>
                ${m.desc ? `<p class="mat-desc">${m.desc}</p>` : ""}
                ${imageHtml}
        <div class="comments-section">${commentsHtml}</div>
        <div class="comment-form" onclick="event.stopPropagation()">
            <input type="text" class="comment-input" id="mc-${m.id}" placeholder="Yorum ekle...">
                <button class="action-btn" onclick="window.addComment('${m.id}')"><span class="material-icons-round">send</span></button>
        </div>
                ${selfApproveHtml}
            </div >
            `);
    });
  }
  window.addComment = async function(materialId) {
    const input = document.getElementById(`mc-${materialId}`);
    if (!input || !input.value.trim()) return;
    const commentText = input.value.trim();
    try {
      const mat = materials.find((m) => m.id === materialId);
      const comments = mat ? mat.comments || [] : [];
      comments.push({ author: currentUser, role: currentRole, text: commentText, ts: (/* @__PURE__ */ new Date()).toISOString() });
      await window.updateDoc(window.doc(window.db, "materials", materialId), { comments });
      input.value = "";
      showToast("Yorum eklendi.", "comment");
      if (mat) {
        const matName = mat.name || "Malzeme Talebi";
        if (currentRole === "worker") {
          await sendTelegramNotification(
            SUPERVISOR_CHAT_ID,
            `\u{1F4AC} <b>Titan Makina - Yeni Yorum</b>

\u{1F477} <b>${currentUser}</b>, "<b>${matName}</b>" talebine yorum yazd\u0131:

"${commentText}"`
          );
        } else if (currentRole === "supervisor") {
          const workerChatId = getWorkerChatId(mat.worker);
          await sendTelegramNotification(
            workerChatId,
            `\u{1F4AC} <b>Titan Makina - Yeni Yorum</b>

\u{1F514} "<b>${matName}</b>" talebinize amir yorum yazd\u0131:

"${commentText}"`
          );
        }
      }
    } catch (e) {
      showToast("Yorum eklenemedi.", "error");
    }
  };
  window.workerSelfApproveMaterial = async function(materialId) {
    try {
      await window.updateDoc(window.doc(window.db, "materials", materialId), {
        status: "approved",
        resolvedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      showToast("Talep onayland\u0131 olarak i\u015Faretlendi.", "check_circle");
      const mat = materials.find((m) => m.id === materialId);
      if (mat) {
        await sendTelegramNotification(
          SUPERVISOR_CHAT_ID,
          `\u2705 <b>Titan Makina - Malzeme Temin Edildi</b>

\u{1F477} <b>${currentUser}</b>, "<b>${mat.name}</b>" malzeme talebini temin ederek onaylad\u0131.`
        );
      }
    } catch (e) {
      showToast("G\xFCncellenemedi.", "error");
    }
  };
  window.resolveMaterial = async function(materialId) {
    try {
      await window.updateDoc(window.doc(window.db, "materials", materialId), {
        status: "resolved",
        resolvedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      showToast("Talep \xE7\xF6z\xFCld\xFC olarak i\u015Faretlendi.", "check_circle");
    } catch (e) {
      showToast("G\xFCncellenemedi.", "error");
    }
  };
  window.updateMaterialStatus = async function(materialId, status) {
    try {
      await window.updateDoc(window.doc(window.db, "materials", materialId), {
        status,
        resolvedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      const msgs = { "approved": "Talebi onaylad\u0131n\u0131z.", "rejected": "Talebi reddettiniz." };
      const iconClasses = { "approved": "check_circle", "rejected": "cancel" };
      showToast(msgs[status] || "Durum g\xFCncellendi.", iconClasses[status] || "info");
      const mat = materials.find((m) => m.id === materialId);
      if (mat) {
        const workerChatId = getWorkerChatId(mat.worker);
        const statusEmoji = status === "approved" ? "\u2705" : "\u274C";
        const statusText = status === "approved" ? "ONAYLANDI" : "REDDED\u0130LD\u0130";
        await sendTelegramNotification(
          workerChatId,
          `${statusEmoji} <b>Titan Makina - Malzeme Talebi ${statusText}</b>

\u{1F4CB} <b>${mat.name}</b> isimli malzeme talebiniz <b>${statusText}</b>.`
        );
      }
    } catch (e) {
      showToast("G\xFCncellenemedi.", "error");
    }
  };
  window.deleteMaterial = async function(materialId) {
    try {
      await window.deleteDoc(window.doc(window.db, "materials", materialId));
      showToast("Talep silindi.", "delete");
    } catch (e) {
      showToast("Silinemedi.", "error");
    }
  };
  function renderSystemUsers() {
    const list = document.getElementById("user-management-list");
    if (!list) return;
    list.innerHTML = "";
    if (systemUsers.length === 0) {
      list.innerHTML = '<div class="empty-state">Kullan\u0131c\u0131 bulunamad\u0131.</div>';
      return;
    }
    systemUsers.forEach((u) => {
      const roleIcon = u.role === "supervisor" ? "admin_panel_settings" : "engineering";
      const roleLabel = u.role === "supervisor" ? "Amir" : "Usta";
      const tgId = u.telegramChatId || "";
      const tgStatus = tgId ? `<span style="color:var(--clr-success);font-size:.78rem">\u2705 ${tgId}</span>` : `<span style="color:var(--clr-text-muted);font-size:.78rem">Ayarlanmam\u0131\u015F</span>`;
      const isOnline = isUserTrulyOnline(u);
      const lastSeenText = isOnline ? "\xC7evrimi\xE7i" : formatLastSeen(u.lastSeen);
      const onlineDot = isOnline ? `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#10b981;box-shadow:0 0 6px #10b981;flex-shrink:0"></span>` : `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#475569;flex-shrink:0"></span>`;
      const presenceColor = isOnline ? "var(--clr-success)" : "var(--clr-text-muted)";
      const cardBorder = isOnline ? "1px solid rgba(16,185,129,.25)" : "";
      const cardBg = isOnline ? "background:rgba(16,185,129,.05);" : "";
      list.insertAdjacentHTML("beforeend", `
    <div class="task-card" style="padding:.9rem;margin-bottom:.5rem;${cardBg}${cardBorder ? `border:${cardBorder};` : ""}">
        <!-- Presence ba\u015Fl\u0131k -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.65rem">
            <div style="display:flex;align-items:center;gap:.5rem">
                ${onlineDot}
                <span style="font-size:.82rem;color:${presenceColor};font-weight:500">${lastSeenText}</span>
            </div>
            <span style="font-size:.75rem;color:var(--clr-text-muted)">${isOnline ? "" : u.lastSeen ? new Date(u.lastSeen).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</span>
        </div>
        <!-- \xDCst sat\u0131r: \u0130sim + rol + \u015Fifre -->
        <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
                <div style="font-weight:600;font-size:1rem">${u.name}</div>
                <div style="margin-top:.3rem;font-size:.82rem;color:var(--clr-text-muted);display:flex;align-items:center;gap:.4rem">
                    <span class="material-icons-round" style="font-size:.9rem">${roleIcon}</span> ${roleLabel}
                    &nbsp;|&nbsp; \u015Eifre:
                    <span style="font-family:monospace;background:rgba(255,255,255,.08);padding:.1rem .4rem;border-radius:4px">${u.password}</span>
                    <span class="material-icons-round" style="font-size:1rem;cursor:pointer;color:var(--clr-primary)" onclick="window.promptEditPassword('${u.id}','${u.name}')" title="\u015Eifreyi De\u011Fi\u015Ftir">edit</span>
                </div>
            </div>
        </div>
        <!-- Telegram -->
        <div style="margin-top:.7rem;padding-top:.7rem;border-top:1px solid rgba(255,255,255,.07)">
            <div style="font-size:.8rem;color:var(--clr-text-muted);margin-bottom:.4rem;display:flex;align-items:center;gap:.4rem">
                <span class="material-icons-round" style="font-size:.9rem">send</span> Telegram Chat ID: ${tgStatus}
            </div>
            <div style="display:flex;gap:.5rem;align-items:center">
                <input type="text" id="tg-input-${u.id}" value="${tgId}" placeholder="Chat ID girin..."
                    style="flex:1;padding:.4rem .7rem;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.07);color:inherit;font-size:.85rem">
                <button class="action-btn success" style="padding:.4rem .7rem;font-size:.8rem" onclick="window.saveTelegramChatId('${u.id}', document.getElementById('tg-input-${u.id}').value)">
                    <span class="material-icons-round" style="font-size:.9rem">save</span> Kaydet
                </button>
            </div>
        </div>
    </div>
        `);
    });
  }
  window.promptAddUser = async function() {
    const name = prompt("Yeni personelin Ad\u0131 Soyad\u0131:");
    if (!name || !name.trim()) return;
    const roleInput = prompt("Rol\xFC nedir? (amir / usta):", "usta");
    if (!roleInput) return;
    const role = roleInput.toLowerCase().trim() === "amir" ? "supervisor" : "worker";
    const password = prompt("Giri\u015F i\xE7in \u015Fifre belirleyin:", "1234");
    if (!password) return;
    try {
      await window.addDoc(window.collection(window.db, "users"), { name: name.trim(), role, password });
      showToast("Personel eklendi.", "person_add");
      renderSystemUsers();
    } catch (e) {
      showToast("Eklenemedi.", "error");
    }
  };
  window.promptEditPassword = async function(userId, userName) {
    const pw = prompt(`${userName} i\xE7in yeni \u015Fifre: `);
    if (pw && pw.trim()) {
      try {
        await window.updateDoc(window.doc(window.db, "users", userId), { password: pw.trim() });
        showToast("\u015Eifre g\xFCncellendi.", "vpn_key");
        renderSystemUsers();
      } catch (e) {
        showToast("G\xFCncellenemedi.", "error");
      }
    }
  };
  window.promptDeleteUser = async function() {
    const name = prompt("Silmek istedi\u011Finiz personelin tam ad\u0131n\u0131 girin:");
    if (!name || !name.trim()) return;
    const user = systemUsers.find((u) => u.name.toLowerCase() === name.trim().toLowerCase());
    if (user) {
      if (confirm(`${user.name} silinecek.Onayl\u0131yor musunuz ? `)) {
        try {
          await window.deleteDoc(window.doc(window.db, "users", user.id));
          showToast("Personel silindi.", "person_remove");
          renderSystemUsers();
        } catch (e) {
          showToast("Silinemedi.", "error");
        }
      }
    } else {
      showToast("Personel bulunamad\u0131.", "search_off");
    }
  };
  function showToast(message, icon) {
    if (!toastContainer) return;
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<span class="material-icons-round">${icon || "info"}</span> ${message}`;
    toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.animation = "toastLeave 0.3s forwards";
      setTimeout(() => t.remove(), 300);
    }, 3e3);
  }
  window.toggleHeaderRadio = function(event) {
    if (event) {
      event.stopPropagation();
    }
    const panel = document.getElementById("header-radio-panel");
    const btns = document.querySelectorAll(".radio-toggle-btn");
    if (!panel) return;
    panel.classList.toggle("open");
    const open = panel.classList.contains("open");
    btns.forEach((b) => b.classList.toggle("active", open));
  };
  document.addEventListener("click", function(event) {
    const panel = document.getElementById("header-radio-panel");
    if (panel && panel.classList.contains("open")) {
      const isClickInsidePanel = panel.contains(event.target);
      const isClickOnToggleBtn = event.target.closest(".radio-toggle-btn");
      if (!isClickInsidePanel && !isClickOnToggleBtn) {
        panel.classList.remove("open");
        const btns = document.querySelectorAll(".radio-toggle-btn");
        btns.forEach((b) => b.classList.remove("active"));
      }
    }
  });
  window.playRadio = function() {
    const sel = document.getElementById("radio-station");
    const audio = document.getElementById("radio-audio-player");
    const stat = document.getElementById("yt-status-text");
    const icon = document.getElementById("yt-play-icon");
    if (!audio || !sel) return;
    if (audio.src !== sel.value) audio.src = sel.value;
    if (audio.paused) {
      if (stat) stat.textContent = "Ba\u011Flan\u0131yor...";
      if (icon) icon.textContent = "hourglass_empty";
      audio.play().then(() => {
        if (stat) stat.textContent = sel.options[sel.selectedIndex].text + " Devrede";
        if (icon) icon.textContent = "pause";
        if ("mediaSession" in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({ title: sel.options[sel.selectedIndex].text, artist: "Canl\u0131 Radyo" });
          navigator.mediaSession.setActionHandler("play", window.playRadio);
          navigator.mediaSession.setActionHandler("pause", window.stopRadio);
        }
      }).catch(() => {
        if (stat) stat.textContent = "Ba\u011Flant\u0131 hatas\u0131!";
        if (icon) icon.textContent = "play_arrow";
      });
    } else {
      audio.pause();
      if (stat) stat.textContent = "Duraklat\u0131ld\u0131.";
      if (icon) icon.textContent = "play_arrow";
    }
  };
  window.stopRadio = function() {
    const audio = document.getElementById("radio-audio-player");
    const stat = document.getElementById("yt-status-text");
    const icon = document.getElementById("yt-play-icon");
    if (!audio) return;
    audio.pause();
    audio.src = "";
    if (stat) stat.textContent = "Radyo kapal\u0131.";
    if (icon) icon.textContent = "play_arrow";
  };
  window.changeRadioVolume = function(val) {
    const audio = document.getElementById("radio-audio-player");
    if (audio) audio.volume = val / 100;
  };
  function listenForDocuments() {
    if (docsUnsubscribe) docsUnsubscribe();
    const q = window.query(window.collection(window.db, "documents"), window.orderBy("timestamp", "desc"));
    docsUnsubscribe = window.onSnapshot(q, (snap) => {
      documentsList = [];
      snap.forEach((d) => documentsList.push({ id: d.id, ...d.data() }));
      if (currentRole === "supervisor") renderSupervisorDocs();
      renderWorkerDocs();
    });
  }
  function renderSupervisorDocs() {
    const list = document.getElementById("supervisor-docs");
    if (!list) return;
    if (documentsList.length === 0) {
      list.innerHTML = '<div class="empty-state">Hen\xFCz d\xF6k\xFCman y\xFCklenmemi\u015F.</div>';
      return;
    }
    list.innerHTML = "";
    documentsList.forEach((d) => {
      const time = new Date(d.timestamp).toLocaleString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const pagesCount = d.urls ? d.urls.length : d.url ? 1 : 0;
      list.insertAdjacentHTML("beforeend", `
            <div class="task-card doc-card">
                <div class="task-header">
                    <div class="task-title"><span class="material-icons-round" style="font-size:1rem;vertical-align:middle;color:var(--clr-primary)">description</span> ${d.title}</div>
                    <div class="task-time">${time}</div>
                </div>
                <div class="task-chips">
                    <span class="chip chip-muted">Y\xFCkleyen: ${d.uploader}</span>
                    <span class="chip chip-blue"><span class="material-icons-round">pages</span> ${pagesCount} Sayfa</span>
                </div>
                <div class="task-actions" style="margin-top:1rem">
                    <button class="action-btn success" onclick="window.viewDocumentGallery('${d.id}')"><span class="material-icons-round">visibility</span> \u0130ncele</button>
                    <button class="action-btn danger" onclick="window.deleteDocument('${d.id}')"><span class="material-icons-round">delete</span> Sil</button>
                </div>
                <div id="doc-gallery-${d.id}" class="doc-gallery" style="display:none; margin-top:1rem; border-top:1px solid rgba(255,255,255,0.1); padding-top:1rem;">
                </div>
            </div>
        `);
    });
  }
  function renderWorkerDocs() {
    const list = document.getElementById("worker-docs");
    if (!list) return;
    if (documentsList.length === 0) {
      list.innerHTML = '<div class="empty-state">Hen\xFCz d\xF6k\xFCman y\xFCklenmemi\u015F.</div>';
      return;
    }
    list.innerHTML = "";
    documentsList.forEach((d) => {
      const time = new Date(d.timestamp).toLocaleString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const pagesCount = d.urls ? d.urls.length : d.url ? 1 : 0;
      list.insertAdjacentHTML("beforeend", `
            <div class="task-card doc-card">
                <div class="task-header">
                    <div class="task-title"><span class="material-icons-round" style="font-size:1rem;vertical-align:middle;color:var(--clr-primary)">description</span> ${d.title}</div>
                    <div class="task-time">${time}</div>
                </div>
                <div class="task-chips">
                    <span class="chip chip-muted">Y\xFCkleyen: ${d.uploader}</span>
                    <span class="chip chip-blue"><span class="material-icons-round">pages</span> ${pagesCount} Sayfa</span>
                </div>
                <div class="task-actions" style="margin-top:1rem">
                    <button class="action-btn success" onclick="window.viewDocumentGallery('${d.id}')"><span class="material-icons-round">visibility</span> \u0130ncele</button>
                </div>
                <div id="doc-gallery-${d.id}" class="doc-gallery" style="display:none; margin-top:1rem; border-top:1px solid rgba(255,255,255,0.1); padding-top:1rem;">
                </div>
            </div>
        `);
    });
  }
  window.viewDocumentGallery = function(docId) {
    const galleryEl = document.getElementById(`doc-gallery-${docId}`);
    if (!galleryEl) return;
    if (galleryEl.style.display === "block") {
      galleryEl.style.display = "none";
      return;
    }
    const doc = documentsList.find((d) => d.id === docId);
    if (!doc) return;
    let html = "";
    const images = doc.urls || (doc.url ? [doc.url] : []);
    images.forEach((url, i) => {
      html += `
            <div style="margin-bottom:1rem; text-align:center;">
                <div style="font-size:0.8rem; color:var(--clr-text-muted); margin-bottom:4px;">Sayfa ${i + 1}</div>
                <img src="${url}" style="max-width:100%; border-radius:8px; cursor:pointer; border:1px solid rgba(255,255,255,0.1)" onclick="openImageModal('${url}', event)" loading="lazy">
            </div>
        `;
    });
    galleryEl.innerHTML = html;
    galleryEl.style.display = "block";
  };
  window.deleteDocument = async function(docId) {
    try {
      await window.deleteDoc(window.doc(window.db, "documents", docId));
      showToast("D\xF6k\xFCman silindi.", "delete");
    } catch (e) {
      showToast("Silinemedi!", "error");
    }
  };
  var appNotifications = [];
  var notifInitialized = false;
  function addAppNotification(type, icon, text, targetTab) {
    if (!notifInitialized) return;
    const prefix = currentRole === "supervisor" ? "sup" : "wrk";
    appNotifications.unshift({
      type,
      icon,
      text,
      targetTab,
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      id: Date.now() + Math.random()
    });
    if (appNotifications.length > 50) appNotifications.length = 50;
    updateNotifBadge(prefix);
  }
  function updateNotifBadge(prefix) {
    const badge = document.getElementById(`${prefix}-notif-badge`);
    if (!badge) return;
    const count = appNotifications.length;
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : count;
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
  }
  function renderNotifPanel(prefix) {
    const list = document.getElementById(`${prefix}-notif-list`);
    if (!list) return;
    if (appNotifications.length === 0) {
      list.innerHTML = '<div class="empty-state" style="padding:1.5rem;font-size:.85rem">Bildirim yok</div>';
      return;
    }
    list.innerHTML = appNotifications.map((n) => {
      const time = formatLastSeen(n.ts);
      return `
        <div class="notif-item" onclick="window.handleNotifClick('${prefix}','${n.targetTab}')">
            <div class="notif-icon ${n.type}">
                <span class="material-icons-round">${n.icon}</span>
            </div>
            <div class="notif-text">
                ${n.text}
                <span class="notif-time">${time}</span>
            </div>
        </div>`;
    }).join("");
  }
  window.toggleNotifPanel = function(prefix) {
    const panel = document.getElementById(`${prefix}-notif-panel`);
    if (!panel) return;
    const isOpen = panel.style.display !== "none";
    panel.style.display = isOpen ? "none" : "block";
    if (!isOpen) renderNotifPanel(prefix);
  };
  window.handleNotifClick = function(prefix, targetTab) {
    const panel = document.getElementById(`${prefix}-notif-panel`);
    if (panel) panel.style.display = "none";
    const role = prefix === "sup" ? "supervisor" : "worker";
    const navItems = document.querySelectorAll(`#${role}-screen .nav-item`);
    let matchedNav = null;
    navItems.forEach((n) => {
      if (n.getAttribute("onclick") && n.getAttribute("onclick").includes(`'${targetTab}'`)) {
        matchedNav = n;
      }
    });
    window.switchTab(role, targetTab, matchedNav);
  };
  window.clearNotifications = function(prefix) {
    appNotifications = [];
    updateNotifBadge(prefix);
    renderNotifPanel(prefix);
  };
  document.addEventListener("click", function(event) {
    ["sup", "wrk"].forEach((prefix) => {
      const panel = document.getElementById(`${prefix}-notif-panel`);
      const btn = document.getElementById(`${prefix}-notif-btn`);
      if (panel && panel.style.display !== "none") {
        if (!panel.contains(event.target) && !btn.contains(event.target)) {
          panel.style.display = "none";
        }
      }
    });
  });
  var prevTasksSnapshot = null;
  function checkTaskNotifications(newTasks) {
    if (!prevTasksSnapshot) {
      prevTasksSnapshot = newTasks.map((t) => JSON.stringify(t));
      return;
    }
    const prevMap = {};
    prevTasksSnapshot.forEach((s) => {
      const t = JSON.parse(s);
      prevMap[t.id] = t;
    });
    newTasks.forEach((t) => {
      const prev = prevMap[t.id];
      if (!prev) {
        if (currentRole === "supervisor") {
        } else if (t.worker === currentUser) {
          addAppNotification("task", "assignment", `<b>${t.title}</b> g\xF6revi size atand\u0131.`, "tasks");
        }
      } else {
        if (prev.status !== t.status) {
          if (currentRole === "supervisor") {
            if (t.status === "progress") addAppNotification("task", "engineering", `<b>${t.worker}</b> "<b>${t.title}</b>" g\xF6revini ba\u015Flatt\u0131.`, "tasks");
            if (t.status === "completed") addAppNotification("task", "check_circle", `<b>${t.worker}</b> "<b>${t.title}</b>" g\xF6revini tamamlad\u0131.`, "tasks");
          } else if (t.worker === currentUser) {
            if (t.status === "completed") addAppNotification("task", "check_circle", `"<b>${t.title}</b>" g\xF6reviniz tamamland\u0131 olarak i\u015Faretlendi.`, "tasks");
          }
        }
        const prevComments = prev.comments ? prev.comments.length : 0;
        const newComments = t.comments ? t.comments.length : 0;
        if (newComments > prevComments) {
          const lastComment = t.comments[t.comments.length - 1];
          if (lastComment.author !== currentUser) {
            addAppNotification("comment", "chat", `<b>${lastComment.author}</b> "<b>${t.title}</b>" g\xF6revine yorum yazd\u0131: "${lastComment.text}"`, "tasks");
          }
        }
      }
    });
    prevTasksSnapshot = newTasks.map((t) => JSON.stringify(t));
  }
  var prevMaterialsSnapshot = null;
  function checkMaterialNotifications(newMats) {
    if (!prevMaterialsSnapshot) {
      prevMaterialsSnapshot = newMats.map((m) => JSON.stringify(m));
      return;
    }
    const prevMap = {};
    prevMaterialsSnapshot.forEach((s) => {
      const m = JSON.parse(s);
      prevMap[m.id] = m;
    });
    newMats.forEach((m) => {
      const prev = prevMap[m.id];
      if (!prev) {
        if (currentRole === "supervisor" && m.worker !== currentUser) {
          addAppNotification("material", "inventory_2", `<b>${m.worker}</b> yeni malzeme talep etti: <b>${m.name}</b>`, "materials");
        }
      } else {
        if (prev.status !== m.status) {
          if (currentRole === "worker" && m.worker === currentUser) {
            const label = m.status === "approved" ? "onayland\u0131 \u2705" : m.status === "rejected" ? "reddedildi \u274C" : m.status;
            addAppNotification("material", "inventory_2", `"<b>${m.name}</b>" malzeme talebiniz ${label}.`, "materials");
          }
        }
        const prevComments = prev.comments ? prev.comments.length : 0;
        const newComments = m.comments ? m.comments.length : 0;
        if (newComments > prevComments) {
          const lastComment = m.comments[m.comments.length - 1];
          if (lastComment.author !== currentUser) {
            addAppNotification("comment", "chat", `<b>${lastComment.author}</b> "<b>${m.name}</b>" talebine yorum yazd\u0131.`, "materials");
          }
        }
      }
    });
    prevMaterialsSnapshot = newMats.map((m) => JSON.stringify(m));
  }
  var prevLeavesSnapshot = null;
  function checkLeaveNotifications(newLeaves) {
    if (!prevLeavesSnapshot) {
      prevLeavesSnapshot = newLeaves.map((l) => JSON.stringify(l));
      return;
    }
    const prevMap = {};
    prevLeavesSnapshot.forEach((s) => {
      const l = JSON.parse(s);
      prevMap[l.id] = l;
    });
    newLeaves.forEach((l) => {
      const prev = prevMap[l.id];
      if (!prev) {
        if (currentRole === "supervisor" && l.worker !== currentUser) {
          addAppNotification("leave", "event", `<b>${l.worker}</b> izin talebinde bulundu.`, "calendar");
        }
      } else if (prev.status !== l.status) {
        if (currentRole === "worker" && l.worker === currentUser) {
          const label = l.status === "approved" ? "onayland\u0131 \u2705" : l.status === "rejected" ? "reddedildi \u274C" : l.status;
          addAppNotification("leave", "event", `\u0130zin talebiniz ${label}.`, "calendar");
        }
      }
    });
    prevLeavesSnapshot = newLeaves.map((l) => JSON.stringify(l));
  }
  listenForTasks = function() {
    if (unsubscribe) unsubscribe();
    const q = window.query(window.collection(window.db, "tasks"), window.orderBy("timestamp", "desc"));
    unsubscribe = window.onSnapshot(q, (snap) => {
      tasks = [];
      snap.forEach((d) => tasks.push({ id: d.id, ...d.data() }));
      checkTaskNotifications(tasks);
      renderTasks();
    });
  };
  listenForMaterials = function() {
    if (materialsUnsubscribe) materialsUnsubscribe();
    const q = window.query(window.collection(window.db, "materials"), window.orderBy("timestamp", "desc"));
    materialsUnsubscribe = window.onSnapshot(q, (snap) => {
      materials = [];
      snap.forEach((d) => materials.push({ id: d.id, ...d.data() }));
      checkMaterialNotifications(materials);
      if (currentRole === "supervisor") renderSupervisorMaterials();
      renderWorkerMaterials();
    });
  };
  listenForLeaves = function() {
    if (leavesUnsubscribe) leavesUnsubscribe();
    const q = window.query(window.collection(window.db, "leaves"), window.orderBy("timestamp", "desc"));
    leavesUnsubscribe = window.onSnapshot(q, (snap) => {
      leaves = [];
      snap.forEach((d) => leaves.push({ id: d.id, ...d.data() }));
      checkLeaveNotifications(leaves);
      if (currentRole === "supervisor") renderSupervisorLeaves();
      if (currentRole === "worker") renderWorkerLeaves();
      renderLeaveCalendar();
    });
  };
  var origLogin = login;
  login = function(username, role, showWelcome = true) {
    notifInitialized = false;
    prevTasksSnapshot = null;
    prevMaterialsSnapshot = null;
    prevLeavesSnapshot = null;
    appNotifications = [];
    origLogin(username, role, showWelcome);
    setTimeout(() => {
      notifInitialized = true;
    }, 3e3);
  };
})();
