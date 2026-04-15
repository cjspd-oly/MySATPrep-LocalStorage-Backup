// ======================================================
// CONFIG
// ======================================================

const MAX_BACKUPS = 5;

const ALLOWED_HOSTS = [
  "practicesat.vercel.app",
  "mysatprep.fun"
];

// ======================================================
// DOM ELEMENTS
// ======================================================

const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const restoreBtn = document.getElementById("restoreBtn");
const backupList = document.getElementById("backupList");

// ======================================================
// NAVIGATION (OPEN LINKS)
// ======================================================

document.querySelectorAll("[data-url]").forEach(el => {
  el.addEventListener("click", () => {
    chrome.tabs.create({ url: el.dataset.url });
  });
});

// ======================================================
// TOAST SYSTEM
// ======================================================

let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;

  toast.classList.remove("hide", "show");
  void toast.offsetWidth;

  toast.classList.add("show");

  if (toastTimer) clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hide");
  }, 2000);
}

// ======================================================
// UTILITIES
// ======================================================

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab?.url) throw new Error("No active tab");
  return tab;
}

function isAllowed(url) {
  try {
    const hostname = new URL(url).hostname;
    return ALLOWED_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

function getTimestamp() {
  const now = new Date();
  const pad = n => n.toString().padStart(2, "0");

  return (
    now.getFullYear() + "-" +
    pad(now.getMonth() + 1) + "-" +
    pad(now.getDate()) + "_" +
    pad(now.getHours()) + "-" +
    pad(now.getMinutes()) + "-" +
    pad(now.getSeconds())
  );
}

// ======================================================
// STORAGE (BACKUPS)
// ======================================================

async function getBackups() {
  const { backups = [] } = await chrome.storage.local.get("backups");
  return backups;
}

async function saveBackup(data) {
  const backups = await getBackups();

  backups.unshift({
    timestamp: Date.now(),
    data
  });

  if (backups.length > MAX_BACKUPS) backups.pop();

  await chrome.storage.local.set({ backups });
}

async function loadBackups() {
  const backups = await getBackups();

  backupList.innerHTML = backups
    .map((b, i) =>
      `<option value="${i}">${new Date(b.timestamp).toLocaleString()}</option>`
    )
    .join("");
}

// ======================================================
// PAGE SCRIPT EXECUTION
// ======================================================

async function executeOnPage(tabId, func, args = []) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args
  });

  return result?.[0]?.result;
}

function getLocalStorageFromPage() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    data[key] = localStorage.getItem(key);
  }
  return data;
}

function setLocalStorageOnPage(payload) {
  localStorage.clear();
  for (const key in payload) {
    localStorage.setItem(key, payload[key]);
  }
}

// ======================================================
// EXPORT
// ======================================================

exportBtn.onclick = async () => {
  try {
    const tab = await getActiveTab();

    if (!isAllowed(tab.url)) {
      showToast("Open SAT site first");
      return;
    }

    const data = await executeOnPage(tab.id, getLocalStorageFromPage);

    if (!data || typeof data !== "object") {
      throw new Error("Failed to read localStorage");
    }

    await saveBackup(data);

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url,
      filename: `practicesat-backup-${getTimestamp()}.json`
    });

    URL.revokeObjectURL(url);

    await loadBackups();
    showToast("Export successful");

  } catch (err) {
    console.error(err);
    showToast("Export failed: " + err.message);
  }
};

// ======================================================
// IMPORT
// ======================================================

importBtn.onclick = () => {
  const input = document.createElement("input");
  input.type = "file";

  input.onchange = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) throw new Error("No file selected");

      const text = await file.text();
      const data = JSON.parse(text);

      if (typeof data !== "object") {
        throw new Error("Invalid backup file");
      }

      const tab = await getActiveTab();

      await executeOnPage(tab.id, setLocalStorageOnPage, [data]);

      await saveBackup(data);
      await loadBackups();

      showToast("Import successful");

    } catch (err) {
      console.error(err);
      showToast("Import failed: " + err.message);
    }
  };

  input.click();
};

// ======================================================
// RESTORE
// ======================================================

restoreBtn.onclick = async () => {
  try {
    const backups = await getBackups();
    const index = backupList.value;

    if (!backups[index]) {
      showToast("No backup selected");
      return;
    }

    const tab = await getActiveTab();

    await executeOnPage(
      tab.id,
      setLocalStorageOnPage,
      [backups[index].data]
    );

    showToast("Restore successful");

  } catch (err) {
    console.error(err);
    showToast("Restore failed: " + err.message);
  }
};

// ======================================================
// INIT
// ======================================================

loadBackups();