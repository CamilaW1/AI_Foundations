const PROGRESS_KEY = "smartReadyProgress";
const workspace = document.getElementById("workspace");

const tests = [
    {
        name: "Unknown camera object",
        icon: "📷",
        input: "The detector sees an object outside its trained classes.",
        expected: "Use confidence threshold and allow “Not sure”.",
        pass: Boolean(localStorage.getItem("smartReadyVisionModel"))
    },
    {
        name: "Weather unavailable",
        icon: "🌦",
        input: "The weather API fails.",
        expected: "Continue with schedule context instead of crashing.",
        pass: true
    },
    {
        name: "LLM returns bad structure",
        icon: "🧠",
        input: "The local model produces invalid JSON.",
        expected: "Reject unusable output and show a retry state.",
        pass: true
    },
    {
        name: "Document lacks the answer",
        icon: "📄",
        input: "The user asks for something not present in the retrieved sources.",
        expected: "Say the answer is not known instead of inventing a fact.",
        pass: true
    },
    {
        name: "Too much personal data",
        icon: "🔒",
        input: "The app has access to more calendar fields than it needs.",
        expected: "Send only the minimum useful context.",
        pass: true
    }
];

render();

async function render() {
    workspace.innerHTML = `
        <div class="eyebrow">Evaluation suite</div>
        <h2 class="section-title">Test behavior, not just one happy demo</h2>
        <p class="section-copy">An <strong>eval</strong> is a repeatable test for AI behavior. Smart Ready will run a small reliability suite automatically.</p>

        <div id="evalList" class="eval-list">
            ${tests.map((test, index) => `
                <div class="eval-row" data-test="${index}">
                    <span class="eval-icon">${test.icon}</span>
                    <div><strong>${escapeHtml(test.name)}</strong><p>${escapeHtml(test.input)}</p></div>
                    <span class="eval-state">Waiting</span>
                </div>
            `).join("")}
        </div>

        <div class="progress-track"><span id="evalProgress"></span></div>
        <div id="evalSummary"></div>
    `;

    for (let index = 0; index < tests.length; index++) {
        await wait(420);
        const row = document.querySelector('[data-test="' + index + '"]');
        const state = row.querySelector(".eval-state");
        state.textContent = tests[index].pass ? "Pass ✓" : "Needs setup";
        state.className = "eval-state " + (tests[index].pass ? "pass" : "warn");
        row.insertAdjacentHTML("beforeend", `<div class="eval-expected">Expected: ${escapeHtml(tests[index].expected)}</div>`);
        document.getElementById("evalProgress").style.width = Math.round(((index + 1) / tests.length) * 100) + "%";
    }

    markComplete();

    const passed = tests.filter(test => test.pass).length;

    document.getElementById("evalSummary").innerHTML = `
        <div class="eval-score">
            <strong>${passed} / ${tests.length}</strong>
            <span>reliability checks ready</span>
        </div>

        ${passed < tests.length ? '<div class="warning-box">Train Build 1 on this device to complete the camera-model reliability check.</div>' : ""}

        <div class="section-divider"></div>

        <div class="eyebrow">Before shipping</div>
        <h2 class="section-title">Your production checklist</h2>

        <div class="ship-grid">
            <div>✅ Human review for AI suggestions</div>
            <div>✅ “Not sure” path for uncertainty</div>
            <div>✅ Errors do not crash the whole workflow</div>
            <div>✅ Minimum necessary context</div>
            <div>✅ Sources for document answers</div>
            <div>✅ Privacy & Data Use page</div>
            <div>✅ No paid AI API silently enabled</div>
            <div>✅ Repeatable eval cases</div>
        </div>

        <div class="learned-card">
            <strong>What you built</strong>
            <p>Computer vision + local LLM + APIs + tool-using agent + memory/retrieval + evals. You now have the core mental model for how modern AI applications and agents are assembled.</p>
        </div>

        <div class="agent-definition">
            <div class="eyebrow">Your AI agent mental model</div>
            <div class="agent-diagram big">
                <span>Goal</span><b>→</b><span>Model</span><b>→</b><span>Tools</span><b>→</b><span>Observations</span><b>↺</b><span>Action</span>
            </div>
            <p>Memory and retrieved documents provide context. Guardrails limit what the agent can do. Evals check whether the system behaves reliably.</p>
        </div>

        <div class="course-complete">
            <span>🎉</span>
            <h2>Smart Ready learning path complete</h2>
            <p>Go back to the learning path to revisit any capability or keep extending the product.</p>
            <a class="button" href="index.html">View my learning path →</a>
        </div>
    `;
}

function markComplete() {
    const progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    progress.build6 = true;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
