import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const MODEL_ID = "SmolLM2-360M-Instruct-q4f32_1-MLC";
const PROGRESS_KEY = "smartReadyProgress";
const CHECKLIST_KEY = "smartReadyActiveChecklist";

const state = {
    step: 1,
    events: [],
    dayLabel: "",
    city: "",
    weather: null,
    context: null,
    engine: null,
    checklist: [],
    result: null
};

const workspace = document.getElementById("workspace");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const progressPct = document.getElementById("progressPct");

function setStep(step) {
    state.step = step;
    const percent = Math.round((step / 4) * 100);
    progressBar.style.width = percent + "%";
    progressText.textContent = "Step " + step + " of 4";
    progressPct.textContent = percent + "%";
    render();
}

function markComplete() {
    const progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    progress.build3 = true;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function render() {
    if (state.step === 1) renderSchedule();
    if (state.step === 2) renderWeather();
    if (state.step === 3) renderContext();
    if (state.step === 4) renderPlanner();
}

function renderSchedule() {
    workspace.innerHTML = `
        <div class="eyebrow">Tool 1 · Schedule</div>
        <h2 class="section-title">Give the assistant a real day</h2>
        <p class="section-copy">Start instantly with a sample, import an <code>.ics</code> calendar file, or enter an event yourself.</p>

        <div class="choice-stack">
            <button id="sampleDay" class="big-choice" type="button">
                <span>⚡</span>
                <div><strong>Try a sample day</strong><small>Fastest way to see how connected AI works.</small></div>
            </button>

            <button id="importCalendar" class="big-choice" type="button">
                <span>📅</span>
                <div><strong>Import my calendar</strong><small>The .ics file is parsed locally in this browser.</small></div>
            </button>

            <button id="manualMode" class="big-choice" type="button">
                <span>✍️</span>
                <div><strong>Add events myself</strong><small>No calendar account connection needed.</small></div>
            </button>
        </div>

        <input id="icsFile" type="file" accept=".ics,text/calendar" class="hidden">
        <div id="manualBox" class="connect-card hidden">
            <h3>Add an event</h3>
            <div class="manual-row">
                <input id="eventDate" type="date" value="${tomorrowIso()}">
                <input id="eventTime" type="time" value="09:00">
                <input id="eventTitle" maxlength="60" placeholder="e.g. Work">
                <button id="addEvent" type="button" class="button secondary">Add</button>
            </div>
            <div id="manualEvents"></div>
            <button id="manualWeather" type="button" class="button full-button hidden">Add weather →</button>
        </div>

        <div class="privacy-box">🔒 Calendar files stay in this browser. The app does not ask for your calendar password.</div>
    `;

    document.getElementById("sampleDay").addEventListener("click", () => {
        const date = tomorrowIso();
        state.dayLabel = "Tomorrow";
        state.events = [
            { title: "Work", date, time: "09:00", displayTime: "9:00 AM" },
            { title: "Swimming", date, time: "17:30", displayTime: "5:30 PM" }
        ];
        setStep(2);
    });

    document.getElementById("importCalendar").addEventListener("click", () => {
        document.getElementById("icsFile").click();
    });

    document.getElementById("icsFile").addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file) return;

        const parsed = parseIcs(await file.text());
        const selected = chooseRelevantDay(parsed);

        if (!selected.events.length) {
            showMessage("No usable VEVENT entries were found in that file.");
            return;
        }

        state.events = selected.events;
        state.dayLabel = selected.label;
        setStep(2);
    });

    document.getElementById("manualMode").addEventListener("click", () => {
        document.getElementById("manualBox").classList.remove("hidden");
        document.getElementById("eventTitle").focus();
    });

    const addManual = () => {
        const title = document.getElementById("eventTitle").value.trim();
        const date = document.getElementById("eventDate").value;
        const time = document.getElementById("eventTime").value || "09:00";

        if (!title || !date) return;

        state.events.push({ title, date, time, displayTime: formatTime(time) });
        state.events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        document.getElementById("eventTitle").value = "";
        paintManualEvents();
    };

    document.getElementById("addEvent").addEventListener("click", addManual);
    document.getElementById("eventTitle").addEventListener("keydown", event => {
        if (event.key === "Enter") addManual();
    });
    document.getElementById("manualWeather").addEventListener("click", () => {
        state.dayLabel = state.events[0]?.date || "Selected day";
        setStep(2);
    });
}

function paintManualEvents() {
    const container = document.getElementById("manualEvents");
    const next = document.getElementById("manualWeather");

    container.innerHTML = state.events.map((event, index) => `
        <div class="event-row">
            <span class="event-time">${escapeHtml(event.displayTime)}</span>
            <strong>${escapeHtml(event.title)}</strong>
            <button class="remove-event" data-remove="${index}" type="button">×</button>
        </div>
    `).join("");

    next.classList.toggle("hidden", !state.events.length);

    container.querySelectorAll("[data-remove]").forEach(button => {
        button.addEventListener("click", () => {
            state.events.splice(Number(button.dataset.remove), 1);
            paintManualEvents();
        });
    });
}

function parseIcs(text) {
    const unfolded = text.replace(/\r?\n[ \t]/g, "");
    return unfolded.split("BEGIN:VEVENT").slice(1).map(block => {
        const body = block.split("END:VEVENT")[0] || "";
        const summary = body.match(/(?:^|\n)SUMMARY(?:;[^:]*)?:(.*)/i)?.[1]?.trim();
        const dtLine = body.match(/(?:^|\n)DTSTART([^:]*):(.*)/i);

        if (!summary || !dtLine) return null;

        const params = dtLine[1] || "";
        const raw = dtLine[2].trim();
        const timezone = params.match(/TZID=([^;:]+)/i)?.[1] || (raw.endsWith("Z") ? "UTC" : "local");
        const parsed = parseIcsDate(raw);

        if (!parsed) return null;

        return {
            title: decodeIcsText(summary),
            date: parsed.date,
            time: parsed.time,
            displayTime: formatTime(parsed.time),
            timezone
        };
    }).filter(Boolean);
}

function parseIcsDate(raw) {
    const match = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?Z?$/);
    if (!match) return null;

    return {
        date: `${match[1]}-${match[2]}-${match[3]}`,
        time: match[4] ? `${match[4]}:${match[5]}` : "09:00"
    };
}

function chooseRelevantDay(events) {
    if (!events.length) return { events: [], label: "" };

    const today = todayIso();
    const grouped = new Map();

    events.forEach(event => {
        if (!grouped.has(event.date)) grouped.set(event.date, []);
        grouped.get(event.date).push(event);
    });

    let chosenDate = grouped.has(today)
        ? today
        : [...grouped.keys()].filter(date => date >= today).sort()[0] || [...grouped.keys()].sort()[0];

    const chosenEvents = (grouped.get(chosenDate) || [])
        .sort((a, b) => a.time.localeCompare(b.time))
        .slice(0, 12);

    return {
        events: chosenEvents,
        label: chosenDate === today ? "Today" : chosenDate === tomorrowIso() ? "Tomorrow" : chosenDate
    };
}

function decodeIcsText(value) {
    return value
        .replace(/\\n/gi, " ")
        .replace(/\\,/g, ",")
        .replace(/\\;/g, ";")
        .replace(/\\\\/g, "\\")
        .trim();
}

function renderWeather() {
    const target = state.events[0];

    workspace.innerHTML = `
        <div class="eyebrow">Tool 2 · Weather</div>
        <h2 class="section-title">Match weather to the event time</h2>
        <p class="section-copy">Your first event is <strong>${escapeHtml(target.title)}</strong> on <strong>${escapeHtml(target.date)} at ${escapeHtml(target.displayTime)}</strong>. We will request forecast data for that time—not just the weather right now.</p>

        <div class="city-row">
            <input id="cityInput" maxlength="80" placeholder="City, e.g. Vancouver" value="${escapeHtml(state.city)}">
            <button id="weatherButton" type="button" class="button teal">Get forecast</button>
        </div>

        <div class="privacy-box">🌐 Only the city search and weather request go to Open-Meteo. Precise browser GPS is not requested.</div>

        <button id="skipWeather" type="button" class="text-action">Continue without weather</button>
        <div id="weatherResult"></div>
    `;

    document.getElementById("weatherButton").addEventListener("click", fetchWeatherForEvent);
    document.getElementById("cityInput").addEventListener("keydown", event => {
        if (event.key === "Enter") fetchWeatherForEvent();
    });
    document.getElementById("skipWeather").addEventListener("click", () => {
        state.weather = null;
        setStep(3);
    });
}

async function fetchWeatherForEvent() {
    const input = document.getElementById("cityInput");
    const button = document.getElementById("weatherButton");
    const city = input.value.trim();
    if (!city) return input.focus();

    state.city = city;
    button.disabled = true;
    button.textContent = "Checking forecast…";

    try {
        const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`).then(r => r.json());
        const place = geo.results?.[0];
        if (!place) throw new Error("City not found");

        const forecastUrl =
            `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
            "&hourly=temperature_2m,weather_code,precipitation_probability,precipitation,rain,snowfall,wind_speed_10m" +
            "&forecast_days=7&timezone=auto";

        const data = await fetch(forecastUrl).then(r => r.json());
        const target = state.events[0];
        const targetKey = target.date + "T" + target.time.slice(0, 2) + ":00";
        const times = data.hourly?.time || [];

        let index = times.indexOf(targetKey);
        if (index < 0) {
            index = nearestTimeIndex(times, target.date + "T" + target.time);
        }

        if (index < 0) throw new Error("Forecast not available");

        state.weather = {
            city: place.name,
            region: place.admin1 || place.country || "",
            date: target.date,
            time: times[index]?.slice(11, 16) || target.time,
            temperature: data.hourly.temperature_2m[index],
            code: data.hourly.weather_code[index],
            precipitationProbability: data.hourly.precipitation_probability[index],
            precipitation: data.hourly.precipitation[index],
            wind: data.hourly.wind_speed_10m[index]
        };

        document.getElementById("weatherResult").innerHTML = `
            <div class="weather-card">
                <div class="weather-main">
                    <div class="weather-icon">${weatherIcon(state.weather.code)}</div>
                    <div>
                        <h3>${escapeHtml(state.weather.city)}</h3>
                        <p>${weatherLabel(state.weather.code)} · ${Math.round(state.weather.temperature)}°C · rain chance ${Math.round(state.weather.precipitationProbability || 0)}%</p>
                    </div>
                </div>
            </div>
        `;

        setTimeout(() => setStep(3), 700);
    } catch {
        button.disabled = false;
        button.textContent = "Try again";
        showMessage("Forecast could not be loaded. Try another city or continue without weather.");
    }
}

function nearestTimeIndex(times, target) {
    if (!times.length) return -1;

    const targetMs = new Date(target).getTime();
    if (Number.isNaN(targetMs)) return -1;

    let best = -1;
    let distance = Infinity;

    times.forEach((time, index) => {
        const value = new Date(time).getTime();
        if (Number.isNaN(value)) return;
        const current = Math.abs(value - targetMs);
        if (current < distance) {
            distance = current;
            best = index;
        }
    });

    return best;
}

function renderContext() {
    state.context = {
        schedule: state.events.map(event => ({
            title: event.title,
            date: event.date,
            time: event.time
        })),
        weather: state.weather ? {
            city: state.weather.city,
            date: state.weather.date,
            time: state.weather.time,
            condition: weatherLabel(state.weather.code),
            temperatureC: Math.round(state.weather.temperature),
            rainChancePercent: Math.round(state.weather.precipitationProbability || 0),
            windKmh: Math.round(state.weather.wind || 0)
        } : null
    };

    workspace.innerHTML = `
        <div class="eyebrow">Context</div>
        <h2 class="section-title">Give AI only what it needs</h2>
        <p class="section-copy">The app has a bigger calendar file and weather response, but the LLM receives only the useful fields.</p>

        <div class="context-card">
            <div class="context-block">
                <h3>📅 Schedule</h3>
                ${state.events.map(event => `<div class="context-line"><strong>${escapeHtml(event.displayTime)}</strong> · ${escapeHtml(event.title)}</div>`).join("")}
            </div>
            <div class="context-block">
                <h3>🌦 Forecast</h3>
                ${state.weather
                    ? `<div class="context-line">${weatherLabel(state.weather.code)} · ${Math.round(state.weather.temperature)}°C · ${Math.round(state.weather.precipitationProbability || 0)}% rain</div>`
                    : '<div class="context-line">No weather context</div>'}
            </div>
        </div>

        <div class="learned-card">
            <strong>Data minimization</strong>
            <p>More accessible data is not automatically better context. Give the model the smallest useful set of facts.</p>
        </div>

        <button id="buildWithContext" class="button full-button" type="button">Build checklist from this context →</button>
    `;

    document.getElementById("buildWithContext").addEventListener("click", () => setStep(4));
}

async function renderPlanner() {
    workspace.innerHTML = `
        <div class="eyebrow">Connected AI application</div>
        <h2 class="section-title">Calendar + weather + local LLM</h2>
        <p class="section-copy">This is a connected assistant: code gathers real data, then the model uses that context to create the list.</p>

        <div class="flow-line wrap-flow">
            <span>Calendar</span><b>+</b><span>Weather</span><b>→</b><span>Context</span><b>→</b><span>Local LLM</span>
        </div>

        <div class="model-card">
            <div class="model-progress"><span id="modelProgress"></span></div>
            <div id="modelStatus" class="small-note">Loading local model…</div>
        </div>

        <div id="plannerResult"></div>
    `;

    if (!navigator.gpu) {
        document.getElementById("modelStatus").textContent = "WebGPU is not available in this browser.";
        return;
    }

    try {
        state.engine = await webllm.CreateMLCEngine(MODEL_ID, {
            initProgressCallback: report => {
                document.getElementById("modelStatus").textContent = report.text || "Loading local model…";
                document.getElementById("modelProgress").style.width = Math.round(Number(report.progress || 0) * 100) + "%";
            }
        });

        document.getElementById("modelProgress").style.width = "100%";
        document.getElementById("modelStatus").textContent = "Model ready · using real context…";

        const response = await state.engine.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a practical preparation assistant. Use only provided context and return the requested JSON."
                },
                {
                    role: "user",
                    content: buildPrompt()
                }
            ],
            temperature: 0.2,
            max_tokens: 500,
            response_format: { type: "json_object" }
        });

        state.result = parseJson(response.choices?.[0]?.message?.content || "");
        if (!state.result?.events?.length) throw new Error("Invalid output");

        state.checklist = normalize(state.result);
        saveConnectedResult();
        markComplete();
        paintFinalResult();
    } catch {
        document.getElementById("modelStatus").textContent = "The local model did not return usable structured data.";
        showMessage("Nothing was sent to a paid AI API. Reload and try again.");
    }
}

function buildPrompt() {
    return `Create a practical preparation checklist from this context:

${JSON.stringify(state.context, null, 2)}

Return ONLY valid JSON:
{
  "events": [
    { "name": "Event name", "items": ["Item 1", "Item 2"] }
  ]
}

Rules:
- Use only the supplied schedule as real events.
- Use weather only when it changes what may be useful.
- Use short concrete item names.
- Do not invent appointments or personal facts.
- No text outside JSON.`;
}

function paintFinalResult() {
    const trained = JSON.parse(localStorage.getItem("smartReadyVisionModel") || "null");
    const known = (trained?.items || []).map(item => item.toLowerCase());

    document.getElementById("plannerResult").innerHTML = `
        <div class="result-section">
            <h3>Smart Ready prepared:</h3>
            <div id="finalChecklist"></div>
        </div>

        <div class="learned-card">
            <strong>Important distinction</strong>
            <p>You built a <b>connected AI application</b>. Code chose which data to fetch. In Build 4, the model will help choose which tools to use. That is the step toward an AI agent.</p>
        </div>

        ${known.length ? `
            <div class="bridge-card">
                <strong>Now connect back to Build 1</strong>
                <p>Use your trained camera model to verify checklist items it knows.</p>
                <a class="button secondary" href="project1.html?mode=check">Check items with camera →</a>
            </div>
        ` : ""}

        <div class="next-build-card">
            <span>Build 3 complete ✓</span>
            <strong>Next: turn this connected app into your first agent.</strong>
            <a class="button" href="project4.html">Start Build 4 →</a>
        </div>
    `;

    document.getElementById("finalChecklist").innerHTML = state.checklist.map(event => `
        <section class="checklist-section">
            <h3>${escapeHtml(event.name)}</h3>
            ${event.items.map(item => `
                <div class="check-row">
                    <span>${known.some(label => item.toLowerCase().includes(label) || label.includes(item.toLowerCase())) ? "📷" : "○"}</span>
                    <span>${escapeHtml(item)}</span>
                </div>
            `).join("")}
        </section>
    `).join("");
}

function saveConnectedResult() {
    const payload = {
        source: "build3",
        city: state.city,
        context: state.context,
        events: state.checklist.map(event => ({
            name: event.name,
            items: event.items.map(name => ({ name, ready: false }))
        }))
    };

    localStorage.setItem("smartReadyProject3", JSON.stringify(payload));
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(payload));
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
        .slice(0, 8);
}

function weatherLabel(code) {
    const value = Number(code);
    if (value === 0) return "Clear";
    if ([1, 2, 3].includes(value)) return "Partly cloudy";
    if ([45, 48].includes(value)) return "Fog";
    if ([51, 53, 55, 56, 57].includes(value)) return "Drizzle";
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return "Rain";
    if ([71, 73, 75, 77, 85, 86].includes(value)) return "Snow";
    if ([95, 96, 99].includes(value)) return "Thunderstorm";
    return "Mixed conditions";
}

function weatherIcon(code) {
    const label = weatherLabel(code);
    if (label === "Clear") return "☀️";
    if (label === "Partly cloudy") return "⛅";
    if (label === "Fog") return "🌫️";
    if (label === "Snow") return "❄️";
    if (label === "Thunderstorm") return "⛈️";
    return "🌧️";
}

function formatTime(value) {
    const [hour, minute] = value.split(":").map(Number);
    const suffix = hour >= 12 ? "PM" : "AM";
    return (hour % 12 || 12) + ":" + String(minute).padStart(2, "0") + " " + suffix;
}

function todayIso() {
    const date = new Date();
    return localIsoDate(date);
}

function tomorrowIso() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return localIsoDate(date);
}

function localIsoDate(date) {
    return date.getFullYear() + "-" +
        String(date.getMonth() + 1).padStart(2, "0") + "-" +
        String(date.getDate()).padStart(2, "0");
}

function showMessage(text) {
    let box = document.getElementById("inlineMessage");
    if (!box) {
        box = document.createElement("div");
        box.id = "inlineMessage";
        box.className = "warning-box";
        workspace.prepend(box);
    }
    box.textContent = text;
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
