import * as webllm from "https://esm.run/@mlc-ai/web-llm";
import {
    parseStructuredJson,
    fallbackNextAction,
    connectedFallbackChecklist,
    applyMemoryToChecklist
} from "./core.js";

const MODEL_ID = "SmolLM2-360M-Instruct-q4f32_1-MLC";
const PROGRESS_KEY = "smartReadyProgress";
const MEMORY_KEY = "smartReadyMemory";
const CHECKLIST_KEY = "smartReadyActiveChecklist";

const workspace = document.getElementById("workspace");
let engine = null;

const GOALS = [
    "Help me get ready for tomorrow.",
    "Help me prepare for my work day.",
    "Help me get ready for an outdoor family day."
];

renderGoals();

function renderGoals() {
    workspace.innerHTML = `
        <div class="eyebrow">Give the agent a goal</div>
        <h2 class="section-title">Don't tell it which tool to use</h2>
        <p class="section-copy">Choose a goal. The model will decide one next action, observe the result, then decide again.</p>

        <div class="choice-stack">
            ${GOALS.map((goal, index) => `
                <button class="big-choice agent-goal" type="button" data-goal="${index}">
                    <span>${["🌅","💼","🌲"][index]}</span>
                    <div><strong>${escapeHtml(goal)}</strong><small>Watch the agent loop happen step by step.</small></div>
                </button>
            `).join("")}
        </div>

        <div class="agent-diagram">
            <span>Goal</span><b>→</b><span>Decide</span><b>→</b><span>Tool</span><b>→</b><span>Observe</span><b>↺</b>
        </div>

        <div class="concept-note"><strong>Agent loop</strong> = goal → decide → use a tool → observe → decide again → finish.</div>
    `;

    workspace.querySelectorAll("[data-goal]").forEach(button => {
        button.addEventListener("click", () => runAgent(GOALS[Number(button.dataset.goal)]));
    });
}

async function runAgent(goal) {
    workspace.innerHTML = `
        <div class="eyebrow">Agent activity</div>
        <h2 class="section-title">${escapeHtml(goal)}</h2>
        <p class="section-copy">This visible log shows actions, tool calls and observations. It does not expose hidden model reasoning.</p>

        <div class="agent-log" id="agentLog">
            ${logRow("Goal", goal, "done")}
            ${logRow("Agent", "Starting local model…", "working")}
        </div>

        <div class="model-progress"><span id="agentProgress" style="width:6%"></span></div>
        <div id="agentResult"></div>
    `;

    const connected = JSON.parse(localStorage.getItem("smartReadyProject3") || "null");
    const toolData = {
        calendar: connected?.context?.schedule || sampleSchedule(),
        weather: connected?.context?.forecasts?.[0] || sampleWeather()
    };

    const observations = {};
    const usedTools = [];
    let usedFallback = false;

    try {
        if (!navigator.gpu) throw new Error("No WebGPU");

        engine = await webllm.CreateMLCEngine(MODEL_ID, {
            initProgressCallback: report => {
                document.getElementById("agentProgress").style.width =
                    Math.max(6, Math.round(Number(report.progress || 0) * 34)) + "%";
            }
        });

        replaceWorking("Agent", "Local model ready. Choosing the next action…");
    } catch {
        usedFallback = true;
        replaceWorking("Agent", "Local model unavailable. Using the learning policy for tool decisions.");
    }

    for (let turn = 0; turn < 4; turn++) {
        const action = await decideNextAction(goal, observations, usedTools);

        appendLog(
            "Decision " + (turn + 1),
            action === "finish" ? "Enough information → finish" : "Use " + action + " tool",
            "done"
        );

        if (action === "finish") {
            break;
        }

        if (usedTools.includes(action)) {
            appendLog("Guardrail", "Blocked a repeated tool call.", "done");
            break;
        }

        usedTools.push(action);

        appendLog(
            "Tool call",
            action === "calendar" ? "📅 Reading schedule" : "🌦 Reading weather",
            "working"
        );

        await wait(420);

        observations[action] = toolData[action];

        replaceLastWorking(
            action === "calendar"
                ? scheduleSummary(toolData.calendar)
                : weatherSummary(toolData.weather)
        );

        appendLog("Observation", "The tool result is now available to the model.", "done");

        document.getElementById("agentProgress").style.width =
            Math.min(78, 40 + usedTools.length * 18) + "%";
    }

    appendLog("Agent", "Creating the final result from the observations…", "working");

    let finalChecklist;

    try {
        if (!engine) throw new Error("No engine");

        const response = await engine.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are Smart Ready. Build a short practical checklist using only the goal and tool observations. Return JSON only: {\"events\":[{\"name\":\"...\",\"items\":[\"...\"]}]}."
                },
                {
                    role: "user",
                    content: JSON.stringify({
                        goal,
                        observations,
                        memory: JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]")
                    })
                }
            ],
            temperature: 0.2,
            max_tokens: 300
        });

        const parsed = parseStructuredJson(response.choices?.[0]?.message?.content || "");

        if (!parsed?.events?.length) {
            throw new Error("Bad final output");
        }

        finalChecklist = parsed.events.map(event => ({
            name: String(event.name || "Plan"),
            items: Array.isArray(event.items) ? event.items.map(String) : []
        }));
    } catch {
        usedFallback = true;

        finalChecklist = connectedFallbackChecklist(
            observations.calendar || toolData.calendar,
            observations.weather || null
        ).events;
    }

    const memory = JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]");
    finalChecklist = applyMemoryToChecklist(finalChecklist, memory);

    replaceLastWorking("Final preparation list created.");
    document.getElementById("agentProgress").style.width = "100%";

    saveChecklist(goal, finalChecklist, usedTools);
    markComplete();

    document.getElementById("agentResult").innerHTML = `
        <div class="result-section agent-result-card">
            <div class="eyebrow">Agent result</div>
            ${finalChecklist.map(event => `
                <section class="checklist-section">
                    <h3>${escapeHtml(event.name)}</h3>
                    ${(event.memoryNotes || []).map(note => `<div class="memory-note">🧩 ${escapeHtml(note)}</div>`).join("")}
                    ${event.items.map(item => `<div class="check-row"><span>○</span><span>${escapeHtml(item)}</span></div>`).join("")}
                </section>
            `).join("")}
        </div>

        ${usedFallback ? '<div class="warning-box"><strong>Free local fallback used.</strong> The lesson stayed local and did not switch to a paid cloud model.</div>' : ""}

        <div class="agent-compare">
            <div>
                <span>Build 3</span>
                <strong>Connected app</strong>
                <p>Application code already knew which data to fetch.</p>
            </div>
            <div>
                <span>Build 4</span>
                <strong>Agent loop</strong>
                <p>The model/policy chose one next action after each observation.</p>
            </div>
        </div>

        <div class="learned-card">
            <strong>Core agent idea</strong>
            <p>An AI agent combines a <b>goal</b>, a <b>model</b>, allowed <b>tools</b>, returned <b>observations</b>, repeated decisions, and <b>guardrails</b> that limit what it can do.</p>
        </div>

        <div class="guardrail-card">
            <strong>Guardrail</strong>
            <p>This agent can use only Calendar and Weather because those are the only tools the app exposed. It cannot silently access arbitrary accounts or device data.</p>
        </div>

        <div class="next-build-card">
            <span>Build 4 complete ✓</span>
            <strong>Next: make the agent remember useful preferences and retrieve document knowledge.</strong>
            <a class="button" href="project5.html">Start Build 5 →</a>
        </div>
    `;
}

async function decideNextAction(goal, observations, usedTools) {
    if (engine) {
        try {
            const response = await engine.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content:
                            "Choose exactly one next action for an agent. Available actions: calendar, weather, finish. " +
                            "Do not repeat a tool already used. Return JSON only: {\"action\":\"calendar|weather|finish\"}."
                    },
                    {
                        role: "user",
                        content: JSON.stringify({ goal, observations, usedTools })
                    }
                ],
                temperature: 0,
                max_tokens: 80
            });

            const parsed = parseStructuredJson(response.choices?.[0]?.message?.content || "");
            const action = parsed?.action;

            if (["calendar", "weather", "finish"].includes(action) && !usedTools.includes(action)) {
                return action;
            }

            if (action === "finish") {
                return "finish";
            }
        } catch {}
    }

    return fallbackNextAction(goal, observations, usedTools);
}

function saveChecklist(goal, events, tools) {
    const payload = {
        source: "build4",
        goal,
        tools,
        events: events.map(event => ({
            name: event.name,
            items: event.items.map(name => ({ name, ready: false })),
            memoryNotes: event.memoryNotes || []
        }))
    };

    localStorage.setItem("smartReadyProject4", JSON.stringify(payload));
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(payload));
}

function logRow(title, text, state) {
    return `
        <div class="agent-log-row ${state}">
            <span class="log-dot"></span>
            <div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>
        </div>
    `;
}

function appendLog(title, text, state) {
    document.getElementById("agentLog").insertAdjacentHTML("beforeend", logRow(title, text, state));
}

function replaceWorking(title, text) {
    const rows = [...document.querySelectorAll(".agent-log-row.working")];
    const row = rows[rows.length - 1];

    if (!row) return;

    row.classList.remove("working");
    row.classList.add("done");
    row.querySelector("strong").textContent = title;
    row.querySelector("p").textContent = text;
}

function replaceLastWorking(text) {
    const rows = [...document.querySelectorAll(".agent-log-row.working")];
    const row = rows[rows.length - 1];

    if (!row) return;

    row.classList.remove("working");
    row.classList.add("done");
    row.querySelector("p").textContent = text;
}

function sampleSchedule() {
    const date = tomorrowIso();

    return [
        { title: "Work", date, time: "09:00" },
        { title: "Swimming", date, time: "17:30" }
    ];
}

function sampleWeather() {
    return {
        city: "Vancouver",
        condition: "Rain",
        temperatureC: 9,
        rainChancePercent: 70,
        windKmh: 12
    };
}

function scheduleSummary(schedule) {
    return (schedule || []).map(event => event.time + " " + event.title).join(" · ");
}

function weatherSummary(weather) {
    return weather
        ? (weather.city || "Weather") + ": " + (weather.condition || "conditions") + ", " + (weather.temperatureC ?? "?") + "°C"
        : "No weather data";
}

function markComplete() {
    const progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    progress.build4 = true;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function tomorrowIso() {
    const date = new Date();
    date.setDate(date.getDate() + 1);

    return date.getFullYear() + "-" +
        String(date.getMonth() + 1).padStart(2, "0") + "-" +
        String(date.getDate()).padStart(2, "0");
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
