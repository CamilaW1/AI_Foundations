const PHOTO_COUNT = 3;
const DEFAULT_THRESHOLD = 0.70;
const CHECKLIST_KEY = "smartReadyActiveChecklist";
const MODEL_KEY = "smartReadyVisionModel";
const PROGRESS_KEY = "smartReadyProgress";
const DRAFT_DB = "smartReadyLearning";
const DRAFT_STORE = "drafts";
const DRAFT_KEY = "build1";

const PHOTO_GUIDES = [
    { title: "Front", icon: "⬆️", text: "Show the whole object from the front." },
    { title: "Side", icon: "↗️", text: "Turn the object a little to the side." },
    { title: "New background", icon: "🌈", text: "Move it slightly or change the background." }
];

const BAG_OPTIONS = [
    ["school", "School Bag", "🎒", ["Notebook", "Water Bottle", "Pencil Case"]],
    ["work", "Work Bag", "💼", ["Laptop", "Charger", "Headphones"]],
    ["gym", "Gym Bag", "🏋️", ["Gym Shoes", "Towel", "Water Bottle"]],
    ["travel", "Travel Bag", "🧳", ["Passport", "Charger", "Headphones"]],
    ["family", "Family Bag", "👨‍👩‍👧", ["Snacks", "Wipes", "Extra Clothes"]],
    ["custom", "Custom", "✨", []]
];

const state = {
    step: 1,
    bagType: "",
    items: [],
    photos: {},
    selectedClassIndex: 0,
    model: null,
    classifier: null,
    trained: false,
    cameraStream: null,
    testCameraStream: null,
    lastResult: null,
    testCount: 0,
    threshold: DEFAULT_THRESHOLD,
    checkMode: new URLSearchParams(location.search).get("mode") === "check",
    activeChecklist: null
};

const workspace = document.getElementById("workspace");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const progressPct = document.getElementById("progressPct");
const captureCanvas = document.getElementById("captureCanvas");

function openDraftDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DRAFT_DB, 1);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(DRAFT_STORE)) {
                db.createObjectStore(DRAFT_STORE);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveDraft() {
    if (state.checkMode || state.step > 3 || !state.items.length) return;

    try {
        const db = await openDraftDb();
        const tx = db.transaction(DRAFT_STORE, "readwrite");
        tx.objectStore(DRAFT_STORE).put({
            step: state.step,
            bagType: state.bagType,
            items: state.items,
            photos: state.photos,
            selectedClassIndex: state.selectedClassIndex
        }, DRAFT_KEY);
    } catch {}
}

async function loadDraft() {
    if (state.checkMode) return;

    try {
        const db = await openDraftDb();
        const saved = await new Promise((resolve, reject) => {
            const tx = db.transaction(DRAFT_STORE, "readonly");
            const request = tx.objectStore(DRAFT_STORE).get(DRAFT_KEY);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        if (saved?.items?.length) {
            state.step = saved.step || 3;
            state.bagType = saved.bagType || "";
            state.items = saved.items || [];
            state.photos = saved.photos || {};
            state.selectedClassIndex = saved.selectedClassIndex || 0;
        }
    } catch {}
}

async function clearDraft() {
    try {
        const db = await openDraftDb();
        const tx = db.transaction(DRAFT_STORE, "readwrite");
        tx.objectStore(DRAFT_STORE).delete(DRAFT_KEY);
    } catch {}
}

function markComplete(buildNumber) {
    const progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    progress["build" + buildNumber] = true;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function updateProgress() {
    const percent = Math.round((state.step / 6) * 100);
    progressBar.style.width = percent + "%";
    progressText.textContent = "Step " + state.step + " of 6";
    progressPct.textContent = percent + "%";
}

function setStep(step) {
    stopAllCameras();
    state.step = step;
    updateProgress();
    render();
}

function stopStream(stream) {
    if (stream) stream.getTracks().forEach(track => track.stop());
}

function stopAllCameras() {
    stopStream(state.cameraStream);
    stopStream(state.testCameraStream);
    state.cameraStream = null;
    state.testCameraStream = null;
}

async function startCamera(videoElement, type = "training") {
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera is not supported.");
    }

    stopStream(type === "training" ? state.cameraStream : state.testCameraStream);

    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
    });

    videoElement.srcObject = stream;
    await videoElement.play();

    if (type === "training") state.cameraStream = stream;
    else state.testCameraStream = stream;
}

function captureFrame(videoElement) {
    const width = videoElement.videoWidth || 640;
    const height = videoElement.videoHeight || 480;
    const maxSide = 720;
    const scale = Math.min(1, maxSide / Math.max(width, height));

    captureCanvas.width = Math.round(width * scale);
    captureCanvas.height = Math.round(height * scale);

    const context = captureCanvas.getContext("2d");
    context.drawImage(videoElement, 0, 0, captureCanvas.width, captureCanvas.height);
    return captureCanvas.toDataURL("image/jpeg", 0.84);
}

function imageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = dataUrl;
    });
}

async function fileToDataUrl(file) {
    const source = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const image = await imageFromDataUrl(source);
    const maxSide = 720;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    captureCanvas.width = Math.round(image.naturalWidth * scale);
    captureCanvas.height = Math.round(image.naturalHeight * scale);
    captureCanvas.getContext("2d").drawImage(image, 0, 0, captureCanvas.width, captureCanvas.height);
    return captureCanvas.toDataURL("image/jpeg", 0.84);
}

async function ensureModel() {
    if (state.model && state.classifier) return true;

    try {
        await tf.ready();
        state.model = await mobilenet.load({ version: 2, alpha: 1.0 });
        state.classifier = knnClassifier.create();
        return true;
    } catch {
        return false;
    }
}

function serializeClassifier() {
    if (!state.classifier) return;

    const dataset = state.classifier.getClassifierDataset();
    const encoded = {};

    Object.entries(dataset).forEach(([label, tensor]) => {
        encoded[label] = {
            shape: tensor.shape,
            values: Array.from(tensor.dataSync())
        };
    });

    localStorage.setItem(MODEL_KEY, JSON.stringify({
        items: state.items,
        threshold: state.threshold,
        dataset: encoded
    }));
}

async function restoreClassifier() {
    const saved = JSON.parse(localStorage.getItem(MODEL_KEY) || "null");
    if (!saved?.dataset) return false;

    const ready = await ensureModel();
    if (!ready) return false;

    const dataset = {};
    Object.entries(saved.dataset).forEach(([label, entry]) => {
        dataset[label] = tf.tensor(entry.values, entry.shape);
    });

    state.classifier.setClassifierDataset(dataset);
    state.items = saved.items || Object.keys(saved.dataset);
    state.threshold = Number(saved.threshold || DEFAULT_THRESHOLD);
    state.trained = true;
    return true;
}

function render() {
    if (state.checkMode) {
        renderCheckMode();
        return;
    }

    if (state.step === 1) renderBag();
    if (state.step === 2) renderCustomItems();
    if (state.step === 3) renderCollect();
    if (state.step === 4) renderTrain();
    if (state.step === 5) renderTest();
    if (state.step === 6) renderThresholdLab();
}

function renderBag() {
    const readyOptions = BAG_OPTIONS.filter(option => option[0] !== "custom");

    workspace.innerHTML = `
        <div class="eyebrow">Just choose</div>
        <h2 class="section-title">What should your first vision model recognize?</h2>
        <p class="section-copy">Tap one ready-made scenario. The 3 object classes are chosen for you automatically.</p>

        <div class="time-card">
            <strong>About 3 minutes</strong>
            <span>3 objects × 3 photos = 9 training examples</span>
        </div>

        <div class="choices">
            ${readyOptions.map(option => `
                <button type="button" class="choice" data-bag="${option[0]}">
                    <span class="emoji">${option[2]}</span>
                    <strong>${option[1]}</strong>
                    <small>${option[3].join(" · ")}</small>
                </button>
            `).join("")}
        </div>

        <details class="optional-details">
            <summary>✨ Choose my own objects (optional)</summary>
            <div class="optional-body">
                <button id="customBag" type="button" class="button secondary full-button">Create custom model</button>
            </div>
        </details>

        <div class="concept-note"><strong>Class</strong> = one category the model learns to recognize.</div>
    `;

    workspace.querySelectorAll("[data-bag]").forEach(button => {
        button.addEventListener("click", () => {
            const option = BAG_OPTIONS.find(item => item[0] === button.dataset.bag);
            state.bagType = option[0];
            state.items = [...option[3]];
            state.photos = Object.fromEntries(state.items.map(item => [item, []]));
            state.selectedClassIndex = 0;
            saveDraft();
            setStep(3);
        });
    });

    document.getElementById("customBag").addEventListener("click", () => {
        state.bagType = "custom";
        state.items = [];
        setStep(2);
    });
}

function renderCustomItems() {
    workspace.innerHTML = `
        <div class="eyebrow">Custom model</div>
        <h2 class="section-title">Add exactly 3 objects</h2>
        <p class="section-copy">As soon as the third object is added, photo collection starts automatically.</p>

        <div class="input-row">
            <input id="itemInput" maxlength="28" placeholder="e.g. Laptop">
            <button id="addItem" type="button" class="button secondary">Add</button>
        </div>
        <div id="items"></div>
        <div class="status-pill" id="itemStatus">0 / 3 objects</div>
    `;

    const paint = () => {
        document.getElementById("items").innerHTML = state.items.map((item, index) => `
            <div class="item-row">
                <span class="item-number">${index + 1}</span>
                <span class="item-name">${escapeHtml(item)}</span>
                <button class="remove-item" data-remove="${index}" type="button">×</button>
            </div>
        `).join("");

        document.getElementById("itemStatus").textContent = state.items.length + " / 3 objects";

        workspace.querySelectorAll("[data-remove]").forEach(button => {
            button.addEventListener("click", () => {
                state.items.splice(Number(button.dataset.remove), 1);
                paint();
            });
        });
    };

    const add = () => {
        const input = document.getElementById("itemInput");
        const value = input.value.trim();
        if (!value || state.items.length >= 3) return;

        state.items.push(value);
        input.value = "";
        paint();

        if (state.items.length === 3) {
            state.photos = Object.fromEntries(state.items.map(item => [item, []]));
            state.selectedClassIndex = 0;
            saveDraft();
            setTimeout(() => setStep(3), 350);
        }
    };

    paint();
    document.getElementById("addItem").addEventListener("click", add);
    document.getElementById("itemInput").addEventListener("keydown", event => {
        if (event.key === "Enter") add();
    });
}

function totalPhotos() {
    return state.items.reduce((sum, item) => sum + (state.photos[item]?.length || 0), 0);
}

function allPhotosReady() {
    return state.items.every(item => (state.photos[item]?.length || 0) >= PHOTO_COUNT);
}

function renderCollect() {
    const item = state.items[state.selectedClassIndex];
    const photos = state.photos[item] || [];
    const guide = PHOTO_GUIDES[Math.min(photos.length, PHOTO_COUNT - 1)];

    workspace.innerHTML = `
        <div class="eyebrow">Training data</div>
        <h2 class="section-title">Teach with examples</h2>
        <p class="section-copy">These are <strong>training examples</strong>: images the model is allowed to learn from.</p>

        <div class="class-tabs">
            ${state.items.map((name, index) => `
                <button type="button" class="class-tab ${index === state.selectedClassIndex ? "active" : ""}" data-class="${index}">
                    ${escapeHtml(name)} ${state.photos[name]?.length || 0}/3
                </button>
            `).join("")}
        </div>

        <div class="camera-stage">
            <div class="camera-wrap">
                <video id="trainingVideo" playsinline muted class="hidden"></video>
                <div id="cameraPlaceholder" class="camera-placeholder">
                    <div><span class="camera-emoji">📷</span><strong>Camera is off</strong></div>
                </div>
            </div>
            <div class="pose-card">
                <div class="pose-icon">${guide.icon}</div>
                <div>
                    <strong>${escapeHtml(item)} · photo ${Math.min(photos.length + 1, 5)}/3 · ${guide.title}</strong>
                    <span>${guide.text}</span>
                </div>
            </div>
            <div class="camera-actions">
                <button id="startCamera" class="button secondary" type="button">Start camera</button>
                <button id="capturePhoto" class="button teal" type="button" disabled>Capture</button>
            </div>
        </div>

        <input id="uploadPhotos" type="file" accept="image/*" multiple class="hidden">
        <button id="uploadButton" type="button" class="button secondary full-button">Upload photos instead</button>

        <div class="dataset-card">
            <h3>Your dataset</h3>
            ${state.items.map(name => {
                const count = state.photos[name]?.length || 0;
                return `
                    <div class="dataset-row">
                        <div>
                            <strong>${escapeHtml(name)}</strong>
                            <div class="dataset-bar"><span style="width:${Math.round((count / PHOTO_COUNT) * 100)}%"></span></div>
                        </div>
                        <strong>${count}/3</strong>
                    </div>
                `;
            }).join("")}
            <div class="dataset-total">${totalPhotos()} / ${state.items.length * PHOTO_COUNT} examples · Saved on this device ✓</div>
        </div>

        <div class="photo-grid" id="photoGrid"></div>
    `;

    paintPhotoGrid();

    const video = document.getElementById("trainingVideo");
    const placeholder = document.getElementById("cameraPlaceholder");
    const capture = document.getElementById("capturePhoto");
    const start = document.getElementById("startCamera");

    if (state.cameraStream) {
        video.srcObject = state.cameraStream;
        video.classList.remove("hidden");
        placeholder.classList.add("hidden");
        capture.disabled = photos.length >= PHOTO_COUNT;
        start.disabled = true;
        start.textContent = "Camera on ✓";
        video.play().catch(() => {});
    }

    workspace.querySelectorAll("[data-class]").forEach(button => {
        button.addEventListener("click", () => {
            state.selectedClassIndex = Number(button.dataset.class);
            renderCollect();
        });
    });

    start.addEventListener("click", async () => {
        start.disabled = true;
        start.textContent = "Starting…";
        try {
            await startCamera(video, "training");
            video.classList.remove("hidden");
            placeholder.classList.add("hidden");
            capture.disabled = photos.length >= PHOTO_COUNT;
            start.textContent = "Camera on ✓";
        } catch {
            start.disabled = false;
            start.textContent = "Try camera again";
            showInlineMessage("Camera did not start. Allow permission or upload photos instead.");
        }
    });

    capture.addEventListener("click", () => {
        if (!video.srcObject || photos.length >= PHOTO_COUNT) return;
        photos.push(captureFrame(video));
        moveAfterPhoto(item);
    });

    document.getElementById("uploadButton").addEventListener("click", () => document.getElementById("uploadPhotos").click());
    document.getElementById("uploadPhotos").addEventListener("change", async event => {
        const files = Array.from(event.target.files || []).slice(0, PHOTO_COUNT - photos.length);
        for (const file of files) photos.push(await fileToDataUrl(file));
        moveAfterPhoto(item);
    });
}

function moveAfterPhoto(currentItem) {
    if (allPhotosReady()) {
        setTimeout(() => setStep(4), 300);
        return;
    }

    if ((state.photos[currentItem]?.length || 0) >= PHOTO_COUNT) {
        const nextIndex = state.items.findIndex(name => (state.photos[name]?.length || 0) < PHOTO_COUNT);
        if (nextIndex >= 0) state.selectedClassIndex = nextIndex;
    }

    saveDraft();
    renderCollect();
}

function paintPhotoGrid() {
    const item = state.items[state.selectedClassIndex];
    const photos = state.photos[item] || [];
    const grid = document.getElementById("photoGrid");
    if (!grid) return;

    grid.innerHTML = Array.from({ length: PHOTO_COUNT }, (_, index) => {
        const photo = photos[index];
        return photo
            ? `<div class="photo-slot"><img src="${photo}" alt="Training photo ${index + 1}"><button type="button" class="remove-photo" data-photo="${index}">×</button></div>`
            : `<div class="photo-slot empty">${index + 1}</div>`;
    }).join("");

    grid.querySelectorAll("[data-photo]").forEach(button => {
        button.addEventListener("click", () => {
            photos.splice(Number(button.dataset.photo), 1);
            saveDraft();
            renderCollect();
        });
    });
}

async function renderTrain() {
    stopAllCameras();

    workspace.innerHTML = `
        <div class="eyebrow">Training</div>
        <h2 class="section-title">Turn examples into a model</h2>
        <p class="section-copy">MobileNet converts each photo into visual features. KNN remembers where your three classes sit in that feature space.</p>

        <div class="model-orb">🧠</div>
        <div id="trainStatus" class="center-copy">Loading the vision model…</div>
        <div class="progress-track"><span id="trainBar" style="width:5%"></span></div>

        <div class="concept-note"><strong>Model</strong> = learned patterns that can be used on new input.</div>
    `;

    const status = document.getElementById("trainStatus");
    const bar = document.getElementById("trainBar");
    const ready = await ensureModel();

    if (!ready) {
        status.textContent = "Could not load the vision libraries. Check your internet connection and reload.";
        return;
    }

    let completed = 0;
    const total = state.items.length * PHOTO_COUNT;

    for (const item of state.items) {
        for (const dataUrl of state.photos[item]) {
            const image = await imageFromDataUrl(dataUrl);
            const activation = state.model.infer(image, true);
            state.classifier.addExample(activation, item);
            activation.dispose();

            completed += 1;
            bar.style.width = Math.round((completed / total) * 100) + "%";
            status.textContent = "Learning from example " + completed + " of " + total + "…";
            await new Promise(resolve => setTimeout(resolve, 40));
        }
    }

    state.trained = true;
    serializeClassifier();
    clearDraft();
    status.textContent = "Model ready ✓";
    setTimeout(() => setStep(5), 650);
}

function renderTest() {
    workspace.innerHTML = `
        <div class="eyebrow">Test data</div>
        <h2 class="section-title">Show it something new</h2>
        <p class="section-copy">Now use a view the model did <strong>not</strong> train on. That is test data. After one normal test, try an object it has never seen.</p>

        <div class="test-tip">
            <span>1</span> Test one trained object
            <span>2</span> Then show a completely different object
        </div>

        <div class="result-card">
            <video id="testVideo" playsinline muted></video>
            <div id="prediction" class="prediction-area">Start the camera to test.</div>
        </div>

        <div class="camera-actions standalone-actions">
            <button id="startTestCamera" class="button secondary" type="button">Start camera</button>
            <button id="testNow" class="button teal" type="button" disabled>Test this view</button>
        </div>

        <div class="concept-note"><strong>Prediction</strong> = the model's best guess. <strong>Confidence</strong> = how strongly this input matches what it learned.</div>
    `;

    const video = document.getElementById("testVideo");
    const start = document.getElementById("startTestCamera");
    const test = document.getElementById("testNow");

    start.addEventListener("click", async () => {
        start.disabled = true;
        start.textContent = "Starting…";
        try {
            await startCamera(video, "test");
            test.disabled = false;
            start.textContent = "Camera on ✓";
        } catch {
            start.disabled = false;
            start.textContent = "Try camera again";
            showInlineMessage("Camera permission was not available.");
        }
    });

    test.addEventListener("click", async () => {
        const activation = state.model.infer(video, true);
        const prediction = await state.classifier.predictClass(activation);
        activation.dispose();

        state.lastResult = prediction;
        state.testCount += 1;

        const confidence = Math.round(Number(prediction.confidences[prediction.label] || 0) * 100);
        document.getElementById("prediction").innerHTML = `
            <strong>${escapeHtml(prediction.label)}</strong>
            <span>${confidence}% confidence</span>
            <small>${state.testCount === 1 ? "Now try an object the model has never seen." : "Notice: a closed-set classifier still chooses one of the classes it knows."}</small>
        `;

        if (state.testCount >= 2) {
            setTimeout(() => setStep(6), 950);
        }
    });
}

function renderThresholdLab() {
    stopAllCameras();

    const fallback = {
        label: state.items[0] || "Known class",
        confidences: { [state.items[0] || "Known class"]: 0.43 }
    };

    const result = state.lastResult || fallback;
    const confidence = Number(result.confidences[result.label] || 0.43);
    const confidencePct = Math.round(confidence * 100);

    workspace.innerHTML = `
        <div class="eyebrow">Just choose</div>
        <h2 class="section-title">When should AI say “Not sure”?</h2>
        <p class="section-copy">Choose a confidence threshold. The app changes immediately — no Confirm button.</p>

        <div class="threshold-lab">
            <div class="threshold-result">
                <span>Model guess</span>
                <strong>${escapeHtml(result.label)}</strong>
                <small>${confidencePct}% confidence</small>
            </div>

            <div class="threshold-choice-grid">
                <button type="button" class="threshold-choice" data-threshold="0.60">
                    <strong>60%</strong><small>More confident guesses allowed</small>
                </button>
                <button type="button" class="threshold-choice recommended" data-threshold="0.70">
                    <strong>70%</strong><small>Recommended for this lesson</small>
                </button>
                <button type="button" class="threshold-choice" data-threshold="0.80">
                    <strong>80%</strong><small>Say “Not sure” more often</small>
                </button>
            </div>

            <div id="finalDecision" class="decision-card"></div>
        </div>

        <pre id="thresholdCode" class="code-box"></pre>

        ${confidence >= 0.95 ? `
            <div class="warning-box"><strong>Notice:</strong> an unknown object can still get a very high score. Confidence is not the same as “probability AI is correct.”</div>
        ` : ""}

        <div class="learned-card">
            <strong>What changed?</strong>
            <p>The threshold tells the app when to trust a prediction and when to say “Not sure.” A confidence score is useful, but it is not a guarantee.</p>
        </div>

        <div id="nextBuild" class="next-build-card hidden">
            <span>Build 1 complete ✓</span>
            <strong>Next: teach Smart Ready to plan with an LLM.</strong>
            <a class="button" href="project2.html">Start Build 2 →</a>
        </div>
    `;

    const update = threshold => {
        state.threshold = Number(threshold);

        workspace.querySelectorAll("[data-threshold]").forEach(button => {
            button.classList.toggle("selected", Number(button.dataset.threshold) === state.threshold);
        });

        const uncertain = confidence < state.threshold;
        document.getElementById("finalDecision").innerHTML = uncertain
            ? `<span>Final app decision</span><strong>Not sure</strong><small>The model is below your threshold.</small>`
            : `<span>Final app decision</span><strong>${escapeHtml(result.label)}</strong><small>The model is above your threshold.</small>`;

        document.getElementById("thresholdCode").textContent =
            "if (confidence < " + state.threshold.toFixed(2) + ")\n{\n    result = \"Not sure\";\n}";

        serializeClassifier();
    };

    update(state.threshold);

    workspace.querySelectorAll("[data-threshold]").forEach(button => {
        button.addEventListener("click", () => {
            update(button.dataset.threshold);
            markComplete(1);
            document.getElementById("nextBuild").classList.remove("hidden");
        });
    });
}

async function renderCheckMode() {
    progressBar.style.width = "100%";
    progressText.textContent = "Camera check";
    progressPct.textContent = "Live";

    state.activeChecklist = JSON.parse(localStorage.getItem(CHECKLIST_KEY) || "null");
    const savedModel = JSON.parse(localStorage.getItem(MODEL_KEY) || "null");

    if (!state.activeChecklist || !savedModel) {
        workspace.innerHTML = `
            <div class="eyebrow">Camera check</div>
            <h2 class="section-title">Build 1 needs a trained model and an active checklist</h2>
            <p class="section-copy">Train your detector first, then generate a checklist in Build 2 or 3.</p>
            <a class="button" href="project1.html">Open Build 1</a>
        `;
        return;
    }

    workspace.innerHTML = `
        <div class="eyebrow">Smart Ready check</div>
        <h2 class="section-title">Use your Build 1 detector on the later checklist</h2>
        <p class="section-copy">This is the connection between your builds: the planner decides what you need, and your vision model can verify classes it was trained to recognize.</p>

        <div class="result-card">
            <video id="checkVideo" playsinline muted></video>
            <div id="checkPrediction" class="prediction-area">Loading your saved vision model…</div>
        </div>

        <div class="camera-actions standalone-actions">
            <button id="startCheckCamera" class="button secondary" type="button" disabled>Start camera</button>
            <button id="checkNow" class="button teal" type="button" disabled>Check this item</button>
        </div>

        <div id="activeChecklist"></div>
    `;

    paintActiveChecklist();

    const restored = await restoreClassifier();
    const start = document.getElementById("startCheckCamera");
    const test = document.getElementById("checkNow");

    if (!restored) {
        document.getElementById("checkPrediction").textContent = "Could not restore the saved model.";
        return;
    }

    document.getElementById("checkPrediction").textContent = "Saved model ready ✓";
    start.disabled = false;

    const video = document.getElementById("checkVideo");
    start.addEventListener("click", async () => {
        start.disabled = true;
        try {
            await startCamera(video, "test");
            start.textContent = "Camera on ✓";
            test.disabled = false;
        } catch {
            start.disabled = false;
            start.textContent = "Try camera again";
        }
    });

    test.addEventListener("click", async () => {
        const activation = state.model.infer(video, true);
        const prediction = await state.classifier.predictClass(activation);
        activation.dispose();

        const confidence = Number(prediction.confidences[prediction.label] || 0);
        const pct = Math.round(confidence * 100);
        const accepted = confidence >= state.threshold;

        document.getElementById("checkPrediction").innerHTML = accepted
            ? `<strong>${escapeHtml(prediction.label)}</strong><span>${pct}% confidence · checked ✓</span>`
            : `<strong>Not sure</strong><span>${pct}% confidence · show the item more clearly</span>`;

        if (accepted) {
            markChecklistItem(prediction.label);
        }
    });
}

function paintActiveChecklist() {
    const container = document.getElementById("activeChecklist");
    if (!container || !state.activeChecklist) return;

    const savedModel = JSON.parse(localStorage.getItem(MODEL_KEY) || "{}");
    const known = (savedModel.items || []).map(item => item.toLowerCase());

    container.innerHTML = (state.activeChecklist.events || []).map(event => `
        <section class="checklist-section">
            <h3>${escapeHtml(event.name)}</h3>
            ${(event.items || []).map(item => {
                const match = known.some(label => item.name.toLowerCase().includes(label) || label.includes(item.name.toLowerCase()));
                return `
                    <div class="check-row ${item.ready ? "ready-row" : ""}">
                        <span>${item.ready ? "✓" : match ? "📷" : "○"}</span>
                        <span>${escapeHtml(item.name)}</span>
                        <small>${item.ready ? "Ready" : match ? "Camera check" : "Manual"}</small>
                    </div>
                `;
            }).join("")}
        </section>
    `).join("");
}

function markChecklistItem(label) {
    let changed = false;
    for (const event of state.activeChecklist.events || []) {
        for (const item of event.items || []) {
            const left = item.name.toLowerCase();
            const right = label.toLowerCase();
            if (!item.ready && (left.includes(right) || right.includes(left))) {
                item.ready = true;
                changed = true;
                break;
            }
        }
        if (changed) break;
    }

    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state.activeChecklist));
    paintActiveChecklist();
}

function showInlineMessage(text) {
    const old = document.getElementById("inlineMessage");
    if (old) old.remove();

    const box = document.createElement("div");
    box.id = "inlineMessage";
    box.className = "warning-box";
    box.textContent = text;
    workspace.prepend(box);
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

loadDraft().finally(() => {
    updateProgress();
    render();
});
