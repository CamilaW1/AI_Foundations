export function parseStructuredJson(text) {
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {}

    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");

    if (first < 0 || last <= first) return null;

    try {
        return JSON.parse(text.slice(first, last + 1));
    } catch {
        return null;
    }
}

export function normalizeChecklist(result, maxEvents = 8, maxItems = 12) {
    if (!Array.isArray(result?.events)) return [];

    return result.events
        .filter(event => event?.name && Array.isArray(event.items))
        .map(event => ({
            name: String(event.name).trim(),
            items: event.items
                .map(item => typeof item === "string" ? item : item?.name)
                .map(item => String(item || "").trim())
                .filter(Boolean)
                .slice(0, maxItems)
        }))
        .filter(event => event.items.length)
        .slice(0, maxEvents);
}

export function buildFallbackChecklist(plan) {
    const text = String(plan || "").toLowerCase();
    const events = [];

    const add = (name, items) => {
        if (!events.some(event => event.name === name)) {
            events.push({ name, items: [...items] });
        }
    };

    if (text.includes("work")) add("Work", ["Laptop", "Charger", "Access Card"]);
    if (text.includes("swim")) add("Swimming", ["Swimsuit", "Towel", "Goggles", "Water Bottle"]);
    if (text.includes("flight") || text.includes("flying") || text.includes("airport") || text.includes("trip") || text.includes("travel")) {
        add("Trip", ["Passport", "Charger", "Clothes", "Water Bottle"]);
    }
    if (text.includes("beach")) add("Beach", ["Towel", "Sunscreen", "Water Bottle", "Snacks"]);
    if (text.includes("school")) add("School", ["Notebook", "Water Bottle", "Pencil Case"]);
    if (text.includes("soccer")) add("Soccer", ["Soccer Shoes", "Water Bottle", "Sports Clothes"]);
    if (text.includes("gym")) add("Gym", ["Gym Shoes", "Towel", "Water Bottle"]);

    if (!events.length) {
        add("My plan", ["Phone", "Water Bottle", "Charger"]);
    }

    return { events };
}

export function minimizeEvents(events) {
    return (events || []).map(event => ({
        title: String(event.title || event.name || "Event"),
        date: event.date || null,
        time: event.time || null
    }));
}

export function applyMemoryToChecklist(events, memory) {
    const memories = (memory || []).map(value => String(value).trim()).filter(Boolean);
    const result = (events || []).map(event => ({
        name: event.name,
        items: [...(event.items || [])],
        memoryNotes: []
    }));

    for (const note of memories) {
        const lower = note.toLowerCase();

        const keepMatch = lower.match(/i keep (?:a |an |the )?(.+?) at (work|school|home|the office)\.?$/i);
        if (keepMatch) {
            const item = keepMatch[1].trim();
            const place = keepMatch[2].toLowerCase();

            for (const event of result) {
                const eventLower = event.name.toLowerCase();
                const applies =
                    (place === "work" && /work|office/.test(eventLower)) ||
                    (place === "school" && /school/.test(eventLower)) ||
                    (place === "home" && /home/.test(eventLower)) ||
                    (place === "the office" && /work|office/.test(eventLower));

                if (!applies) continue;

                const before = event.items.length;
                event.items = event.items.filter(existing => {
                    const existingLower = String(existing).toLowerCase();
                    return !(existingLower.includes(item.toLowerCase()) || item.toLowerCase().includes(existingLower));
                });

                if (event.items.length !== before) {
                    event.memoryNotes.push(`${capitalize(item)} skipped — you keep it at ${place.replace("the ", "")}.`);
                }
            }
        }

        if (lower.includes("light packing list")) {
            for (const event of result) {
                if (event.items.length > 5) {
                    event.items = event.items.slice(0, 5);
                    event.memoryNotes.push("Kept the list light using your saved preference.");
                }
            }
        }

        if (lower.includes("usually carry a water bottle")) {
            for (const event of result) {
                if (!event.items.some(item => /water bottle/i.test(item))) {
                    event.items.push("Water Bottle");
                    event.memoryNotes.push("Water Bottle added from your saved preference.");
                }
            }
        }
    }

    return result;
}

export function evaluateConfidence(label, confidence, threshold) {
    const value = Number(confidence || 0);
    const limit = Number(threshold || 0.7);

    return {
        label: value >= limit ? label : "Not sure",
        accepted: value >= limit,
        confidence: value,
        threshold: limit
    };
}

export function keywordRetrieve(chunks, query, limit = 3) {
    const queryTerms = terms(query);

    return (chunks || [])
        .map((text, index) => {
            const chunkTerms = terms(text);
            const overlap = queryTerms.filter(term => chunkTerms.includes(term)).length;
            const phraseBonus = queryTerms.some(term => String(text).toLowerCase().includes(term)) ? 1 : 0;

            return {
                text,
                index,
                score: overlap + phraseBonus
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

export function hasRetrievalEvidence(matches) {
    return Array.isArray(matches) && matches.some(match => Number(match.score || 0) > 0);
}

export function fallbackNextAction(goal, observations, usedTools) {
    const used = new Set(usedTools || []);
    const schedule = observations?.calendar;
    const weather = observations?.weather;

    if (!used.has("calendar")) return "calendar";

    const goalText = String(goal || "").toLowerCase();
    const scheduleText = JSON.stringify(schedule || []).toLowerCase();
    const weatherRelevant =
        /outdoor|park|beach|hike|hiking|soccer|walk|picnic|ski|school|tomorrow|get ready/.test(goalText + " " + scheduleText);

    if (weatherRelevant && !used.has("weather") && !weather) return "weather";

    return "finish";
}

export function connectedFallbackChecklist(schedule, weather) {
    const rain =
        /rain|drizzle|thunder/i.test(weather?.condition || "") ||
        Number(weather?.rainChancePercent || weather?.precipitationProbability || 0) >= 50;

    const events = (schedule || []).map(event => {
        const title = String(event.title || event.name || "Event");
        const lower = title.toLowerCase();
        const items = ["Phone", "Water Bottle"];

        if (/work|office/.test(lower)) items.push("Laptop", "Charger");
        if (/swim/.test(lower)) items.push("Swimsuit", "Towel", "Goggles");
        if (/school/.test(lower)) items.push("Notebook", "Pencil Case");
        if (/soccer/.test(lower)) items.push("Soccer Shoes", "Sports Clothes");
        if (/beach/.test(lower)) items.push("Towel", "Sunscreen");
        if (/hike|hiking|walk|park|picnic/.test(lower)) items.push("Comfortable Shoes");
        if (rain) items.push("Umbrella");

        return { name: title, items: [...new Set(items)] };
    });

    return {
        events: events.length ? events : [{
            name: "My day",
            items: rain ? ["Phone", "Water Bottle", "Umbrella"] : ["Phone", "Water Bottle"]
        }]
    };
}

function terms(text) {
    const stop = new Set([
        "the", "a", "an", "and", "or", "to", "for", "i", "my", "what", "should",
        "do", "is", "are", "of", "in", "on", "with", "from", "this", "that"
    ]);

    return [...new Set(
        String(text || "")
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter(term => term.length > 2 && !stop.has(term))
    )];
}

function capitalize(value) {
    const text = String(value || "");
    return text ? text[0].toUpperCase() + text.slice(1) : text;
}
