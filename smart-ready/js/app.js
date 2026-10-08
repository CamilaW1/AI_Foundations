const PHOTO_COUNT = 5;
const CONFIDENCE_THRESHOLD = 0.7;

const PHOTO_GUIDES = [
    {
        title: "Front view",
        short: "Front",
        icon: "⬆️",
        text: "Keep the whole item visible and photograph it straight from the front."
    },
    {
        title: "Left angle",
        short: "Left",
        icon: "↖️",
        text: "Turn the item about 45° to the left. Keep the whole object in frame."
    },
    {
        title: "Right angle",
        short: "Right",
        icon: "↗️",
        text: "Now turn it about 45° to the right so AI sees another side."
    },
    {
        title: "Top / close view",
        short: "Top",
        icon: "🔎",
        text: "Move a little closer or photograph from slightly above. Avoid cutting off the item."
    },
    {
        title: "New background",
        short: "Background",
        icon: "🌈",
        text: "Change the background or distance. This helps AI learn the item, not the scene."
    }
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
    hintPart: 0,
    code: "// Your confidence check will appear here",
    lastResult: null,
    testCount: 0
};

const workspace = document.getElementById("workspace");
const aliText = document.getElementById("aliText");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const progressPct = document.getElementById("progressPct");
const modalBack = document.getElementById("modalBack");
const modalType = document.getElementById("modalType");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const captureCanvas = document.getElementById("captureCanvas");

const bagOptions = [
    ["school", "School Bag", "🎒", "Notebook, bottle, pencil case"],
    ["work", "Work Bag", "💼", "Laptop, charger, headphones"],
    ["gym", "Gym Bag", "🏋️", "Shoes, towel, water bottle"],
    ["travel", "Travel Bag", "🧳", "Passport, charger, headphones"],
    ["family", "Family Bag", "👨‍👩‍👧", "Snacks, wipes, extra clothes"],
    ["custom", "Custom", "✨", "Choose your own items"]
];

const suggested = {
    school: ["Notebook", "Water Bottle", "Pencil Case"],
    work: ["Laptop", "Charger", "Headphones"],
    gym: ["Gym Shoes", "Towel", "Water Bottle"],
    travel: ["Passport", "Charger", "Headphones"],
    family: ["Snacks", "Wipes", "Extra Clothes"],
    custom: []
};

const explanations = [
    null,
    "First we define a useful goal. The detector needs to know what kind of bag it is helping you prepare.",
    "Each item is a class. A class is one category the model learns to recognize, such as Laptop or Water Bottle.",
    "AI learns from examples. Five deliberately different views help it learn the object instead of memorizing one exact picture.",
    "MobileNet turns each photo into visual features. A KNN classifier then compares a new photo with the examples you collected.",
    "A prediction is the model’s best guess. Confidence tells us how strongly a new image matches one of the learned classes.",
    "A confidence threshold prevents the app from acting certain when the model is unsure."
];

function setAli(text) {
    aliText.textContent = text;
}

function updateProgress() {
    const percent = state.step === 6 ? 90 : Math.round((state.step / 6) * 100);
    progressBar.style.width = `${percent}%`;
    progressText.textContent = state.step === 6 ? "Final build step" : `Step ${state.step} of 6`;
    progressPct.textContent = `${percent}%`;
}

function nextStep() {
    stopAllCameras();
    if (state.step < 6) {
        state.step += 1;
        updateProgress();
        render();
    }
}

function stopStream(stream) {
    if (!stream) {
        return;
    }

    stream.getTracks().forEach(track => track.stop());
}

function stopAllCameras() {
    stopStream(state.cameraStream);
    stopStream(state.testCameraStream);
    state.cameraStream = null;
    state.testCameraStream = null;
}

async function startCamera(videoElement, type = "training") {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera access is not supported in this browser.");
    }

    const oldStream = type === "training" ? state.cameraStream : state.testCameraStream;
    stopStream(oldStream);

    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: false
    });

    videoElement.srcObject = stream;
    await videoElement.play();

    if (type === "training") {
        state.cameraStream = stream;
    } else {
        state.testCameraStream = stream;
    }

    return stream;
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

    return captureCanvas.toDataURL("image/jpeg", 0.86);
}

function imageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = dataUrl;
    });
}

async function fileToCompressedDataUrl(file) {
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const image = await imageFromDataUrl(dataUrl);
    const maxSide = 720;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));

    captureCanvas.width = Math.round(image.naturalWidth * scale);
    captureCanvas.height = Math.round(image.naturalHeight * scale);
    const context = captureCanvas.getContext("2d");
    context.drawImage(image, 0, 0, captureCanvas.width, captureCanvas.height);

    return captureCanvas.toDataURL("image/jpeg", 0.86);
}

async function ensureModel() {
    if (state.model && state.classifier) {
        return true;
    }

    setAli("Loading the vision model. This can take a few seconds the first time.");

    const loading = document.createElement("div");
    loading.className = "loading-row";
    loading.innerHTML = '<span class="loading-dot"></span> Loading AI model…';
    workspace.prepend(loading);

    try {
        await tf.ready();
        state.model = await mobilenet.load({ version: 2, alpha: 1.0 });
        state.classifier = knnClassifier.create();
        loading.remove();
        setAli("AI model ready. Your photos will stay in this browser session.");
        return true;
    } catch (error) {
        loading.textContent = "Could not load the AI libraries. Check your internet connection and reload.";
        setAli("The AI libraries need internet access the first time they load.");
        return false;
    }
}

function render() {
    updateProgress();

    const helpActions = document.querySelector(".help-actions");
    if (helpActions) {
        helpActions.style.display = state.step === 6 ? "none" : "flex";
    }

    if (state.step === 1) renderBag();
    if (state.step === 2) renderItems();
    if (state.step === 3) renderCollect();
    if (state.step === 4) renderTrain();
    if (state.step === 5) renderTest();
    if (state.step === 6) renderConfidence();
}

function renderBag() {
    setAli("Choose the kind of bag you want your AI to help prepare.");

    workspace.innerHTML = `
        <div class="eyebrow">Your mission</div>
        <h2 class="section-title">Build an AI that checks your bag.</h2>
        <p class="section-copy">Start with a real use case. You can change the items in the next step.</p>
        <div class="choices">
            ${bagOptions.map(option => `
                <button type="button" class="choice ${state.bagType === option[0] ? "selected" : ""}" data-bag="${option[0]}">
                    <span class="emoji">${option[2]}</span>
                    <strong>${option[1]}</strong>
                    <small>${option[3]}</small>
                </button>
            `).join("")}
        </div>
        <div class="footer-row">
            <span class="status-pill">No coding yet — define the problem.</span>
            <button id="continue" type="button" class="button" ${state.bagType ? "" : "disabled"}>Continue →</button>
        </div>
    `;

    workspace.querySelectorAll("[data-bag]").forEach(button => {
        button.addEventListener("click", () => {
            state.bagType = button.dataset.bag;
            state.items = [...suggested[state.bagType]];
            renderBag();
        });
    });

    document.getElementById("continue")?.addEventListener("click", nextStep);
}

function renderItems() {
    setAli("Choose exactly three items. Each item becomes one class your model will learn.");

    workspace.innerHTML = `
        <h2 class="section-title">Choose 3 things to recognize</h2>
        <p class="section-copy">Keep the first model simple and clear.</p>
        <div class="input-row">
            <input id="itemInput" maxlength="28" placeholder="e.g. Laptop">
            <button id="addItem" type="button" class="button secondary">Add</button>
        </div>
        <div id="items"></div>
        <div class="footer-row">
            <span id="itemStatus" class="status-pill"></span>
            <button id="continue" type="button" class="button">Continue →</button>
        </div>
    `;

    function paintItems() {
        const container = document.getElementById("items");
        container.innerHTML = state.items.map((item, index) => `
            <div class="item-row">
                <span class="item-number">${index + 1}</span>
                <span class="item-name">${escapeHtml(item)}</span>
                <button type="button" class="remove-item" data-remove-item="${index}" aria-label="Remove ${escapeHtml(item)}">×</button>
            </div>
        `).join("");

        document.getElementById("itemStatus").textContent = `${state.items.length} / 3 items`;
        document.getElementById("continue").disabled = state.items.length !== 3;

        container.querySelectorAll("[data-remove-item]").forEach(button => {
            button.addEventListener("click", () => {
                state.items.splice(Number(button.dataset.removeItem), 1);
                paintItems();
            });
        });
    }

    paintItems();

    document.getElementById("addItem").addEventListener("click", () => {
        const input = document.getElementById("itemInput");
        const value = input.value.trim();

        if (value && state.items.length < 3) {
            state.items.push(value);
            input.value = "";
            paintItems();
        }
    });

    document.getElementById("continue").addEventListener("click", () => {
        state.photos = Object.fromEntries(state.items.map(item => [item, []]));
        state.selectedClassIndex = 0;
        nextStep();
    });
}

function totalPhotoCount() {
    return state.items.reduce((sum, item) => sum + (state.photos[item]?.length || 0), 0);
}

function allPhotosReady() {
    return state.items.every(item => (state.photos[item]?.length || 0) >= PHOTO_COUNT);
}

function firstIncompleteIndex() {
    const index = state.items.findIndex(item => (state.photos[item]?.length || 0) < PHOTO_COUNT);
    return index === -1 ? state.items.length - 1 : index;
}

function renderCollect() {
    const selectedItem = state.items[state.selectedClassIndex] || state.items[0];
    const selectedPhotos = state.photos[selectedItem] || [];
    const guideIndex = Math.min(selectedPhotos.length, PHOTO_COUNT - 1);
    const guide = PHOTO_GUIDES[guideIndex];

    setAli("Take 5 different views of each item. The guide changes after every photo so your dataset is more useful.");

    workspace.innerHTML = `
        <h2 class="section-title">Collect training examples</h2>
        <p class="section-copy">Take five guided photos for each item. You will see every photo in your dataset before training.</p>

        <div class="class-tabs">
            ${state.items.map((item, index) => `
                <button type="button" class="class-tab ${index === state.selectedClassIndex ? "active" : ""}" data-class-index="${index}">
                    ${escapeHtml(item)} ${state.photos[item]?.length || 0}/${PHOTO_COUNT}
                </button>
            `).join("")}
        </div>

        <div class="camera-stage">
            <div class="camera-wrap">
                <video id="trainingVideo" playsinline muted class="hidden"></video>
                <div id="cameraPlaceholder" class="camera-placeholder">
                    <div>
                        <span class="camera-emoji">📷</span>
                        <strong>Camera is off</strong>
                        <div style="margin-top:6px;color:#c8d0df">Start it once, then capture all 5 views.</div>
                    </div>
                </div>
            </div>

            <div class="pose-card">
                <div class="pose-icon">${guide.icon}</div>
                <div>
                    <strong>Photo ${selectedPhotos.length + 1 > PHOTO_COUNT ? PHOTO_COUNT : selectedPhotos.length + 1} of ${PHOTO_COUNT}: ${guide.title}</strong>
                    <span>${guide.text}</span>
                </div>
            </div>

            <div class="camera-actions">
                <button id="startCamera" type="button" class="button secondary">Start camera</button>
                <button id="capturePhoto" type="button" class="button teal" disabled>Capture ${Math.min(selectedPhotos.length + 1, PHOTO_COUNT)}/${PHOTO_COUNT}</button>
            </div>
        </div>

        <input id="uploadPhotos" type="file" accept="image/*" multiple class="hidden">
        <button id="uploadButton" type="button" class="button secondary" style="width:100%;margin-top:10px">Upload photos instead</button>

        <div class="dataset-card">
            <h3>${escapeHtml(selectedItem)} — your 5 views</h3>
            <div class="photo-grid" id="photoGrid"></div>
            <div class="pose-strip">
                ${PHOTO_GUIDES.map((photoGuide, index) => `
                    <div class="pose-mini ${index === selectedPhotos.length && selectedPhotos.length < PHOTO_COUNT ? "current" : ""}">${photoGuide.icon}<br>${photoGuide.short}</div>
                `).join("")}
            </div>
        </div>

        <div class="dataset-card">
            <h3>Dataset progress</h3>
            ${state.items.map(item => {
                const count = state.photos[item]?.length || 0;
                return `
                    <div class="dataset-row">
                        <div>
                            <strong>${escapeHtml(item)}</strong>
                            <div class="dataset-bar"><span style="width:${(count / PHOTO_COUNT) * 100}%"></span></div>
                        </div>
                        <strong>${count}/${PHOTO_COUNT}</strong>
                    </div>
                `;
            }).join("")}
        </div>

        <div class="footer-row">
            <span id="datasetStatus" class="status-pill">${allPhotosReady() ? "Dataset ready ✓" : `${totalPhotoCount()} / ${state.items.length * PHOTO_COUNT} photos`}</span>
            <button id="continue" type="button" class="button" ${allPhotosReady() ? "" : "disabled"}>Continue →</button>
        </div>
    `;

    paintPhotoGrid();

    workspace.querySelectorAll("[data-class-index]").forEach(button => {
        button.addEventListener("click", () => {
            state.selectedClassIndex = Number(button.dataset.classIndex);
            renderCollect();
        });
    });

    document.getElementById("startCamera").addEventListener("click", async () => {
        const button = document.getElementById("startCamera");
        const video = document.getElementById("trainingVideo");
        const placeholder = document.getElementById("cameraPlaceholder");
        const captureButton = document.getElementById("capturePhoto");

        button.disabled = true;
        button.textContent = "Starting…";

        try {
            await startCamera(video, "training");
            video.classList.remove("hidden");
            placeholder.classList.add("hidden");
            captureButton.disabled = (state.photos[selectedItem]?.length || 0) >= PHOTO_COUNT;
            button.textContent = "Camera on ✓";
        } catch (error) {
            button.disabled = false;
            button.textContent = "Try camera again";
            setAli("Camera access did not start. You can allow camera permission or use Upload photos instead.");
        }
    });

    document.getElementById("capturePhoto").addEventListener("click", () => {
        const video = document.getElementById("trainingVideo");
        const photos = state.photos[selectedItem];

        if (!video.srcObject || photos.length >= PHOTO_COUNT) {
            return;
        }

        photos.push(captureFrame(video));

        if (photos.length >= PHOTO_COUNT && !allPhotosReady()) {
            state.selectedClassIndex = firstIncompleteIndex();
            setAli(`${selectedItem} complete ✓. Now capture 5 guided views of ${state.items[state.selectedClassIndex]}.`);
        }

        renderCollect();
    });

    document.getElementById("uploadButton").addEventListener("click", () => {
        document.getElementById("uploadPhotos").click();
    });

    document.getElementById("uploadPhotos").addEventListener("change", async event => {
        const files = Array.from(event.target.files || []);
        const photos = state.photos[selectedItem];
        const freeSlots = PHOTO_COUNT - photos.length;

        for (const file of files.slice(0, freeSlots)) {
            photos.push(await fileToCompressedDataUrl(file));
        }

        if (photos.length >= PHOTO_COUNT && !allPhotosReady()) {
            state.selectedClassIndex = firstIncompleteIndex();
        }

        event.target.value = "";
        renderCollect();
    });

    document.getElementById("continue").addEventListener("click", nextStep);
}

function paintPhotoGrid() {
    const item = state.items[state.selectedClassIndex];
    const photos = state.photos[item] || [];
    const grid = document.getElementById("photoGrid");

    if (!grid) {
        return;
    }

    grid.innerHTML = PHOTO_GUIDES.map((guide, index) => {
        const photo = photos[index];

        if (!photo) {
            return `
                <div class="photo-slot empty" title="${guide.title}">
                    <span class="slot-number">${index + 1}</span>
                    <span>${guide.icon}</span>
                </div>
            `;
        }

        return `
            <div class="photo-slot" title="${guide.title}">
                <img src="${photo}" alt="${escapeHtml(item)} ${guide.title}">
                <span class="slot-number">${index + 1}</span>
                <button type="button" class="remove-photo" data-remove-photo="${index}" aria-label="Remove photo ${index + 1}">×</button>
            </div>
        `;
    }).join("");

    grid.querySelectorAll("[data-remove-photo]").forEach(button => {
        button.addEventListener("click", () => {
            const index = Number(button.dataset.removePhoto);
            state.photos[item].splice(index, 1);
            renderCollect();
        });
    });
}

async function renderTrain() {
    stopAllCameras();
    setAli("Now the app will turn your 15 photos into visual examples the classifier can compare.");

    workspace.innerHTML = `
        <div class="eyebrow">Train your model</div>
        <h2 class="section-title">Turn your photos into a detector</h2>
        <p class="section-copy">Your 15 photos will be converted into visual features and added to your classifier.</p>
        <div class="model-orb">🧠</div>
        <div id="trainRows">
            ${state.items.map((item, index) => `
                <div class="train-row">
                    <strong>${escapeHtml(item)}</strong>
                    <div class="train-track"><span id="trainBar${index}"></span></div>
                    <span id="trainPct${index}">0%</span>
                </div>
            `).join("")}
        </div>
        <div style="text-align:center;margin-top:18px">
            <button id="trainButton" type="button" class="button">Train AI</button>
        </div>
    `;

    document.getElementById("trainButton").addEventListener("click", trainModel);
}

async function trainModel() {
    const button = document.getElementById("trainButton");
    button.disabled = true;
    button.textContent = "Training…";

    const ready = await ensureModel();
    if (!ready) {
        button.disabled = false;
        button.textContent = "Try again";
        return;
    }

    state.classifier.clearAllClasses();

    for (let itemIndex = 0; itemIndex < state.items.length; itemIndex += 1) {
        const item = state.items[itemIndex];
        const photos = state.photos[item];

        for (let photoIndex = 0; photoIndex < photos.length; photoIndex += 1) {
            const image = await imageFromDataUrl(photos[photoIndex]);
            const activation = state.model.infer(image, true);
            state.classifier.addExample(activation, item);
            activation.dispose();

            const percent = Math.round(((photoIndex + 1) / photos.length) * 100);
            document.getElementById(`trainBar${itemIndex}`).style.width = `${percent}%`;
            document.getElementById(`trainPct${itemIndex}`).textContent = `${percent}%`;
            await new Promise(resolve => setTimeout(resolve, 80));
        }
    }

    state.trained = true;
    button.textContent = "Model ready ✓";
    setAli("Model ready. Next, test it with the live camera.");
    setTimeout(nextStep, 650);
}

function renderTest() {
    setAli("Start the camera and test your detector. Try one trained item and then something completely different.");

    workspace.innerHTML = `
        <h2 class="section-title">Test your detector</h2>
        <p class="section-copy">The model will compare the current camera view with the examples you trained it on.</p>

        <div class="result-card">
            <video id="testVideo" playsinline muted class="hidden"></video>
            <div id="testPlaceholder">
                <div class="big-icon">🔎</div>
            </div>
            <h2 id="prediction" style="margin:10px 0 3px">Waiting for camera</h2>
            <div id="confidence" style="color:#c4ccda">Confidence —</div>
            <div class="confidence-track"><span id="confidenceBar"></span></div>
        </div>

        <div class="camera-actions" style="padding:14px 0 0;border:0;background:transparent">
            <button id="startTestCamera" type="button" class="button secondary">Start camera</button>
            <button id="detectNow" type="button" class="button teal" disabled>Detect now</button>
        </div>

        <div class="footer-row">
            <span id="testStatus" class="status-pill">Try at least 2 test views.</span>
            <button id="continue" type="button" class="button" disabled>Continue →</button>
        </div>
    `;

    document.getElementById("startTestCamera").addEventListener("click", async () => {
        const button = document.getElementById("startTestCamera");
        const video = document.getElementById("testVideo");

        button.disabled = true;
        button.textContent = "Starting…";

        try {
            await startCamera(video, "test");
            video.classList.remove("hidden");
            document.getElementById("testPlaceholder").classList.add("hidden");
            document.getElementById("detectNow").disabled = false;
            button.textContent = "Camera on ✓";
        } catch (error) {
            button.disabled = false;
            button.textContent = "Try camera again";
            setAli("Allow camera permission to test live predictions.");
        }
    });

    document.getElementById("detectNow").addEventListener("click", detectCurrentFrame);
    document.getElementById("continue").addEventListener("click", nextStep);
}

async function detectCurrentFrame() {
    const video = document.getElementById("testVideo");

    if (!video.srcObject || !state.model || !state.classifier) {
        return;
    }

    const dataUrl = captureFrame(video);
    const image = await imageFromDataUrl(dataUrl);
    const activation = state.model.infer(image, true);
    const result = await state.classifier.predictClass(activation, state.items.length);
    activation.dispose();

    const confidence = Math.round((result.confidences[result.label] || 0) * 100);
    state.lastResult = { label: result.label, confidence };
    state.testCount += 1;

    document.getElementById("prediction").textContent = result.label;
    document.getElementById("confidence").textContent = `Confidence ${confidence}%`;
    document.getElementById("confidenceBar").style.width = `${confidence}%`;

    if (state.testCount >= 2) {
        document.getElementById("continue").disabled = false;
        document.getElementById("testStatus").textContent = "Testing complete ✓";
    }

    if (confidence < 70) {
        setAli("This is useful: the model is unsure. Next we will make the product say “Not sure” instead of trusting a weak guess.");
    }
}

function renderConfidence() {
    stopAllCameras();
    setAli("Finish the last rule. Hint builds the code through exactly two decisions; Explain tells you why the rule matters.");

    const preview = state.hintPart === 2 ? "Not sure" : (state.lastResult?.label || state.items[0]);
    const codeStatus = state.hintPart === 0 ? "No code added yet" : state.hintPart === 1 ? "First part added ✓" : "Confidence rule complete ✓";

    workspace.innerHTML = `
        <div class="eyebrow">Final mission</div>
        <h2 class="section-title">Teach the app when not to trust AI</h2>
        <p class="section-copy">If confidence is below <strong>70%</strong>, the app should show <strong>Not sure</strong>.</p>

        <div class="help-actions" style="margin:0 0 14px">
            <button id="inlineExplain" type="button" class="help-button">Explain</button>
            <button id="inlineHint" type="button" class="help-button primary-help">Hint</button>
        </div>

        <div id="inlineExplainBox" class="explain-box hidden" style="margin-bottom:14px">
            Confidence tells us how sure the model is about a prediction. A low score means the model may be guessing, so the product should not pretend to know.
        </div>
        <div id="inlineHintBox" class="hidden" style="margin-bottom:14px"></div>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px">
            <strong>Your code</strong>
            <span id="codeStatus" style="font-size:12px;color:var(--muted)">${codeStatus}</span>
        </div>
        <pre id="confidenceCode" class="code-box">${escapeHtml(state.code)}</pre>

        <div class="result-card">
            <div class="big-icon">🤔</div>
            <h2 id="confidencePreview" style="margin:8px 0 3px">${escapeHtml(preview)}</h2>
            <div style="color:#c4ccda">Example confidence 42%</div>
        </div>

        <div class="footer-row">
            <span id="confidenceStatus" class="status-pill">${state.hintPart === 2 ? "Ready to finish ✓" : "Complete the 2 Hint decisions."}</span>
            <button id="finish" type="button" class="button" ${state.hintPart === 2 ? "" : "disabled"}>Finish Build 0.1</button>
        </div>
    `;

    const explainBox = document.getElementById("inlineExplainBox");

    document.getElementById("inlineExplain").addEventListener("click", () => {
        explainBox.classList.toggle("hidden");
        document.getElementById("inlineHintBox").classList.add("hidden");
    });

    document.getElementById("inlineHint").addEventListener("click", () => {
        explainBox.classList.add("hidden");
        document.getElementById("inlineHintBox").classList.remove("hidden");
        renderInlineConfidenceHint();
    });

    document.getElementById("finish").addEventListener("click", finishBuild);
}

function renderInlineConfidenceHint() {
    const box = document.getElementById("inlineHintBox");
    if (!box) return;

    const first = state.hintPart === 0;
    const question = first ? "What should we check first?" : "What should happen when confidence is below 70%?";
    const options = first
        ? ["🎯 The confidence value", "🏷️ The object name"]
        : ["🤔 Show “Not sure”", "🏷️ Show the predicted class anyway"];

    box.innerHTML = `
        <div style="padding:15px;border:1px solid #dfe3fb;border-radius:18px;background:#f6f7ff">
            <div class="eyebrow">Hint ${first ? "1" : "2"} of 2</div>
            <h3 style="margin:7px 0 12px;font-size:19px">${question}</h3>
            ${options.map((option, index) => `<button type="button" class="hint-choice" data-inline-answer="${index}">${option}</button>`).join("")}
            <div id="inlineFeedback" class="feedback">Choose one option.</div>
        </div>
    `;

    box.querySelectorAll("[data-inline-answer]").forEach(button => {
        button.addEventListener("click", () => {
            const selected = Number(button.dataset.inlineAnswer);
            box.querySelectorAll("[data-inline-answer]").forEach(option => option.classList.remove("correct", "wrong"));

            if (selected !== 0) {
                button.classList.add("wrong");
                document.getElementById("inlineFeedback").textContent = "Try the other option.";
                return;
            }

            button.classList.add("correct");
            document.getElementById("inlineFeedback").textContent = "Correct ✓";

            if (first) {
                state.hintPart = 1;
                state.code = `if (confidence < ${CONFIDENCE_THRESHOLD.toFixed(2)})\n{`;
                document.getElementById("confidenceCode").textContent = state.code;
                document.getElementById("codeStatus").textContent = "First part added ✓";
                setTimeout(renderInlineConfidenceHint, 400);
            } else {
                state.hintPart = 2;
                state.code = `if (confidence < ${CONFIDENCE_THRESHOLD.toFixed(2)})\n{\n    result = "Not sure";\n}`;
                document.getElementById("confidenceCode").textContent = state.code;
                document.getElementById("codeStatus").textContent = "Confidence rule complete ✓";
                document.getElementById("confidencePreview").textContent = "Not sure";
                document.getElementById("confidenceStatus").textContent = "Ready to finish ✓";
                document.getElementById("finish").disabled = false;
                box.innerHTML = '<div class="status-pill" style="display:block;text-align:center">✓ Code complete. Finish Build 0.1.</div>';
            }
        });
    });
}

function finishBuild() {
    workspace.innerHTML = `
        <div style="text-align:center;padding:8px 0 5px">
            <div class="model-orb" style="background:linear-gradient(145deg,#2e9d67,#27b7aa)">✓</div>
            <div class="eyebrow">Build 0.1 complete</div>
            <h2 class="section-title" style="margin-top:7px">You built a real AI detector.</h2>
            <p class="section-copy">You created classes, collected a guided dataset, trained a vision classifier, tested predictions, read confidence, and added safe confidence logic.</p>
            <span class="status-pill">Computer Vision ✓ &nbsp; Dataset ✓ &nbsp; Prediction ✓ &nbsp; Confidence ✓</span>
        </div>
    `;

    progressBar.style.width = "100%";
    progressText.textContent = "Build complete";
    progressPct.textContent = "100%";
    setAli("Nice work. The next build can turn this detector into a smart preparation assistant.");
}

function hintData() {
    if (state.step === 1) return { question: "What should we decide first?", options: ["🎯 What the detector will help prepare", "🎨 What color the app should be"], correct: 0 };
    if (state.step === 2) return { question: "What should AI learn to recognize?", options: ["🏷️ A small set of clear item classes", "🌎 Every object in the room at once"], correct: 0 };
    if (state.step === 3) return { question: "Which dataset is more useful?", options: ["📸 Five different views and backgrounds", "🖼️ The same photo five times"], correct: 0 };
    if (state.step === 4) return { question: "What does the classifier learn from?", options: ["🧠 Your labeled photo examples", "🎲 Random guesses"], correct: 0 };
    return { question: "What tells us how sure the model is?", options: ["🎯 The confidence value", "🏷️ The object name"], correct: 0 };
}

function openModal(type) {
    modalBack.classList.add("show");
    modalBack.setAttribute("aria-hidden", "false");
    modalType.textContent = type.toUpperCase();

    if (type === "explain") {
        modalTitle.textContent = "Why are we doing this?";
        modalBody.innerHTML = `<div class="explain-box">${explanations[state.step]}</div>`;
        return;
    }

    const hint = hintData();
    modalTitle.textContent = hint.question;
    modalBody.innerHTML = `
        ${hint.options.map((option, index) => `<button type="button" class="hint-choice" data-hint-answer="${index}">${option}</button>`).join("")}
        <div id="modalFeedback" class="feedback">Choose one option.</div>
    `;

    modalBody.querySelectorAll("[data-hint-answer]").forEach(button => {
        button.addEventListener("click", () => {
            const selected = Number(button.dataset.hintAnswer);
            modalBody.querySelectorAll("[data-hint-answer]").forEach(option => option.classList.remove("correct", "wrong"));

            if (selected === hint.correct) {
                button.classList.add("correct");
                document.getElementById("modalFeedback").textContent = "Correct ✓";
                setTimeout(closeModal, 500);
            } else {
                button.classList.add("wrong");
                document.getElementById("modalFeedback").textContent = "Try the other option.";
            }
        });
    });
}

function closeModal() {
    modalBack.classList.remove("show");
    modalBack.setAttribute("aria-hidden", "true");
}

function escapeHtml(value) {
    return String(value).replace(/[&<>\"]/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;"
    })[character]);
}

document.getElementById("hintBtn").addEventListener("click", () => openModal("hint"));
document.getElementById("explainBtn").addEventListener("click", () => openModal("explain"));
document.getElementById("closeModal").addEventListener("click", closeModal);
modalBack.addEventListener("click", event => {
    if (event.target === modalBack) {
        closeModal();
    }
});

window.addEventListener("pagehide", stopAllCameras);
window.addEventListener("beforeunload", stopAllCameras);

render();
