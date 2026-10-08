import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const MODEL_ID = "SmolLM2-360M-Instruct-q4f32_1-MLC";

const state = {
    step: 1,
    plan: "",
    prompt: "",
    engine: null,
    modelReady: false,
    modelLoading: false,
    aiResult: null,
    rawResponse: "",
    checklist: [],
    hintUsed: false
};

const workspace = document.getElementById("workspace");
const helpText = document.getElementById("helpText");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const progressPct = document.getElementById("progressPct");
const explainBtn = document.getElementById("explainBtn");
const hintBtn = document.getElementById("hintBtn");
const helpBox = document.getElementById("helpBox");

const explanations = {
    1: "Natural-language input is the user's real request. The model needs enough context to know what it should prepare for.",
    2: "A prompt is the instruction we send to the model. Good prompts include the user's plan plus a clear job for the model.",
    3: "This project uses a local browser model. The model is downloaded to the device and runs with WebGPU. No OpenAI API or paid token service is used.",
    4: "Structured JSON makes the answer predictable for JavaScript. The app can find event names and item names without trying to understand a paragraph.",
    5: "AI suggestions should be reviewed before the app treats them as correct. The user can remove or add items.",
    6: "Project 1 learned to see objects. Project 2 learned to decide what may be needed. Together they are the foundation of Smart Ready."
};

const hints = {
    1: "Include the activity, destination, timing, and constraints when they matter. Example: “Work, then swimming, and I only have one backpack.”",
    2: "The useful information is the user's plan — not visual details about the website.",
    3: "Load the local model first. The first download is large, but the browser can cache it for later visits.",
    4: "For an app, organized fields are easier to use than a creative paragraph.",
    5: "Keep the human in control: review, remove, add, then confirm.",
    6: "The next connection is camera verification from Project 1."
};

function setHelp(text) {
    helpText.textContent = text;
}

function setStep(step) {
    state.step = step;
    updateProgress();
    render();
}

function updateProgress() {
    const percent = state.step === 6 ? 92 : Math.round((state.step / 6) * 100);
    progressBar.style.width = `${percent}%`;
    progressText.textContent = state.step === 6 ? "Final build step" : `Step ${state.step} of 6`;
    progressPct.textContent = `${percent}%`;
}

function render() {
    helpBox.classList.add("hidden");

    if (state.step === 1) renderPlan();
    if (state.step === 2) renderPromptLesson();
    if (state.step === 3) renderLocalModel();
    if (state.step === 4) renderStructuredLesson();
    if (state.step === 5) renderReview();
    if (state.step === 6) renderFinish();
}

function renderPlan() {
    setHelp("Tell the planner what you are doing. One clear sentence is enough to start.");

    workspace.innerHTML = `
        <div class="eyebrow">Start with real context</div>
        <h2 class="section-title">What are you doing?</h2>
        <p class="section-copy">Write a real plan. The local AI will use it to suggest what you may need.</p>

        <textarea id="planInput" class="plan-input" placeholder="Example: Tomorrow I’m going to work and then swimming.">${escapeHtml(state.plan)}</textarea>

        <div class="example-row">
            <button class="example-chip" data-example="Tomorrow I’m going to work and then swimming.">Work + swimming</button>
            <button class="example-chip" data-example="I’m flying to Toronto for 3 days with only a carry-on.">3-day trip</button>
            <button class="example-chip" data-example="We’re going to the beach with the family for the afternoon.">Family beach</button>
        </div>

        <button id="usePlan" type="button" class="button" style="width:100%">Use this plan →</button>
    `;

    const input = document.getElementById("planInput");

    workspace.querySelectorAll("[data-example]").forEach(button => {
        button.addEventListener("click", () => {
            input.value = button.dataset.example;
            state.plan = input.value;
        });
    });

    document.getElementById("usePlan").addEventListener("click", () => {
        const value = input.value.trim();
        if (!value) {
            input.focus();
            return;
        }
        state.plan = value;
        setStep(2);
    });
}

function renderPromptLesson() {
    setHelp("Now decide what information belongs in the prompt. A correct choice moves you forward automatically.");

    workspace.innerHTML = `
        <div class="eyebrow">Prompt building</div>
        <h2 class="section-title">What should we give the AI?</h2>
        <p class="section-copy">We want the model to create a useful packing or preparation checklist.</p>

        <button class="lesson-choice" data-answer="correct">🎯 The user's plan and a clear instruction</button>
        <button class="lesson-choice" data-answer="wrong">🎨 The website colors and button style</button>

        <div id="feedback" class="feedback">Choose one answer.</div>
    `;

    workspace.querySelectorAll("[data-answer]").forEach(button => {
        button.addEventListener("click", () => {
            workspace.querySelectorAll("[data-answer]").forEach(item => item.classList.remove("correct", "wrong"));

            if (button.dataset.answer === "wrong") {
                button.classList.add("wrong");
                document.getElementById("feedback").textContent = "Try the other option.";
                return;
            }

            button.classList.add("correct");
            document.getElementById("feedback").textContent = "Correct ✓ Building the prompt…";
            state.prompt = buildPrompt(state.plan);
            setTimeout(() => setStep(3), 350);
        });
    });
}

function buildPrompt(plan) {
    return `Create a practical preparation checklist for this plan:

"${plan}"

Return ONLY valid JSON in this exact shape:
{
  "events": [
    {
      "name": "Event name",
      "items": ["Item 1", "Item 2"]
    }
  ]
}

Rules:
- Use short, concrete item names.
- Include only things a person may realistically need to bring or prepare.
- Group items by event when there is more than one activity.
- Do not include explanations outside the JSON.`;
}

function renderLocalModel() {
    setHelp("This is a real local LLM. It runs in your browser and does not use a paid API or OpenAI tokens.");

    workspace.innerHTML = `
        <div class="eyebrow">Real local LLM</div>
        <h2 class="section-title">Run AI on this device</h2>
        <p class="section-copy">First load the model, then ask it to create the checklist from your prompt.</p>

        <div class="prompt-box">${escapeHtml(state.prompt)}</div>

        <div class="model-card">
            <h3>Local model</h3>
            <div><strong>SmolLM2 360M Instruct</strong></div>
            <div class="model-note">Runs through WebLLM/WebGPU. No API key. No paid token billing. First load may download roughly 0.6 GB of model data and can take several minutes on mobile.</div>

            <div class="model-progress">
                <span id="modelProgress"></span>
            </div>
            <div id="modelStatus" class="model-note">${state.modelReady ? "Model ready ✓" : "Not loaded yet"}</div>

            <div class="action-stack">
                <button id="loadModel" type="button" class="button secondary" ${state.modelLoading || state.modelReady ? "disabled" : ""}>${state.modelReady ? "Local AI ready ✓" : "Load local AI"}</button>
                <button id="generate" type="button" class="button teal" ${state.modelReady ? "" : "disabled"}>Generate my checklist</button>
            </div>
        </div>

        <div id="compatibility" class="warning-box hidden"></div>
    `;

    const progress = document.getElementById("modelProgress");
    if (state.modelReady) {
        progress.style.width = "100%";
    }

    document.getElementById("loadModel").addEventListener("click", loadModel);
    document.getElementById("generate").addEventListener("click", generateChecklist);
}

async function loadModel() {
    const status = document.getElementById("modelStatus");
    const progress = document.getElementById("modelProgress");
    const loadButton = document.getElementById("loadModel");
    const compatibility = document.getElementById("compatibility");

    if (!navigator.gpu) {
        compatibility.classList.remove("hidden");
        compatibility.textContent = "WebGPU is not available in this browser. Try a current Chrome/Edge browser on a compatible device. This project will not switch to a paid cloud API automatically.";
        return;
    }

    state.modelLoading = true;
    loadButton.disabled = true;
    loadButton.textContent = "Loading…";
    status.textContent = "Starting local model…";

    try {
        state.engine = await webllm.CreateMLCEngine(MODEL_ID, {
            initProgressCallback: report => {
                status.textContent = report.text || "Loading local AI…";
                const value = Number(report.progress || 0);
                progress.style.width = `${Math.round(value * 100)}%`;
            }
        });

        state.modelReady = true;
        state.modelLoading = false;
        progress.style.width = "100%";
        status.textContent = "Model ready ✓";
        loadButton.textContent = "Local AI ready ✓";
        document.getElementById("generate").disabled = false;
        setHelp("Local AI is ready. Now generate a real checklist from your plan.");
    } catch (error) {
        state.modelLoading = false;
        loadButton.disabled = false;
        loadButton.textContent = "Try loading again";
        compatibility.classList.remove("hidden");
        compatibility.textContent = "The local model could not load on this device/browser. Nothing was sent to a paid API. Try again on a WebGPU-compatible browser.";
        status.textContent = "Model not loaded";
    }
}

async function generateChecklist() {
    if (!state.engine) {
        return;
    }

    const generateButton = document.getElementById("generate");
    const status = document.getElementById("modelStatus");

    generateButton.disabled = true;
    generateButton.textContent = "Thinking locally…";
    status.textContent = "Generating on this device…";

    try {
        const response = await state.engine.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a practical preparation assistant. Follow the requested JSON format exactly."
                },
                {
                    role: "user",
                    content: state.prompt
                }
            ],
            temperature: 0.2,
            max_tokens: 420,
            response_format: { type: "json_object" }
        });

        state.rawResponse = response.choices?.[0]?.message?.content || "";
        state.aiResult = parseModelJson(state.rawResponse);

        if (!state.aiResult || !Array.isArray(state.aiResult.events) || state.aiResult.events.length === 0) {
            throw new Error("Invalid structured response");
        }

        state.checklist = normalizeChecklist(state.aiResult);
        setStep(4);
    } catch (error) {
        status.textContent = "The local model did not return usable JSON.";
        generateButton.disabled = false;
        generateButton.textContent = "Try again";
        setHelp("The model stayed local, but its answer was not structured correctly. Try Generate again.");
    }
}

function parseModelJson(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        const firstBrace = text.indexOf("{");
        const lastBrace = text.lastIndexOf("}");

        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
            return null;
        }

        try {
            return JSON.parse(text.slice(firstBrace, lastBrace + 1));
        } catch (nestedError) {
            return null;
        }
    }
}

function normalizeChecklist(result) {
    return result.events
        .filter(event => event && event.name && Array.isArray(event.items))
        .map(event => ({
            name: String(event.name).trim(),
            items: event.items
                .map(item => String(item).trim())
                .filter(Boolean)
                .slice(0, 12)
        }))
        .filter(event => event.items.length > 0)
        .slice(0, 6);
}

function renderStructuredLesson() {
    setHelp("The local model returned structured data. Choose why this format is useful for an application.");

    workspace.innerHTML = `
        <div class="eyebrow">Structured output</div>
        <h2 class="section-title">The AI returned data, not just a paragraph</h2>
        <p class="section-copy">This is the information your JavaScript can reliably turn into interface elements.</p>

        <div class="json-box raw-response">${escapeHtml(JSON.stringify(state.aiResult, null, 2))}</div>

        <h3 style="margin:18px 0 8px">Which output is easier for the app to use?</h3>
        <button class="lesson-choice" data-answer="correct">🧩 Organized JSON with named fields</button>
        <button class="lesson-choice" data-answer="wrong">📝 One creative paragraph with changing formatting</button>

        <div id="feedback" class="feedback">Choose one answer.</div>
    `;

    workspace.querySelectorAll("[data-answer]").forEach(button => {
        button.addEventListener("click", () => {
            workspace.querySelectorAll("[data-answer]").forEach(item => item.classList.remove("correct", "wrong"));

            if (button.dataset.answer === "wrong") {
                button.classList.add("wrong");
                document.getElementById("feedback").textContent = "Try the other option.";
                return;
            }

            button.classList.add("correct");
            document.getElementById("feedback").textContent = "Correct ✓ Turning JSON into a checklist…";
            setTimeout(() => setStep(5), 350);
        });
    });
}

function renderReview() {
    setHelp("AI can be useful and still be wrong. Review the list before you trust it.");

    workspace.innerHTML = `
        <div class="eyebrow">Human review</div>
        <h2 class="section-title">Review your checklist</h2>
        <p class="section-copy">Remove anything unnecessary and add anything the AI missed.</p>

        <div id="checklist"></div>

        <div class="add-row">
            <input id="newItem" maxlength="40" placeholder="Add an item">
            <button id="addItem" type="button" class="button secondary">Add item</button>
        </div>

        <button id="confirmList" type="button" class="button" style="width:100%;margin-top:14px">Confirm my list ✓</button>
    `;

    paintChecklist();

    document.getElementById("addItem").addEventListener("click", () => {
        const input = document.getElementById("newItem");
        const value = input.value.trim();

        if (!value) {
            input.focus();
            return;
        }

        if (!state.checklist.length) {
            state.checklist.push({ name: "My plan", items: [] });
        }

        state.checklist[0].items.push(value);
        input.value = "";
        paintChecklist();
    });

    document.getElementById("confirmList").addEventListener("click", () => {
        localStorage.setItem("smartReadyProject2Checklist", JSON.stringify({
            plan: state.plan,
            events: state.checklist
        }));
        setStep(6);
    });
}

function paintChecklist() {
    const container = document.getElementById("checklist");
    if (!container) {
        return;
    }

    container.innerHTML = state.checklist.map((event, eventIndex) => `
        <section class="checklist-section">
            <h3>${escapeHtml(event.name)}</h3>
            ${event.items.map((item, itemIndex) => `
                <div class="check-row">
                    <input type="checkbox" aria-label="Mark ${escapeHtml(item)} ready">
                    <span>${escapeHtml(item)}</span>
                    <button type="button" class="remove-check" data-remove="${eventIndex}:${itemIndex}" aria-label="Remove ${escapeHtml(item)}">×</button>
                </div>
            `).join("")}
        </section>
    `).join("");

    container.querySelectorAll("[data-remove]").forEach(button => {
        button.addEventListener("click", () => {
            const [eventIndex, itemIndex] = button.dataset.remove.split(":").map(Number);
            state.checklist[eventIndex].items.splice(itemIndex, 1);
            state.checklist = state.checklist.filter(event => event.items.length > 0);
            paintChecklist();
        });
    });
}

function renderFinish() {
    setHelp("Project 2 is complete. The next step is to connect this generated checklist to the camera detector from Project 1.");

    workspace.innerHTML = `
        <div class="done-card">
            <div class="done-icon">✓</div>
            <div class="eyebrow">Project 2 complete</div>
            <h2 class="section-title" style="margin-top:8px">You built a local LLM planner.</h2>
            <p class="section-copy">You turned natural-language input into a prompt, ran a real LLM locally, requested structured JSON, converted it into UI, and added human review.</p>

            <div class="local-badges" style="justify-content:center">
                <span>Local LLM ✓</span>
                <span>Prompt ✓</span>
                <span>JSON ✓</span>
                <span>Human review ✓</span>
            </div>

            <a class="button" href="index.html" style="display:inline-block;text-decoration:none;margin-top:18px">Open Project 1 detector</a>
        </div>
    `;

    progressBar.style.width = "100%";
    progressText.textContent = "Project complete";
    progressPct.textContent = "100%";
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

explainBtn.addEventListener("click", () => {
    helpBox.textContent = explanations[state.step];
    helpBox.classList.remove("hidden");
});

hintBtn.addEventListener("click", () => {
    helpBox.textContent = hints[state.step];
    helpBox.classList.remove("hidden");
});

updateProgress();
render();
