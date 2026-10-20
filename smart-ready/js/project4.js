import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const MODEL_ID = "SmolLM2-360M-Instruct-q4f32_1-MLC";
const PROGRESS_KEY = "smartReadyProgress";

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
        <p class="section-copy">Choose a goal. The agent will decide whether it needs schedule data, weather data, or both.</p>

        <div class="choice-stack">
            ${GOALS.map((goal, index) => `
                <button class="big-choice" type="button" data-goal="${index}">
                    <span>${["🌅","💼","🌲"][index]}</span>
                    <div><strong>${escapeHtml(goal)}</strong><small>The next steps happen automatically.</small></div>
                </button>
            `).join("")}
        </div>

        <div class="agent-diagram">
            <span>Goal</span><b>→</b><span>Model</span><b>→</b><span>Tool</span><b>→</b><span>Observation</span><b>↺</b>
        </div>

        <div class="concept-note"><strong>Agent loop</strong> = goal → decide → use tool → observe → continue until there is a useful result.</div>
    `;

    workspace.querySelectorAll("[data-goal]").forEach(button => {
        button.addEventListener("click", () => runAgent(GOALS[Number(button.dataset.goal)]));
    });
}

async function runAgent(goal) {
    workspace.innerHTML = `
        <div class="eyebrow">Agent activity</div>
        <h2 class="section-title">${escapeHtml(goal)}</h2>
        <p class="section-copy">Watch the visible activity log. This shows tool use and results—not hidden model reasoning.</p>

        <div class="agent-log" id="agentLog">
            ${logRow("Goal received", goal, "done")}
            ${logRow("Model", "Choosing useful tools…", "working")}
        </div>

        <div class="model-progress"><span id="agentProgress" style="width:8%"></span></div>
        <div id="agentResult"></div>
    `;

    const connected = JSON.parse(localStorage.getItem("smartReadyProject3") || "null");
    const toolData = {
        calendar: connected?.context?.schedule || sampleSchedule(),
        weather: connected?.context?.weather || sampleWeather()
    };

    let tools = ["calendar", "weather"];
    let usedFallback = false;

    try {
        if (!navigator.gpu) throw new Error("No WebGPU");

        engine = await webllm.CreateMLCEngine(MODEL_ID, {
            initProgressCallback: report => {
                document.getElementById("agentProgress").style.width =
                    Math.max(8, Math.round(Number(report.progress || 0) * 45)) + "%";
            }
        });

        const choice = await engine.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You select tools for an assistant. Return only JSON: {\"tools\":[\"calendar\",\"weather\"]}. Available tools are calendar and weather."
                },
                { role: "user", content: goal }
            ],
            temperature: 0,
            max_tokens: 80,
            response_format: { type: "json_object" }
        });

        const parsed = parseJson(choice.choices?.[0]?.message?.content || "");
        const valid = (parsed?.tools || []).filter(tool => ["calendar", "weather"].includes(tool));
        if (valid.length) tools = [...new Set(valid)];
    } catch {
        usedFallback = true;
        tools = goal.toLowerCase().includes("outdoor") ? ["calendar", "weather"] : ["calendar", "weather"];
    }

    replaceWorking("Model", "Selected tools: " + tools.join(", "));
    document.getElementById("agentProgress").style.width = "52%";

    const observations = {};

    for (const tool of tools) {
        appendLog("Tool call", tool === "calendar" ? "📅 Reading schedule" : "🌦 Reading weather", "working");
        await wait(450);
        observations[tool] = toolData[tool];
        replaceLastWorking(
            tool === "calendar"
                ? scheduleSummary(toolData.calendar)
                : weatherSummary(toolData.weather)
        );
    }

    appendLog("Observation", "Tool results returned to the agent.", "done");
    document.getElementById("agentProgress").style.width = "72%";

    let answer;

    try {
        if (!engine) throw new Error("No engine");

        const response = await engine.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are Smart Ready. Use the goal and tool observations to make a short practical checklist. Return JSON: {\"summary\":\"...\",\"items\":[\"...\"]}."
                },
                {
                    role: "user",
                    content: JSON.stringify({ goal, observations })
                }
            ],
            temperature: 0.2,
            max_tokens: 260,
            response_format: { type: "json_object" }
        });

        answer = parseJson(response.choices?.[0]?.message?.content || "");
    } catch {
        answer = fallbackPlan(observations);
        usedFallback = true;
    }

    if (!answer?.items?.length) answer = fallbackPlan(observations);

    appendLog("Action", "Created the final preparation list.", "done");
    document.getElementById("agentProgress").style.width = "100%";

    markComplete();

    document.getElementById("agentResult").innerHTML = `
        <div class="result-section">
            <h3>${escapeHtml(answer.summary || "Smart Ready plan")}</h3>
            <div class="simple-list">
                ${answer.items.map(item => `<div><span>○</span>${escapeHtml(item)}</div>`).join("")}
            </div>
        </div>

        ${usedFallback ? '<div class="warning-box">The local model was unavailable or returned unusable tool data, so this run used the learning fallback. No paid cloud model was used.</div>' : ""}

        <div class="learned-card">
            <strong>This is the key idea</strong>
            <p>An agent is more than a chatbot. It has a <b>goal</b>, can choose <b>tools</b>, receives <b>observations</b>, takes <b>actions</b>, and works inside rules set by the application.</p>
        </div>

        <div class="guardrail-card">
            <strong>Guardrail</strong>
            <p>The agent can read only the tools we exposed. It cannot silently access every device or account.</p>
        </div>

        <div class="next-build-card">
            <span>Build 4 complete ✓</span>
            <strong>Next: give the agent memory and grounded document knowledge.</strong>
            <a class="button" href="project5.html">Start Build 5 →</a>
        </div>
    `;
}

function logRow(title, text, state) {
    return `<div class="agent-log-row ${state}"><span class="log-dot"></span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div></div>`;
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
    return [
        { title: "Work", date: tomorrowIso(), time: "09:00" },
        { title: "Swimming", date: tomorrowIso(), time: "17:30" }
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
    return schedule.map(event => event.time + " " + event.title).join(" · ");
}

function weatherSummary(weather) {
    return weather
        ? (weather.city || "Weather") + ": " + (weather.condition || "conditions") + ", " + (weather.temperatureC ?? "?") + "°C"
        : "No weather data";
}

function fallbackPlan(observations) {
    const items = ["Phone", "Water bottle"];

    if ((observations.calendar || []).some(event => /work/i.test(event.title))) {
        items.push("Laptop", "Charger");
    }

    if ((observations.calendar || []).some(event => /swim/i.test(event.title))) {
        items.push("Swimsuit", "Towel");
    }

    if (/rain/i.test(observations.weather?.condition || "") || Number(observations.weather?.rainChancePercent || 0) >= 50) {
        items.push("Umbrella");
    }

    return { summary: "Preparation list", items: [...new Set(items)] };
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

function markComplete() {
    const progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    progress.build4 = true;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function tomorrowIso() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
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
