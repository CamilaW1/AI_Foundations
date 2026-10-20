let deferredInstallPrompt = null;

const installButton = document.getElementById("installAppButton");

function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;
}

function platform() {
    const ua = navigator.userAgent.toLowerCase();

    if (/iphone|ipad|ipod/.test(ua)) return "ios";
    if (/android/.test(ua)) return "android";
    return "desktop";
}

function isNativeApp() {
    return Boolean(window.Capacitor?.isNativePlatform?.());
}

function updateInstallButton() {
    if (!installButton) return;

    if (isNativeApp()) {
        installButton.classList.add("hidden");
        return;
    }

    if (isStandalone()) {
        installButton.textContent = "Installed ✓";
        installButton.disabled = true;
        installButton.classList.add("installed");
    } else {
        installButton.textContent = "Install app";
        installButton.disabled = false;
        installButton.classList.remove("installed");
    }
}

function guideText() {
    const current = platform();

    if (current === "ios") {
        return "In Safari, tap Share, then Add to Home Screen, then Add.";
    }

    if (current === "android") {
        return "In Chrome, open the browser menu and choose Install app or Add to Home screen.";
    }

    return "Use your browser's Install icon or menu and choose Install AI Builder / Install app.";
}

function showInstallGuide() {
    document.getElementById("installGuide")?.remove();

    const guide = document.createElement("div");
    guide.id = "installGuide";
    guide.className = "install-guide";
    guide.innerHTML = `
        <div class="install-guide-card" role="dialog" aria-modal="true" aria-labelledby="installGuideTitle">
            <button class="install-guide-close" type="button" aria-label="Close">×</button>
            <div class="install-guide-icon">📲</div>
            <h2 id="installGuideTitle">Install AI Builder</h2>
            <p>${guideText()}</p>
            <p class="install-guide-note">The installed app opens in its own window. First-time model/library downloads and live weather still need internet.</p>
        </div>
    `;

    document.body.appendChild(guide);
    guide.querySelector(".install-guide-close").addEventListener("click", () => guide.remove());
    guide.addEventListener("click", event => {
        if (event.target === guide) guide.remove();
    });
}

window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButton();
});

window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    updateInstallButton();

    if (installButton) {
        installButton.textContent = "Installed ✓";
    }
});

if (installButton) {
    installButton.addEventListener("click", async () => {
        if (isStandalone()) return;

        if (!deferredInstallPrompt) {
            showInstallGuide();
            return;
        }

        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;

        if (choice.outcome !== "accepted") {
            showInstallGuide();
        }

        updateInstallButton();
    });
}

if (!isNativeApp() && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js", { scope: "./" }).catch(() => {});
    });
}

updateInstallButton();
