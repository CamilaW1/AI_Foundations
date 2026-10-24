import * as webllm from "https://esm.run/@mlc-ai/web-llm";
import { DateTime } from "https://esm.run/luxon@3.7.2";
import {
    parseStructuredJson,
    normalizeChecklist,
    minimizeEvents,
    applyMemoryToChecklist,
    connectedFallbackChecklist
} from "./core.js";

const MODEL_ID = "SmolLM2-360M-Instruct-q4f32_1-MLC";
const PROGRESS_KEY = "smartReadyProgress";
const CHECKLIST_KEY = "smartReadyActiveChecklist";
const MEMORY_KEY = "smartReadyMemory";

const state = {
    step: 1,
    events: [],
    dayLabel: "",
    city: "",
    weatherByEvent: [],
    context: null,
    engine: null,
    checklist: [],
    result: null,
    usedFallback: false
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
        <div class="eyebrow">Just choose</div>
        <h2 class="section-title">Pick a day</h2>
        <p class="section-copy">Choose one ready-made day. Smart Ready will create the schedule automatically.</p>

        <div class="choice-stack easy-choice-stack">
            <button class="big-choice" type="button" data-sample-day="work">
                <span>💼</span>
                <div><strong>Work + swimming</strong><small>9:00 Work · 5:30 Swimming</small></div>
            </button>

            <button class="big-choice" type="button" data-sample-day="school">
                <span>🎒</span>
                <div><strong>School + soccer</strong><small>8:30 School · 4:00 Soccer</small></div>
            </button>

            <button class="big-choice" type="button" data-sample-day="family">
                <span>🌳</span>
                <div><strong>Family park day</strong><small>11:00 Park · 1:00 Picnic</small></div>
            </button>
        </div>

        <details class="optional-details">
            <summary>✨ Use my own schedule (optional)</summary>
            <div class="optional-body">
                <button id="importCalendar" class="button secondary full-button" type="button">📅 Import .ics calendar</button>
                <button id="manualMode" class="button secondary full-button" type="button">✍️ Add events myself</button>

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
                    <button id="manualWeather" type="button" class="button full-button hidden">Choose weather location →</button>
                </div>
            </div>
        </details>

        <div class="privacy-box">🔒 Sample days use no personal calendar data.</div>
    `;

    workspace.querySelectorAll("[data-sample-day]").forEach(button => {
        button.addEventListener("click", () => {
            const date = tomorrowIso();
            const type = button.dataset.sampleDay;

            if (type === "school") {
                state.events = [
                    buildManualEvent("School", date, "08:30"),
                    buildManualEvent("Soccer", date, "16:00")
                ];
            } else if (type === "family") {
                state.events = [
                    buildManualEvent("Park", date, "11:00"),
                    buildManualEvent("Picnic", date, "13:00")
                ];
            } else {
                state.events = [
                    buildManualEvent("Work", date, "09:00"),
                    buildManualEvent("Swimming", date, "17:30")
                ];
            }

            state.dayLabel = "Tomorrow";
            setStep(2);
        });
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
            showMessage("No usable events were found in that calendar file.");
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

        state.events.push(buildManualEvent(title, date, time));
        state.events.sort((a, b) => a.startMs - b.startMs);
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

function buildManualEvent(title, date, time) {
    const dt = DateTime.fromISO(date + "T" + time);

    return {
        title,
        date,
        time,
        displayTime: dt.isValid ? dt.toFormat("h:mm a") : formatTime(time),
        timezone: dt.zoneName || "local",
        startMs: dt.isValid ? dt.toMillis() : Date.now(),
        allDay: false
    };
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
        const timezone = params.match(/TZID=([^;:]+)/i)?.[1] || null;
        const parsed = parseIcsStart(raw, timezone);

        if (!parsed) return null;

        return {
            title: decodeIcsText(summary),
            ...parsed
        };
    }).filter(Boolean);
}

function parseIcsStart(raw, timezone) {
    const dateOnly = /^\d{8}$/.test(raw);

    if (dateOnly) {
        const dt = DateTime.fromFormat(raw, "yyyyMMdd");
        if (!dt.isValid) return null;

        return {
            date: dt.toISODate(),
            time: "09:00",
            displayTime: "All day",
            timezone: timezone || dt.zoneName || "local",
            startMs: dt.startOf("day").toMillis(),
            allDay: true
        };
    }

    const normalized = raw.endsWith("Z") ? raw.slice(0, -1) : raw;
    const format = normalized.length >= 15 ? "yyyyMMdd'T'HHmmss" : "yyyyMMdd'T'HHmm";

    let dt;

    if (raw.endsWith("Z")) {
        dt = DateTime.fromFormat(normalized, format, { zone: "utc" });
    } else if (timezone) {
        dt = DateTime.fromFormat(normalized, format, { zone: timezone });
    } else {
        dt = DateTime.fromFormat(normalized, format);
    }

    if (!dt.isValid) return null;

    return {
        date: dt.toISODate(),
        time: dt.toFormat("HH:mm"),
        displayTime: dt.toFormat("h:mm a"),
        timezone: dt.zoneName || timezone || "local",
        startMs: dt.toMillis(),
        allDay: false
    };
}

function chooseRelevantDay(events) {
    if (!events.length) return { events: [], label: "" };

    const today = DateTime.local().toISODate();
    const grouped = new Map();

    events.forEach(event => {
        if (!grouped.has(event.date)) grouped.set(event.date, []);
        grouped.get(event.date).push(event);
    });

    const dates = [...grouped.keys()].sort();
    const chosenDate = grouped.has(today)
        ? today
        : dates.find(date => date >= today) || dates[0];

    const chosenEvents = (grouped.get(chosenDate) || [])
        .sort((a, b) => a.startMs - b.startMs)
        .slice(0, 12);

    return {
        events: chosenEvents,
        label: chosenDate === today
            ? "Today"
            : chosenDate === tomorrowIso()
                ? "Tomorrow"
                : DateTime.fromISO(chosenDate).toFormat("MMM d")
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
    const cities = [
        ["🇨🇦", "Vancouver"],
        ["🇨🇦", "Toronto"],
        ["🇺🇸", "San Francisco"],
        ["🇬🇧", "London"]
    ];

    workspace.innerHTML = `
        <div class="eyebrow">Just choose</div>
        <h2 class="section-title">Where is this day happening?</h2>
        <p class="section-copy">Tap a city. Smart Ready automatically gets weather for each event time.</p>

        <div class="choice-stack easy-choice-stack">
            ${cities.map(([icon, city]) => `
                <button class="big-choice" type="button" data-city="${city}">
                    <span>${icon}</span>
                    <div><strong>${city}</strong><small>Tap once → match forecast to events</small></div>
                </button>
            `).join("")}
        </div>

        <details class="optional-details">
            <summary>✨ Another city (optional)</summary>
            <div class="optional-body">
                <div class="city-row">
                    <input id="cityInput" maxlength="80" placeholder="Type another city" value="${escapeHtml(state.city)}">
                    <button id="weatherButton" type="button" class="button teal">Use city</button>
                </div>
            </div>
        </details>

        <button id="skipWeather" type="button" class="text-action">Skip weather</button>
        <div id="weatherResult"></div>
    `;

    workspace.querySelectorAll("[data-city]").forEach(button => {
        button.addEventListener("click", () => fetchWeatherForEvents(button.dataset.city));
    });

    document.getElementById("weatherButton").addEventListener("click", () => fetchWeatherForEvents());
    document.getElementById("cityInput").addEventListener("keydown", event => {
        if (event.key === "Enter") fetchWeatherForEvents();
    });

    document.getElementById("skipWeather").addEventListener("click", () => {
        state.weatherByEvent = [];
        setStep(3);
    });
}

async function fetchWeatherForEvents(cityOverride = "") {
    const input = document.getElementById("cityInput");
    const button = document.getElementById("weatherButton");
    const city = cityOverride || input?.value.trim() || "";

    if (!city) {
        input?.focus();
        return;
    }

    state.city = city;

    if (button && !cityOverride) {
        button.disabled = true;
        button.textContent = "Matching forecasts…";
    }

    try {
        const geoResponse = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
        );

        if (!geoResponse.ok) throw new Error("Geocoding failed");

        const geo = await geoResponse.json();
        const place = geo.results?.[0];

        if (!place) throw new Error("City not found");

        const forecastResponse = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
            "&hourly=temperature_2m,weather_code,precipitation_probability,precipitation,rain,snowfall,wind_speed_10m" +
            "&forecast_days=7&timezone=auto"
        );

        if (!forecastResponse.ok) throw new Error("Forecast failed");

        const data = await forecastResponse.json();
        const weatherZone = data.timezone || "UTC";
        const times = data.hourly?.time || [];

        state.weatherByEvent = state.events.map(event => {
            const eventAtWeatherLocation = event.allDay
                ? DateTime.fromISO(event.date + "T12:00", { zone: weatherZone })
                : DateTime.fromMillis(event.startMs).setZone(weatherZone);

            const targetKey = eventAtWeatherLocation.toFormat("yyyy-MM-dd'T'HH:00");
            let index = times.indexOf(targetKey);

            if (index < 0) {
                index = nearestTimeIndex(times, eventAtWeatherLocation.toISO({ suppressSeconds: true, includeOffset: false }));
            }

            if (index < 0) {
                return {
                    eventTitle: event.title,
                    eventDate: event.date,
                    eventTime: event.time,
                    unavailable: true
                };
            }

            return {
                eventTitle: event.title,
                eventDate: event.date,
                eventTime: event.time,
                city: place.name,
                region: place.admin1 || place.country || "",
                forecastTime: times[index],
                temperatureC: Number(data.hourly.temperature_2m[index]),
                code: Number(data.hourly.weather_code[index]),
                rainChancePercent: Number(data.hourly.precipitation_probability[index] || 0),
                precipitation: Number(data.hourly.precipitation[index] || 0),
                windKmh: Number(data.hourly.wind_speed_10m[index] || 0),
                unavailable: false
            };
        });

        paintWeatherResults();
        setTimeout(() => setStep(3), 850);
    } catch {
        if (button) {
            button.disabled = false;
            button.textContent = "Try again";
        }
        showMessage("Forecast could not be loaded. Choose another city or skip weather.");
    }
}

function paintWeatherResults() {
    const container = document.getElementById("weatherResult");
    if (!container) return;

    container.innerHTML = `
        <div class="weather-stack">
            ${state.weatherByEvent.map(item => item.unavailable ? `
                <div class="weather-card">
                    <strong>${escapeHtml(item.eventTitle)}</strong>
                    <p>Forecast not available for this event time.</p>
                </div>
            ` : `
                <div class="weather-card">
                    <div class="weather-main">
                        <div class="weather-icon">${weatherIcon(item.code)}</div>
                        <div>
                            <h3>${escapeHtml(item.eventTitle)}</h3>
                            <p>${weatherLabel(item.code)} · ${Math.round(item.temperatureC)}°C · rain ${Math.round(item.rainChancePercent)}%</p>
                        </div>
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

function nearestTimeIndex(times, target) {
    if (!times.length) return -1;

    const targetMs = DateTime.fromISO(target).toMillis();
    if (!Number.isFinite(targetMs)) return -1;

    let best = -1;
    let distance = Infinity;

    times.forEach((time, index) => {
        const value = DateTime.fromISO(time).toMillis();
        if (!Number.isFinite(value)) return;

        const current = Math.abs(value - targetMs);
        if (current < distance) {
            distance = current;
            best = index;
        }
    });

    return best;
}

function renderContext() {
    const schedule = minimizeEvents(state.events);

    state.context = {
        schedule,
        forecasts: state.weatherByEvent
            .filter(item => !item.unavailable)
            .map(item => ({
                eventTitle: item.eventTitle,
                eventDate: item.eventDate,
                eventTime: item.eventTime,
                condition: weatherLabel(item.code),
                temperatureC: Math.round(item.temperatureC),
                rainChancePercent: Math.round(item.rainChancePercent),
                windKmh: Math.round(item.windKmh)
            }))
    };

    workspace.innerHTML = `
        <div class="eyebrow">Context</div>
        <h2 class="section-title">Give AI only what it needs</h2>
        <p class="section-copy">The original calendar and weather responses contain much more data. The LLM receives only useful event fields and matched forecasts.</p>

        <div class="context-card">
            <div class="context-block">
                <h3>📅 Schedule</h3>
                ${state.events.map(event => `
                    <div class="context-line">
                        <strong>${escapeHtml(event.displayTime)}</strong> · ${escapeHtml(event.title)}
                    </div>
                `).join("")}
            </div>

            <div class="context-block">
                <h3>🌦 Forecasts</h3>
                ${state.context.forecasts.length
                    ? state.context.forecasts.map(item => `
                        <div class="context-line">
                            <strong>${escapeHtml(item.eventTitle)}</strong> · ${escapeHtml(item.condition)} · ${item.temperatureC}°C · ${item.rainChancePercent}% rain
                        </div>
                    `).join("")
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
        <h2 class="section-title">Schedule + forecasts + local LLM</h2>
        <p class="section-copy">Application code gathered the data. Now the local model turns that real context into a useful preparation list.</p>

        <div class="flow-line wrap-flow">
            <span>Schedule</span><b>+</b><span>Forecasts</span><b>→</b><span>Context</span><b>→</b><span>Local LLM</span>
        </div>

        <div class="model-card">
            <div class="model-progress"><span id="modelProgress"></span></div>
            <div id="modelStatus" class="small-note">Loading local model…</div>
        </div>

        <div id="plannerResult"></div>
    `;

    if (!navigator.gpu) {
        useFallback("WebGPU is unavailable on this device.");
        return;
    }

    try {
        state.engine = await webllm.CreateMLCEngine(MODEL_ID, {
            initProgressCallback: report => {
                document.getElementById("modelStatus").textContent = report.text || "Loading local model…";
                document.getElementById("modelProgress").style.width =
                    Math.round(Number(report.progress || 0) * 100) + "%";
            }
        });

        document.getElementById("modelProgress").style.width = "100%";
        document.getElementById("modelStatus").textContent = "Model ready · using real context…";

        const response = await state.engine.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a practical preparation assistant. Use only provided context. Return only valid JSON and no extra text."
                },
                {
                    role: "user",
                    content: buildPrompt()
                }
            ],
            temperature: 0.2,
            max_tokens: 500
        });

        state.result = parseStructuredJson(response.choices?.[0]?.message?.content || "");

        if (!state.result?.events?.length) {
            throw new Error("Invalid structured output");
        }

        finishConnectedChecklist(state.result, false);
    } catch {
        useFallback("The free local model did not return usable structured data on this run.");
    }
}

function buildPrompt() {
    const memory = JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]");

    return `Create a practical preparation checklist from this context:

${JSON.stringify(state.context, null, 2)}

Saved preferences:
${JSON.stringify(memory)}

Return ONLY valid JSON:
{
  "events": [
    { "name": "Event name", "items": ["Item 1", "Item 2"] }
  ]
}

Rules:
- Use only supplied schedule events.
- Match weather to the relevant event.
- Use weather only when it changes what may be useful.
- Respect saved preferences when relevant.
- Use short concrete item names.
- Do not invent appointments or personal facts.
- No text outside JSON.`;
}

function useFallback(reason) {
    state.usedFallback = true;

    const schedule = state.context?.schedule || minimizeEvents(state.events);
    const representativeWeather = state.context?.forecasts?.[0] || null;

    const fallback = connectedFallbackChecklist(schedule, representativeWeather);
    finishConnectedChecklist(fallback, true, reason);
}

function finishConnectedChecklist(result, fallback, reason = "") {
    state.result = result;
    state.usedFallback = fallback;

    const base = normalizeChecklist(result);
    const memory = JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]");
    state.checklist = applyMemoryToChecklist(base, memory);

    saveConnectedResult();
    markComplete();
    paintFinalResult(reason);
}

function paintFinalResult(reason = "") {
    const trained = JSON.parse(localStorage.getItem("smartReadyVisionModel") || "null");
    const known = (trained?.items || []).map(item => item.toLowerCase());

    document.getElementById("plannerResult").innerHTML = `
        ${state.usedFallback ? `<div class="warning-box"><strong>Learning fallback</strong><br>${escapeHtml(reason)} No paid cloud model was used.</div>` : ""}

        <div class="result-section">
            <h3>Smart Ready prepared:</h3>
            <div id="finalChecklist"></div>
        </div>

        <div class="learned-card">
            <strong>Important distinction</strong>
            <p>You built a <b>connected AI application</b>. Application code chose which data to fetch. In Build 4, the model will choose the next tool after seeing each observation. That is the agent loop.</p>
        </div>

        ${known.length ? `
            <div class="bridge-card">
                <strong>Connect back to Build 1</strong>
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

            ${(event.memoryNotes || []).map(note => `<div class="memory-note">🧩 ${escapeHtml(note)}</div>`).join("")}

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
            items: event.items.map(name => ({ name, ready: false })),
            memoryNotes: event.memoryNotes || []
        }))
    };

    localStorage.setItem("smartReadyProject3", JSON.stringify(payload));
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(payload));
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

function tomorrowIso() {
    return DateTime.local().plus({ days: 1 }).toISODate();
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
