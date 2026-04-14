const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const restoreBtn = document.getElementById("restoreBtn");
const backupList = document.getElementById("backupList");

const MAX_BACKUPS = 5;

// ---------- HELPERS ----------

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function saveBackup(data) {
  const { backups = [] } = await chrome.storage.local.get("backups");

  backups.unshift({
    timestamp: Date.now(),
    data
  });

  if (backups.length > MAX_BACKUPS) backups.pop();

  await chrome.storage.local.set({ backups });
}

async function getBackups() {
  const { backups = [] } = await chrome.storage.local.get("backups");
  return backups;
}

async function loadBackups() {
  const backups = await getBackups();

  backupList.innerHTML = backups
    .map(
      (b, i) =>
        `<option value="${i}">${new Date(b.timestamp).toLocaleString()}</option>`
    )
    .join("");
}

// ---------- EXPORT ----------

exportBtn.onclick = async () => {
  try {
    const tab = await getTab();

    const allowed = [
      "mysatprep.fun",
      "practicesat.vercel.app"
    ];

    if (!allowed.some(domain => tab.url.includes(domain))) {
      alert("Open mysatprep / practicesat.vercel.app site first");
      return;
    }

    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const data = {};

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          data[key] = localStorage.getItem(key);
        }

        return data;
      }
    });

    const data = result[0].result;

    if (!data) throw new Error("No data");

    await saveBackup(data);

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url,
      filename: `mysatprep-backup-${Date.now()}.json`
    });

    loadBackups();

  } catch (err) {
    console.error(err);
    alert("Export failed: " + err.message);
  }
};

// ---------- IMPORT ----------

importBtn.onclick = () => {
  const input = document.createElement("input");
  input.type = "file";

  input.onchange = async (e) => {
    try {
      const file = e.target.files[0];
      const text = await file.text();
      const data = JSON.parse(text);

      const tab = await getTab();

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [data],
        func: (payload) => {
          localStorage.clear();
          for (const key in payload) {
            localStorage.setItem(key, payload[key]);
          }
        }
      });

      await saveBackup(data);
      loadBackups();

    } catch (err) {
      console.error(err);
      alert("Import failed: " + err.message);
    }
  };

  input.click();
};

// ---------- RESTORE ----------

restoreBtn.onclick = async () => {
  try {
    const backups = await getBackups();
    const index = backupList.value;

    if (!backups[index]) {
      alert("No backup selected");
      return;
    }

    const tab = await getTab();

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [backups[index].data],
      func: (payload) => {
        localStorage.clear();
        for (const key in payload) {
          localStorage.setItem(key, payload[key]);
        }
      }
    });

  } catch (err) {
    console.error(err);
    alert("Restore failed: " + err.message);
  }
};

// INIT
loadBackups();