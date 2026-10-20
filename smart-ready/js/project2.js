import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const MODEL_ID = "SmolLM2-360M-Instruct-q4f32_1-MLC";
const PROGRESS_KEY = "smartReadyProgress";
const CHECKLIST_KEY = "smartReadyActiveChecklist";

const state = {
    step: 1,
    plan: "",
    prompt: "",
    engine: null,
    result: null,
    checklist: []
};

const workspace = document.getElementById("workspace");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const progressPct = document.getElementById("progressPct");

function markComplete() {
    const progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    progress.build2 = true;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function setStep(step) {
    state.step = step;
    const percent = Math.round((step / 4) * 100);
    progressBar.style.width = percent + "%";
    progressText.textContent = "Step " + step + " of 4";
    progressPct.textContent = percent + "%";
    render();
}

function render() {
    if (state.step === 1) renderPlan();
    if (state.step === 2) renderHowLLMWorks();
    if (state.step === 3) renderModelWork();
    if (state.step === 4) renderReview();
}

function renderPlan() {
    workspace.innerHTML = `
        <div class="eyebrow">Give AI a real goal</div>
        <h2 class="section-title">What are you doing?</h2>
        <p class="section-copy">Write one normal sentence. Smart Ready will turn it into a preparation list.</p>

        <textarea id="planInput" class="plan-input" placeholder="Tomorrow I'm going to work and then swimming.">${escapeHtml(state.plan)}</textarea>

        <div class="example-row">
            <button class="example-chip" data-example="Tomorrow I'm going to work and then swimming.">💼 Work + swimming</button>
            <button class="example-chip" data-example="I'm flying to Toronto for 3 days with only a carry-on.">✈️ 3-day trip</button>
            <button class="example-chip" data-example="We're going to the beach with the family for the afternoon.">🏖️ Family beach</button>
            <button class="example-chip" data-example="I have school in the morning and soccer practice after school.">⚽ School + soccer</button>
        </div>

        <button id="generatePlan" type="button" class="button full-button">Build my checklist →</button>

        <div class="concept-note"><strong>Prompt</strong> = the instruction and context you give an LLM.</div>
    `;

    const input = document.getElementById("planInput");

    workspace.querySelectorAll("[data-example]").forEach(button => {
        button.addEventListener("click", () => {
            state.plan = button.dataset.example;
            input.value = state.plan;
            state.prompt = buildPrompt(state.plan);
            setStep(2);
        });
    });

    document.getElementById("generatePlan").addEventListener("click", () => {
        const value = input.value.trim();
        if (!value) {
            input.focus();
            return;
        }
        state.plan = value;
        state.prompt = buildPrompt(value);
        setStep(2);
    });
}

function renderHowLLMWorks() {
    const pieces = simpleTokenView(state.plan);

    workspace.innerHTML = `
        <div class="eyebrow">What an LLM actually does</div>
        <h2 class="section-title">Text goes in as small pieces</h2>
        <p class="section-copy">This is a simplified token view. Real tokenization can split text differently, but the important idea is that an LLM works with tokens and predicts what should come next.</p>

        <div class="token-box">
            ${pieces.map(piece => `<span>${escapeHtml(piece)}</span>`).join("")}
        </div>

        <div class="flow-line">
            <span>Your text</span><b>→</b><span>tokens</span><b>→</b><span>LLM</span><b>→</b><span>next tokens</span>
        </div>

        <div class="learned-card">
            <strong>Why can an LLM sound confident and still be wrong?</strong>
            <p>It generates likely next tokens from learned patterns. It is not automatically checking a perfect database of facts.</p>
        </div>

        <div class="auto-step">Starting the local model…</div>
    `;

    setTimeout(() => setStep(3), 1800);
}

function simpleTokenView(text) {
    return text.match(/[A-Za-z0-9']+|[^\sA-Za-z0-9]/g)?.slice(0, 18) || [text];
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
- Include only realistic things a person may need to bring or prepare.
- Group items by activity when there is more than one.
- Do not include explanations outside the JSON.`;
}

async function renderModelWork() {
    workspace.innerHTML = `
        <div class="eyebrow">Local LLM</div>
        <h2 class="section-title">Smart Ready is planning on this device</h2>
        <p class="section-copy">The model is downloaded to your browser and runs locally. The first load can take several minutes on a phone.</p>

        <div class="model-card">
            <div class="model-row">
                <div class="model-orb-small">🧠</div>
                <div>
                    <strong>SmolLM2 360M Instruct</strong>
                    <p class="small-note">Free local model · no paid token billing</p>
                </div>
            </div>
            <div class="model-progress"><span id="modelProgress"></span></div>
            <div id="modelStatus" class="small-note">Checking WebGPU…</div>
        </div>

        <details class="data-details">
            <summary>See the prompt the app sends</summary>
            <pre class="prompt-box">${escapeHtml(state.prompt)}</pre>
        </details>

        <div id="modelWarning"></div>
    `;

    if (!navigator.gpu) {
        document.getElementById("modelWarning").innerHTML =
            '<div class="warning-box">This browser does not expose WebGPU, so the local LLM cannot run here. Try current Chrome/Edge on a compatible device. The app will not switch to a paid cloud model automatically.</div>';
        return;
    }

    const status = document.getElementById("modelStatus");
    const progress = document.getElementById("modelProgress");

    try {
        state.engine = await webllm.CreateMLCEngine(MODEL_ID, {
            initProgressCallback: report => {
                status.textContent = report.text || "Loading local AI…";
                progress.style.width = Math.round(Number(report.progress || 0) * 100) + "%";
            }
        });

        status.textContent = "Model ready · generating checklist…";
        progress.style.width = "100%";

        const response = await state.engine.chat.completions.create({
            messages: [
                { role: "system", content: "You are a practical preparation assistant. Follow the requested JSON format exactly." },
                { role: "user", content: state.prompt }
            ],
            temperature: 0.2,
            max_tokens: 420,
            response_format: { type: "json_object" }
        });

        const raw = response.choices?.[0]?.message?.content || "";
        state.result = parseJson(raw);

        if (!state.result?.events?.length) throw new Error("Bad JSON");

        state.checklist = normalize(state.result);
        setStep(4);
    } catch {
        status.textContent = "The local model did not return usable structured data.";
        document.getElementById("modelWarning").innerHTML =
            '<div class="warning-box">Try reloading this page and running the plan again. Nothing was sent to a paid AI API.</div>';
    }
}

function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        const first = text.indexOf("{");
        const last = text.lastIndexOf("}");
        if (first === -1 || last <= first) return null;
        try {
            return JSON.parse(text.slice(first, last + 1));
        } catch {
            return null;
        }
    }
}

function normalize(result) {
    return result.events
        .filter(event => event?.name && Array.isArray(event.items))
        .map(event => ({
            name: String(event.name).trim(),
            items: event.items.map(item => String(item).trim()).filter(Boolean).slice(0, 12)
        }))
        .filter(event => event.items.length)
        .slice(0, 6);
}

function renderReview() {
    saveChecklist();
    markComplete();

    const trained = JSON.parse(localStorage.getItem("smartReadyVisionModel") || "null");
    const known = (trained?.items || []).map(item => item.toLowerCase());

    workspace.innerHTML = `
        <div class="eyebrow">AI output → app UI</div>
        <h2 class="section-title">Your first AI-generated checklist</h2>
        <p class="section-copy">The LLM generated structured data. The app turned that data into something a person can edit and use.</p>

        <div id="checklist"></div>

        <div class="add-row">
            <input id="newItem" maxlength="40" placeholder="Add something the AI missed">
            <button id="addItem" type="button" class="button secondary">Add</button>
        </div>

        <details class="data-details">
            <summary>See what the app received (JSON)</summary>
            <pre class="json-box">${escapeHtml(JSON.stringify(state.result, null, 2))}</pre>
        </details>

        <div class="learned-card">
            <strong>You just learned</strong>
            <p><b>LLM</b> generates tokens. <b>Structured output</b> makes the result easier for software to use. <b>Human review</b> matters because AI can be confidently wrong.</p>
        </div>

        ${known.length ? `
            <div class="bridge-card">
                <strong>Build 1 is already useful here</strong>
                <p>Items that match classes from your vision model can be checked with the camera.</p>
                <a class="button secondary" href="project1.html?mode=check">Try camera check →</a>
            </div>
        ` : ""}

        <div class="next-build-card">
            <span>Build 2 complete ✓</span>
            <strong>Next: give Smart Ready real schedule and weather context.</strong>
            <a class="button" href="project3.html">Start Build 3 →</a>
        </div>
    `;

    paintChecklist(known);

    const add = () => {
        const input = document.getElementById("newItem");
        const value = input.value.trim();
        if (!value) return;
        if (!state.checklist.length) state.checklist.push({ name: "My plan", items: [] });
        state.checklist[0].items.push(value);
        input.value = "";
        saveChecklist();
        paintChecklist(known);
    };

    document.getElementById("addItem").addEventListener("click", add);
    document.getElementById("newItem").addEventListener("keydown", event => {
        if (event.key === "Enter") add();
    });
}

function paintChecklist(known) {
    const container = document.getElementById("checklist");

    container.innerHTML = state.checklist.map((event, eventIndex) => `
        <section class="checklist-section">
            <h3>${escapeHtml(event.name)}</h3>
            ${event.items.map((item, itemIndex) => {
                const lower = item.toLowerCase();
                const camera = known.some(label => lower.includes(label) || label.includes(lower));
                return `
                    <div class="check-row">
                        <span>${camera ? "📷" : "○"}</span>
                        <span>${escapeHtml(item)}</span>
                        <button type="button" class="remove-check" data-remove="${eventIndex}:${itemIndex}">×</button>
                    </div>
                `;
            }).join("")}
        </section>
    `).join("");

    container.querySelectorAll("[data-remove]").forEach(button => {
        button.addEventListener("click", () => {
            const [eventIndex, itemIndex] = button.dataset.remove.split(":").map(Number);
            state.checklist[eventIndex].items.splice(itemIndex, 1);
            state.checklist = state.checklist.filter(event => event.items.length);
            saveChecklist();
            paintChecklist(known);
        });
    });
}

function saveChecklist() {
    const payload = {
        source: "build2",
        plan: state.plan,
        events: state.checklist.map(event => ({
            name: event.name,
            items: event.items.map(name => ({ name, ready: false }))
        }))
    };

    localStorage.setItem("smartReadyProject2Checklist", JSON.stringify(payload));
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(payload));
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

setStep(1);
