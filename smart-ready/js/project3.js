import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const MODEL_ID = "SmolLM2-360M-Instruct-q4f32_1-MLC";

const state = {
    step: 1,
    events: [],
    weather: null,
    city: "",
    context: null,
    engine: null,
    modelReady: false,
    modelLoading: false,
    result: null,
    checklist: []
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
    1: "The assistant needs real schedule context. An .ics calendar file can be read locally in the browser, so the schedule does not need to be uploaded to our server.",
    2: "Weather changes what a person may need. This step asks Open-Meteo for current weather using a city name, not your browser's precise GPS location.",
    3: "Context is the small set of useful facts we give the AI. We keep only event names, times and weather instead of sending unnecessary personal data.",
    4: "The same local LLM from Project 2 can combine this real context into a structured preparation checklist.",
    5: "AI suggestions still need human review. You remain in control of what is removed, added or confirmed.",
    6: "The product now has three parts: vision, planning and real-world context. Project 1 can later verify checklist items with the camera."
};

const hints = {
    1: "Export a day or small date range from a calendar as .ics, or add a few events manually.",
    2: "Type a city such as Vancouver. The weather request does not need an API key.",
    3: "Useful context is short: what is happening, when it happens, and relevant weather.",
    4: "If the model was already downloaded in Project 2, the browser may reuse cached files and load faster.",
    5: "Remove anything unnecessary and add anything the AI missed before confirming.",
    6: "Use Project 1 for visual checking and Project 3 for deciding what should be checked."
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

    if (state.step === 1) renderCalendar();
    if (state.step === 2) renderWeather();
    if (state.step === 3) renderContext();
    if (state.step === 4) renderLocalAI();
    if (state.step === 5) renderReview();
    if (state.step === 6) renderFinish();
}

function renderCalendar() {
    setHelp("Bring schedule data into the app. You can import an .ics calendar file or add events manually.");

    workspace.innerHTML = `
        <div class="eyebrow">Real schedule data</div>
        <h2 class="section-title">Add today's events</h2>
        <p class="section-copy">For this build, calendar files are processed locally in your browser. No calendar account password is requested.</p>

        <div class="privacy-box">🔒 Imported calendar text stays in this browser session. This demo does not upload the .ics file to a server.</div>

        <div class="upload-area">
            <span class="upload-icon">📅</span>
            <strong>Import calendar (.ics)</strong>
            <p class="small-note">A small date range is best for this learning project.</p>
            <input id="icsFile" type="file" accept=".ics,text/calendar" class="hidden">
            <button id="chooseIcs" type="button" class="button secondary" style="margin-top:10px">Choose .ics file</button>
        </div>

        <div class="connect-card">
            <h3>Or add an event manually</h3>
            <div class="manual-row">
                <input id="eventTime" type="time" value="09:00" aria-label="Event time">
                <input id="eventTitle" maxlength="50" placeholder="e.g. Work">
                <button id="addEvent" type="button" class="button secondary">Add</button>
            </div>
        </div>

        <div id="eventsContainer"></div>

        <button id="weatherStep" type="button" class="button" style="width:100%;margin-top:14px" ${state.events.length ? "" : "disabled"}>Add weather →</button>
    `;

    paintEvents();

    document.getElementById("chooseIcs").addEventListener("click", () => {
        document.getElementById("icsFile").click();
    });

    document.getElementById("icsFile").addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file) return;

        const text = await file.text();
        const imported = parseIcs(text);

        if (imported.length) {
            state.events = imported.slice(0, 12);
            setHelp(`Imported ${state.events.length} calendar event${state.events.length === 1 ? "" : "s"}. Review them, then add weather.`);
            renderCalendar();
        } else {
            setHelp("I could not find VEVENT entries in that file. Try another .ics file or add events manually.");
        }
    });

    document.getElementById("addEvent").addEventListener("click", () => {
        const titleInput = document.getElementById("eventTitle");
        const timeInput = document.getElementById("eventTime");
        const title = titleInput.value.trim();

        if (!title) {
            titleInput.focus();
            return;
        }

        state.events.push({
            title,
            time: timeInput.value || "Any time"
        });

        state.events = state.events.slice(0, 12);
        renderCalendar();
    });

    document.getElementById("weatherStep").addEventListener("click", () => setStep(2));
}

function parseIcs(text) {
    const unfolded = text.replace(/\r?\n[ \t]/g, "");
    const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
    const events = [];

    for (const block of blocks) {
        const body = block.split("END:VEVENT")[0] || "";
        const summaryMatch = body.match(/(?:^|\n)SUMMARY(?:;[^:]*)?:(.*)/i);
        const dateMatch = body.match(/(?:^|\n)DTSTART(?:;[^:]*)?:(.*)/i);

        if (!summaryMatch) continue;

        const title = decodeIcsText(summaryMatch[1].trim());
        const rawDate = dateMatch ? dateMatch[1].trim() : "";
        const time = formatIcsTime(rawDate);

        if (title) {
            events.push({ title, time });
        }
    }

    return events;
}

function decodeIcsText(value) {
    return value
        .replace(/\\n/gi, " ")
        .replace(/\\,/g, ",")
        .replace(/\\;/g, ";")
        .replace(/\\\\/g, "\\")
        .trim();
}

function formatIcsTime(value) {
    const match = value.match(/T?(\d{2})(\d{2})(\d{2})?$/);
    if (!match) return "Any time";

    const hours = Number(match[1]);
    const minutes = match[2];
    const suffix = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes} ${suffix}`;
}

function paintEvents() {
    const container = document.getElementById("eventsContainer");
    if (!container) return;

    if (!state.events.length) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `
        <div class="event-list">
            <h3 style="margin:0 0 5px">Schedule</h3>
            ${state.events.map((event, index) => `
                <div class="event-row">
                    <span class="event-time">${escapeHtml(event.time)}</span>
                    <strong>${escapeHtml(event.title)}</strong>
                    <button type="button" class="remove-event" data-remove-event="${index}" aria-label="Remove event">×</button>
                </div>
            `).join("")}
        </div>
    `;

    container.querySelectorAll("[data-remove-event]").forEach(button => {
        button.addEventListener("click", () => {
            state.events.splice(Number(button.dataset.removeEvent), 1);
            renderCalendar();
        });
    });
}

function renderWeather() {
    setHelp("Add live weather by city. We avoid requesting precise browser location in this version.");

    workspace.innerHTML = `
        <div class="eyebrow">Live external data</div>
        <h2 class="section-title">Add today's weather</h2>
        <p class="section-copy">Weather can change what the assistant suggests. Type a city to check current conditions.</p>

        <div class="city-row">
            <input id="cityInput" maxlength="80" placeholder="e.g. Vancouver" value="${escapeHtml(state.city)}">
            <button id="getWeather" type="button" class="button teal">Check weather</button>
        </div>

        <div class="privacy-box">🌐 The city name is sent to Open-Meteo's geocoding/weather service. We are not requesting your browser's precise GPS location.</div>
        <div id="weatherResult"></div>

        <button id="skipWeather" type="button" class="help-button" style="width:100%;margin-top:12px">Continue without weather</button>
    `;

    if (state.weather) {
        paintWeather();
    }

    document.getElementById("getWeather").addEventListener("click", fetchWeather);
    document.getElementById("skipWeather").addEventListener("click", () => {
        state.weather = null;
        setStep(3);
    });
}

async function fetchWeather() {
    const input = document.getElementById("cityInput");
    const button = document.getElementById("getWeather");
    const city = input.value.trim();

    if (!city) {
        input.focus();
        return;
    }

    state.city = city;
    button.disabled = true;
    button.textContent = "Checking…";
    setHelp("Getting current weather from Open-Meteo…");

    try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
        const geoResponse = await fetch(geoUrl);

        if (!geoResponse.ok) throw new Error("Geocoding failed");

        const geoData = await geoResponse.json();
        const place = geoData.results?.[0];

        if (!place) throw new Error("City not found");

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,precipitation,rain,snowfall,wind_speed_10m&timezone=auto`;
        const weatherResponse = await fetch(weatherUrl);

        if (!weatherResponse.ok) throw new Error("Weather failed");

        const weatherData = await weatherResponse.json();
        const current = weatherData.current || {};

        state.weather = {
            city: place.name,
            region: place.admin1 || place.country || "",
            temperature: current.temperature_2m,
            code: current.weather_code,
            condition: weatherLabel(current.weather_code),
            precipitation: current.precipitation,
            wind: current.wind_speed_10m
        };

        paintWeather();
        setHelp("Weather added. The assistant now has schedule plus real conditions.");
        setTimeout(() => setStep(3), 650);
    } catch (error) {
        button.disabled = false;
        button.textContent = "Try again";
        document.getElementById("weatherResult").innerHTML = '<div class="warning-box">Weather could not be loaded. You can try another city or continue without weather.</div>';
        setHelp("The weather service did not respond. The project can continue without it.");
    }
}

function paintWeather() {
    const container = document.getElementById("weatherResult");
    if (!container || !state.weather) return;

    container.innerHTML = `
        <div class="weather-card">
            <div class="weather-main">
                <div class="weather-icon">${weatherIcon(state.weather.code)}</div>
                <div>
                    <h3>${escapeHtml(state.weather.city)} ${state.weather.region ? "· " + escapeHtml(state.weather.region) : ""}</h3>
                    <p>${escapeHtml(state.weather.condition)} · ${Math.round(Number(state.weather.temperature))}°C · Wind ${Math.round(Number(state.weather.wind || 0))} km/h</p>
                </div>
            </div>
        </div>
    `;
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

function renderContext() {
    state.context = {
        events: state.events.map(event => ({
            title: event.title,
            time: event.time
        })),
        weather: state.weather ? {
            city: state.weather.city,
            condition: state.weather.condition,
            temperatureC: Math.round(Number(state.weather.temperature)),
            precipitation: state.weather.precipitation,
            windKmh: Math.round(Number(state.weather.wind || 0))
        } : null
    };

    setHelp("This is the context the local AI will receive. Notice that it contains only information needed for the task.");

    workspace.innerHTML = `
        <div class="eyebrow">Context building</div>
        <h2 class="section-title">Combine the useful data</h2>
        <p class="section-copy">We keep the context small instead of sending an entire calendar file or unrelated personal information.</p>

        <div class="context-card">
            <div class="context-block">
                <h3>📅 Events</h3>
                ${state.context.events.map(event => `<div class="context-line"><strong>${escapeHtml(event.time)}</strong> — ${escapeHtml(event.title)}</div>`).join("")}
            </div>

            <div class="context-block">
                <h3>🌤 Weather</h3>
                ${state.context.weather
                    ? `<div class="context-line">${escapeHtml(state.context.weather.city)} · ${escapeHtml(state.context.weather.condition)} · ${state.context.weather.temperatureC}°C</div>`
                    : '<div class="context-line">No weather data — continue with schedule only.</div>'}
            </div>
        </div>

        <div class="privacy-box">Data minimization: the LLM receives event titles/times and selected weather fields, not the original .ics file.</div>

        <button id="prepareAI" type="button" class="button" style="width:100%;margin-top:14px">Prepare local AI →</button>
    `;

    document.getElementById("prepareAI").addEventListener("click", () => setStep(4));
}

function buildPrompt() {
    return `Create a practical preparation checklist from this context:

${JSON.stringify(state.context, null, 2)}

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
- Include only things the person may realistically need to bring or prepare.
- Consider weather only when it changes what may be useful.
- Do not invent appointments or personal facts that are not in the context.
- Do not include explanations outside the JSON.`;
}

function renderLocalAI() {
    setHelp("Now the local LLM combines your real context into a structured checklist. No paid AI API is used.");

    const prompt = buildPrompt();

    workspace.innerHTML = `
        <div class="eyebrow">Local AI + real context</div>
        <h2 class="section-title">Generate the preparation list</h2>
        <p class="section-copy">The model runs on this device through WebLLM/WebGPU.</p>

        <div class="prompt-box">${escapeHtml(prompt)}</div>

        <div class="model-card">
            <h3>Local model</h3>
            <strong>SmolLM2 360M Instruct</strong>
            <div class="small-note">No API key and no paid token billing. The first model download can be large and may take several minutes on mobile.</div>

            <div class="model-progress"><span id="modelProgress"></span></div>
            <div id="modelStatus" class="small-note">${state.modelReady ? "Model ready ✓" : "Not loaded yet"}</div>

            <div class="action-stack">
                <button id="loadModel" type="button" class="button secondary" ${state.modelReady || state.modelLoading ? "disabled" : ""}>${state.modelReady ? "Local AI ready ✓" : "Load local AI"}</button>
                <button id="generateList" type="button" class="button teal" ${state.modelReady ? "" : "disabled"}>Generate connected checklist</button>
            </div>
        </div>

        <div id="modelWarning"></div>
    `;

    if (state.modelReady) {
        document.getElementById("modelProgress").style.width = "100%";
    }

    document.getElementById("loadModel").addEventListener("click", loadModel);
    document.getElementById("generateList").addEventListener("click", generateChecklist);
}

async function loadModel() {
    const status = document.getElementById("modelStatus");
    const progress = document.getElementById("modelProgress");
    const button = document.getElementById("loadModel");
    const warning = document.getElementById("modelWarning");

    if (!navigator.gpu) {
        warning.innerHTML = '<div class="warning-box">WebGPU is not available in this browser. Try a current Chrome/Edge browser on a compatible device. This project will not silently switch to a paid cloud model.</div>';
        return;
    }

    state.modelLoading = true;
    button.disabled = true;
    button.textContent = "Loading…";

    try {
        state.engine = await webllm.CreateMLCEngine(MODEL_ID, {
            initProgressCallback: report => {
                status.textContent = report.text || "Loading local AI…";
                progress.style.width = `${Math.round(Number(report.progress || 0) * 100)}%`;
            }
        });

        state.modelReady = true;
        state.modelLoading = false;
        progress.style.width = "100%";
        status.textContent = "Model ready ✓";
        button.textContent = "Local AI ready ✓";
        document.getElementById("generateList").disabled = false;
        setHelp("Local AI is ready. Generate the checklist from the connected context.");
    } catch (error) {
        state.modelLoading = false;
        button.disabled = false;
        button.textContent = "Try loading again";
        status.textContent = "Model not loaded";
        warning.innerHTML = '<div class="warning-box">The local model could not load on this device. Nothing was sent to a paid AI API.</div>';
    }
}

async function generateChecklist() {
    if (!state.engine) return;

    const button = document.getElementById("generateList");
    const status = document.getElementById("modelStatus");
    button.disabled = true;
    button.textContent = "Thinking locally…";
    status.textContent = "Generating on this device…";

    try {
        const response = await state.engine.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a practical preparation assistant. Use only the provided context and follow the requested JSON format exactly."
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

        const raw = response.choices?.[0]?.message?.content || "";
        state.result = parseModelJson(raw);

        if (!state.result || !Array.isArray(state.result.events) || !state.result.events.length) {
            throw new Error("Invalid structured response");
        }

        state.checklist = normalizeChecklist(state.result);
        setStep(5);
    } catch (error) {
        button.disabled = false;
        button.textContent = "Try again";
        status.textContent = "The model did not return usable JSON.";
        setHelp("The answer stayed local, but the JSON was not usable. Try generating again.");
    }
}

function parseModelJson(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        const firstBrace = text.indexOf("{");
        const lastBrace = text.lastIndexOf("}");

        if (firstBrace === -1 || lastBrace <= firstBrace) return null;

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
        .filter(event => event.items.length)
        .slice(0, 8);
}

function renderReview() {
    setHelp("Review the generated list before relying on it. AI output is a suggestion, not a guarantee.");

    workspace.innerHTML = `
        <div class="eyebrow">Human review</div>
        <h2 class="section-title">Review the connected checklist</h2>
        <p class="section-copy">The assistant used your schedule and weather, but you decide what is actually useful.</p>

        <div id="checklist"></div>

        <div class="add-row">
            <input id="newItem" maxlength="40" placeholder="Add an item">
            <button id="addItem" type="button" class="button secondary">Add item</button>
        </div>

        <button id="confirmList" type="button" class="button" style="width:100%;margin-top:14px">Confirm list ✓</button>
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
            state.checklist.push({ name: "My day", items: [] });
        }

        state.checklist[0].items.push(value);
        input.value = "";
        paintChecklist();
    });

    document.getElementById("confirmList").addEventListener("click", () => {
        localStorage.setItem("smartReadyProject3", JSON.stringify({
            context: state.context,
            checklist: state.checklist
        }));
        setStep(6);
    });
}

function paintChecklist() {
    const container = document.getElementById("checklist");
    if (!container) return;

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
            state.checklist = state.checklist.filter(event => event.items.length);
            paintChecklist();
        });
    });
}

function renderFinish() {
    setHelp("Project 3 is complete. You now have vision, planning and real-world context in the same Smart Ready product.");

    workspace.innerHTML = `
        <div class="done-card">
            <div class="done-icon">✓</div>
            <div class="eyebrow">Project 3 complete</div>
            <h2 class="section-title" style="margin-top:8px">Your assistant now uses real context.</h2>
            <p class="section-copy">You imported schedule data, fetched live weather, minimized the context, used a local LLM and reviewed the final checklist.</p>

            <div class="feature-badges" style="justify-content:center">
                <span>Calendar ✓</span>
                <span>Weather ✓</span>
                <span>Local LLM ✓</span>
                <span>Human review ✓</span>
            </div>

            <a class="button" href="index.html" style="display:inline-block;text-decoration:none;margin-top:18px">Open Project 1 camera detector</a>
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
