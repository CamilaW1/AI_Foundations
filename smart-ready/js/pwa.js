let deferredInstallPrompt = null;

const installButton = document.getElementById("installAppButton");

function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;
}

function updateInstallButton() {
    if (!installButton) {
        return;
    }

    if (isStandalone()) {
        installButton.textContent = "Installed ✓";
        installButton.disabled = true;
        installButton.classList.add("installed");
        return;
    }

    installButton.textContent = "Install app";
    installButton.disabled = false;
    installButton.classList.remove("installed");
}

function showInstallGuide() {
    const existing = document.getElementById("installGuide");
    if (existing) {
        existing.remove();
    }

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const guide = document.createElement("div");
    guide.id = "installGuide";
    guide.className = "install-guide";
    guide.innerHTML = `
        <div class="install-guide-card" role="dialog" aria-modal="true" aria-labelledby="installGuideTitle">
            <button class="install-guide-close" type="button" aria-label="Close">×</button>
            <div class="install-guide-icon">📲</div>
            <h2 id="installGuideTitle">Install AI Builder</h2>
            <p>${isIos
                ? "In Safari, tap Share, then choose Add to Home Screen."
                : "Open your browser menu and choose Install app or Add to Home screen."}</p>
            <p class="install-guide-note">The installed app opens in its own window. Some AI features still need internet for the first model/library download and for live weather.</p>
        </div>
    `;

    document.body.appendChild(guide);
    guide.querySelector(".install-guide-close").addEventListener("click", () => guide.remove());
    guide.addEventListener("click", event => {
        if (event.target === guide) {
            guide.remove();
        }
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
});

if (installButton) {
    installButton.addEventListener("click", async () => {
        if (isStandalone()) {
            return;
        }

        if (!deferredInstallPrompt) {
            showInstallGuide();
            return;
        }

        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        updateInstallButton();
    });
}

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js", { scope: "./" })
            .catch(() => {});
    });
}

updateInstallButton();
