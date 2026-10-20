import {
    parseStructuredJson,
    buildFallbackChecklist,
    minimizeEvents,
    applyMemoryToChecklist,
    evaluateConfidence,
    keywordRetrieve,
    hasRetrievalEvidence,
    fallbackNextAction,
    connectedFallbackChecklist
} from "./core.js";

const PROGRESS_KEY = "smartReadyProgress";
const workspace = document.getElementById("workspace");

const sourceDocument = [
    "Students should bring a packed lunch and a refillable water bottle.",
    "Bring a waterproof outer layer for the outdoor walk.",
    "The bus returns to school at 3:00 PM."
];

const tests = [
    {
        name: "Unknown object → Not sure",
        icon: "📷",
        input: "Laptop guess at 43% confidence with a 70% threshold.",
        expected: "Final decision is “Not sure”.",
        run() {
            const result = evaluateConfidence("Laptop", 0.43, 0.70);

            return {
                pass: result.label === "Not sure" && result.accepted === false,
                actual: result.label + " · " + Math.round(result.confidence * 100) + "%"
            };
        }
    },
    {
        name: "Bad LLM JSON → fallback",
        icon: "🧠",
        input: "The local model returns text that is not JSON.",
        expected: "Parser rejects it and the local fallback still produces a checklist.",
        run() {
            const parsed = parseStructuredJson("Here is your answer without JSON");
            const fallback = buildFallbackChecklist("Work and swimming tomorrow");

            return {
                pass: parsed === null && fallback.events.length >= 2,
                actual: parsed === null
                    ? "Invalid JSON rejected · fallback created " + fallback.events.length + " events"
                    : "Invalid JSON was incorrectly accepted"
            };
        }
    },
    {
        name: "Weather API unavailable",
        icon: "🌦",
        input: "The assistant has a schedule but weather is null.",
        expected: "Planning continues without crashing.",
        run() {
            const result = connectedFallbackChecklist(
                [{ title: "Work", date: "2026-10-20", time: "09:00" }],
                null
            );

            return {
                pass: result.events?.[0]?.items?.length > 0,
                actual: result.events?.[0]?.items?.join(", ") || "No checklist"
            };
        }
    },
    {
        name: "Minimum necessary calendar data",
        icon: "🔒",
        input: "Calendar event also contains email, attendees, notes and internal IDs.",
        expected: "Only title, date and time are passed into AI context.",
        run() {
            const minimized = minimizeEvents([{
                title: "Dentist",
                date: "2026-10-20",
                time: "14:00",
                email: "person@example.com",
                attendees: ["a@example.com"],
                notes: "private note",
                internalId: "secret-123"
            }]);

            const keys = Object.keys(minimized[0]).sort();

            return {
                pass: JSON.stringify(keys) === JSON.stringify(["date", "time", "title"]),
                actual: "Fields sent: " + keys.join(", ")
            };
        }
    },
    {
        name: "Document has no supporting evidence",
        icon: "📄",
        input: "Question: “What is the parking fee?”",
        expected: "Retrieval reports no evidence instead of forcing an answer.",
        run() {
            const matches = keywordRetrieve(sourceDocument, "What is the parking fee?", 3);
            const evidence = hasRetrievalEvidence(matches);

            return {
                pass: evidence === false,
                actual: evidence ? "Evidence incorrectly detected" : "No evidence found ✓"
            };
        }
    },
    {
        name: "Memory changes the product",
        icon: "🧩",
        input: "Memory: “I keep a charger at work.”",
        expected: "Work checklist no longer asks the user to carry a charger.",
        run() {
            const result = applyMemoryToChecklist(
                [{ name: "Work", items: ["Laptop", "Charger", "Access Card"] }],
                ["I keep a charger at work."]
            );

            const stillHasCharger = result[0].items.some(item => /charger/i.test(item));

            return {
                pass: !stillHasCharger && result[0].memoryNotes.length > 0,
                actual: result[0].items.join(", ") + " · " + (result[0].memoryNotes[0] || "No memory note")
            };
        }
    },
    {
        name: "Agent makes repeated decisions",
        icon: "🛠️",
        input: "Goal: outdoor family day.",
        expected: "Calendar → observation → Weather → observation → Finish.",
        run() {
            const goal = "Help me get ready for an outdoor family day.";
            const observations = {};
            const used = [];

            const first = fallbackNextAction(goal, observations, used);
            used.push(first);
            observations.calendar = [{ title: "Park picnic", date: "2026-10-20", time: "11:00" }];

            const second = fallbackNextAction(goal, observations, used);
            used.push(second);
            observations.weather = { condition: "Rain", temperatureC: 9 };

            const third = fallbackNextAction(goal, observations, used);

            return {
                pass: first === "calendar" && second === "weather" && third === "finish",
                actual: first + " → " + second + " → " + third
            };
        }
    }
];

render();

async function render() {
    workspace.innerHTML = `
        <div class="eyebrow">Executable eval suite</div>
        <h2 class="section-title">Make Smart Ready prove its behavior</h2>
        <p class="section-copy">These are real checks against the same shared logic used by the learning app. A green check is earned by running code—not by a pre-written <code>pass: true</code>.</p>

        <div id="evalList" class="eval-list">
            ${tests.map((test, index) => `
                <div class="eval-row" data-test="${index}">
                    <span class="eval-icon">${test.icon}</span>
                    <div>
                        <strong>${escapeHtml(test.name)}</strong>
                        <p>${escapeHtml(test.input)}</p>
                    </div>
                    <span class="eval-state">Running…</span>
                </div>
            `).join("")}
        </div>

        <div class="progress-track"><span id="evalProgress"></span></div>
        <div id="evalSummary"></div>
    `;

    const results = [];

    for (let index = 0; index < tests.length; index++) {
        await wait(330);

        let result;

        try {
            result = await tests[index].run();
        } catch (error) {
            result = {
                pass: false,
                actual: "Error: " + (error?.message || "unknown error")
            };
        }

        results.push(result);

        const row = document.querySelector('[data-test="' + index + '"]');
        const state = row.querySelector(".eval-state");

        state.textContent = result.pass ? "Pass ✓" : "Fail ✕";
        state.className = "eval-state " + (result.pass ? "pass" : "fail");

        row.insertAdjacentHTML("beforeend", `
            <div class="eval-expected"><strong>Expected:</strong> ${escapeHtml(tests[index].expected)}</div>
            <div class="eval-actual"><strong>Actual:</strong> ${escapeHtml(result.actual)}</div>
        `);

        document.getElementById("evalProgress").style.width =
            Math.round(((index + 1) / tests.length) * 100) + "%";
    }

    const passed = results.filter(result => result.pass).length;
    const allPassed = passed === tests.length;

    if (allPassed) {
        markComplete();
    }

    renderSummary(passed, allPassed);
}

function renderSummary(passed, allPassed) {
    document.getElementById("evalSummary").innerHTML = `
        <div class="eval-score ${allPassed ? "all-pass" : ""}">
            <strong>${passed} / ${tests.length}</strong>
            <span>executable reliability checks passed</span>
        </div>

        ${allPassed
            ? '<div class="success-banner">🎉 Every current core eval passed. This does not prove the whole product is perfect—but it gives you repeatable evidence for important behavior.</div>'
            : '<div class="warning-box">One or more checks failed. That is useful information: fix the behavior, then run the eval suite again.</div>'}

        <div class="section-divider"></div>

        <div class="eyebrow">Break your AI 🔥</div>
        <h2 class="section-title">Failures are part of the product</h2>
        <p class="section-copy">The strongest learning pattern in Smart Ready is now: <b>build → test → break → understand → improve → turn the failure into an eval.</b></p>

        <div class="break-grid">
            <div><span>👁️</span><strong>Vision</strong><p>Show an unknown object.</p></div>
            <div><span>🧠</span><strong>LLM</strong><p>Give a vague or unusual plan.</p></div>
            <div><span>🌐</span><strong>API</strong><p>Continue when weather is missing.</p></div>
            <div><span>🛠️</span><strong>Agent</strong><p>Give a goal that should not need every tool.</p></div>
            <div><span>📄</span><strong>RAG</strong><p>Ask for a fact absent from the document.</p></div>
            <div><span>✅</span><strong>Evals</strong><p>Make each failure repeatable.</p></div>
        </div>

        <div class="section-divider"></div>

        <div class="eyebrow">Before shipping</div>
        <h2 class="section-title">Production thinking</h2>

        <div class="ship-grid">
            <div>✅ Human review for AI suggestions</div>
            <div>✅ “Not sure” path for uncertainty</div>
            <div>✅ Local fallback for invalid model output</div>
            <div>✅ Errors do not crash the whole workflow</div>
            <div>✅ Minimum necessary context</div>
            <div>✅ Grounded document answers</div>
            <div>✅ Agent tool limits / guardrails</div>
            <div>✅ Repeatable executable evals</div>
            <div>✅ Privacy & Data Use page</div>
            <div>✅ No paid AI API silently enabled</div>
        </div>

        <div class="agent-definition">
            <div class="eyebrow">Your AI-agent mental model</div>
            <div class="agent-diagram big">
                <span>Goal</span><b>→</b><span>Model</span><b>→</b><span>Tool</span><b>→</b><span>Observation</span><b>↺</b><span>Action</span>
            </div>
            <p><b>Memory</b> personalizes behavior. <b>RAG</b> retrieves outside knowledge. <b>Guardrails</b> limit actions. <b>Evals</b> test whether the whole system behaves as intended.</p>
        </div>

        <div class="course-complete">
            <span>🚀</span>
            <h2>Smart Ready learning path complete</h2>
            <p>You built computer vision, a local LLM workflow, real-data connections, an iterative tool-using agent, memory, semantic retrieval/RAG and executable evals.</p>
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
