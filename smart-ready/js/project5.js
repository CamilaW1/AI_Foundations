import * as webllm from "https://esm.run/@mlc-ai/web-llm";
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
import {
    keywordRetrieve,
    hasRetrievalEvidence,
    applyMemoryToChecklist
} from "./core.js";

pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const MODEL_ID = "SmolLM2-360M-Instruct-q4f32_1-MLC";
const PROGRESS_KEY = "smartReadyProgress";
const MEMORY_KEY = "smartReadyMemory";
const CHECKLIST_KEY = "smartReadyActiveChecklist";

const workspace = document.getElementById("workspace");

const memoryOptions = [
    "I keep a charger at work.",
    "I prefer a light packing list.",
    "I usually carry a water bottle."
];

const sampleDocument = `SCHOOL FIELD TRIP — SCIENCE CENTRE
Date: Friday
Students should bring a packed lunch and a refillable water bottle.
Because the group may walk outside, students should bring a waterproof outer layer.
Wear comfortable closed-toe shoes.
Do not bring money or electronic games.
The bus leaves school at 9:00 AM and returns at 3:00 PM.
Emergency medication should be given to the teacher according to school instructions.`;

let documentName = "";
let documentText = "";
let chunks = [];
let engine = null;
let semanticModel = null;

render();

function render() {
    const savedMemory = JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]");

    workspace.innerHTML = `
        <div class="eyebrow">Part 1 · Memory</div>
        <h2 class="section-title">Make Smart Ready personal</h2>
        <p class="section-copy">Tap a useful preference. It is saved immediately and can change checklists in Builds 2–4.</p>

        <div class="memory-options">
            ${memoryOptions.map(option => `
                <button class="memory-chip ${savedMemory.includes(option) ? "selected" : ""}" type="button" data-memory="${escapeHtml(option)}">
                    ${escapeHtml(option)}
                </button>
            `).join("")}
        </div>

        <div id="memoryPreview"></div>

        <div class="learned-card">
            <strong>Memory is different from a prompt</strong>
            <p>A prompt is context for one request. Memory is reusable context that can change future behavior.</p>
        </div>

        <div class="section-divider"></div>

        <div class="eyebrow">Part 2 · Just choose</div>
        <h2 class="section-title">Use a document without guessing</h2>
        <p class="section-copy">For the easy path, tap the ready-made document. You can upload your own only if you want to.</p>

        <div class="choice-stack easy-choice-stack">
            <button id="sampleDoc" class="big-choice colorful-choice" type="button">
                <span>📄</span>
                <div><strong>Use the sample field-trip document</strong><small>Recommended · one tap</small></div>
            </button>
        </div>

        <details class="optional-details">
            <summary>✨ My own document (optional)</summary>
            <div class="optional-body">
                <button id="uploadDoc" class="button secondary full-button" type="button">📁 Upload TXT, MD or PDF</button>
            </div>
        </details>

        <input id="documentFile" type="file" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" class="hidden">
        <div id="ragArea"></div>
    `;

    paintMemoryPreview();

    workspace.querySelectorAll("[data-memory]").forEach(button => {
        button.addEventListener("click", () => {
            const value = button.dataset.memory;
            let memory = JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]");

            if (memory.includes(value)) {
                memory = memory.filter(item => item !== value);
                button.classList.remove("selected");
            } else {
                memory.push(value);
                button.classList.add("selected");
            }

            localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
            paintMemoryPreview();
        });
    });

    document.getElementById("sampleDoc").addEventListener("click", () => {
        loadDocument("Field Trip Instructions", sampleDocument);
    });

    document.getElementById("uploadDoc").addEventListener("click", () => {
        document.getElementById("documentFile").click();
    });

    document.getElementById("documentFile").addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
                ? await extractPdf(file)
                : await file.text();

            loadDocument(file.name, text);
        } catch {
            showMessage("This file could not be read locally. Try a text file or another PDF.");
        }
    });
}

function paintMemoryPreview() {
    const container = document.getElementById("memoryPreview");
    if (!container) return;

    const memory = JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]");
    const active = JSON.parse(localStorage.getItem(CHECKLIST_KEY) || "null");

    const source = active?.events?.length
        ? active.events.map(event => ({
            name: event.name,
            items: (event.items || []).map(item => typeof item === "string" ? item : item.name)
        }))
        : [{
            name: "Work",
            items: ["Laptop", "Charger", "Access Card", "Water Bottle"]
        }];

    const personalized = applyMemoryToChecklist(source, memory);

    container.innerHTML = `
        <div class="memory-preview">
            <div class="memory-preview-head">
                <span>🧩</span>
                <div>
                    <strong>Live personalization preview</strong>
                    <small>${active?.events?.length ? "Using your current Smart Ready checklist." : "Using a sample Work checklist."}</small>
                </div>
            </div>

            ${personalized.slice(0, 2).map(event => `
                <div class="mini-checklist">
                    <strong>${escapeHtml(event.name)}</strong>
                    <p>${event.items.map(escapeHtml).join(" · ")}</p>
                    ${(event.memoryNotes || []).map(note => `<span class="memory-note">✨ ${escapeHtml(note)}</span>`).join("")}
                </div>
            `).join("")}
        </div>
    `;
}

function loadDocument(name, text) {
    documentName = name;
    documentText = text.trim();
    chunks = chunkText(documentText).slice(0, 40);

    document.getElementById("ragArea").innerHTML = `
        <div class="document-ready">
            <span>📄</span>
            <div>
                <strong>${escapeHtml(documentName)}</strong>
                <small>${chunks.length} searchable chunks created locally</small>
            </div>
        </div>

        <div class="eyebrow choice-eyebrow">Now choose a question</div>

        <div class="choice-stack easy-choice-stack">
            <button class="big-choice" data-query="What should I bring for the field trip?">
                <span>🎒</span>
                <div><strong>What should I bring?</strong><small>Simple retrieval question</small></div>
            </button>

            <button class="big-choice" data-query="Do I need a rain jacket?">
                <span>🌧️</span>
                <div><strong>Do I need a rain jacket?</strong><small>Shows why semantic retrieval helps</small></div>
            </button>

            <button class="big-choice" data-query="What time does the bus return?">
                <span>🚌</span>
                <div><strong>What time does the bus return?</strong><small>Find an exact fact</small></div>
            </button>

            <button class="big-choice" data-query="What color is the bus?">
                <span>❓</span>
                <div><strong>Ask something the document does not know</strong><small>Learn why “I don't know” matters</small></div>
            </button>
        </div>

        <details class="optional-details">
            <summary>✨ Ask my own question (optional)</summary>
            <div class="optional-body">
                <div class="query-row">
                    <input id="ragQuery" placeholder="Type your own question">
                    <button id="askDoc" class="button" type="button">Ask</button>
                </div>
            </div>
        </details>

        <div id="ragResult"></div>
    `;

    document.querySelectorAll("[data-query]").forEach(button => {
        button.addEventListener("click", () => runRag(button.dataset.query));
    });

    document.getElementById("askDoc").addEventListener("click", () => {
        const query = document.getElementById("ragQuery").value.trim();
        if (query) runRag(query);
    });

    document.getElementById("ragQuery").addEventListener("keydown", event => {
        if (event.key === "Enter") {
            const query = event.target.value.trim();
            if (query) runRag(query);
        }
    });
}

function chunkText(text) {
    const paragraphs = text
        .split(/\n+/)
        .map(part => part.trim())
        .filter(Boolean);

    if (paragraphs.length >= 2) return paragraphs;

    return text.match(/.{1,240}(?:\s|$)/g)?.map(part => part.trim()).filter(Boolean) || [text];
}

async function semanticRetrieve(query, limit = 3) {
    if (!window.use || !window.tf) {
        throw new Error("Embedding library unavailable");
    }

    semanticModel = semanticModel || await window.use.load();

    const values = [query, ...chunks];
    const embeddings = await semanticModel.embed(values);
    const matrix = await embeddings.array();
    embeddings.dispose();

    const queryVector = matrix[0];

    return matrix.slice(1)
        .map((vector, index) => ({
            text: chunks[index],
            index,
            score: cosine(queryVector, vector)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

function cosine(a, b) {
    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }

    const denominator = Math.sqrt(magA) * Math.sqrt(magB);
    return denominator ? dot / denominator : 0;
}

async function runRag(query) {
    const result = document.getElementById("ragResult");
    const keywordMatches = keywordRetrieve(chunks, query, 3);

    result.innerHTML = `
        <div class="retrieval-compare">
            <div class="retrieval-column">
                <div class="eyebrow">Keyword retrieval</div>
                <strong>Exact-word overlap</strong>
                <div class="retrieval-mini">
                    ${keywordMatches.map((match, index) => `
                        <div><span>${index + 1}</span>${escapeHtml(match.text)}</div>
                    `).join("")}
                </div>
            </div>

            <div class="retrieval-column semantic-column">
                <div class="eyebrow">Semantic retrieval</div>
                <strong id="semanticTitle">Loading local embedding model…</strong>
                <div id="semanticMatches" class="retrieval-mini"></div>
            </div>
        </div>

        <div class="concept-note">
            <strong>Why embeddings?</strong> Keyword search looks for matching words. Embeddings turn meaning into vectors, so “rain jacket” can be close to “waterproof outer layer” even when the words are different.
        </div>

        <div class="model-card">
            <div class="model-progress"><span id="ragProgress"></span></div>
            <div id="ragStatus" class="small-note">Finding the best local sources…</div>
        </div>
    `;

    let matches = keywordMatches;
    let retrievalMode = "keyword";

    try {
        matches = await semanticRetrieve(query, 3);
        retrievalMode = "semantic embeddings";

        document.getElementById("semanticTitle").textContent = "Meaning-based matches ✓";
        document.getElementById("semanticMatches").innerHTML = matches.map((match, index) => `
            <div>
                <span>${index + 1}</span>
                ${escapeHtml(match.text)}
                <small>similarity ${Math.round(match.score * 100)}%</small>
            </div>
        `).join("");
    } catch {
        document.getElementById("semanticTitle").textContent = "Embedding model unavailable — using keyword fallback";
        document.getElementById("semanticMatches").innerHTML =
            '<div><span>↪</span>The lesson continues with local keyword retrieval.</div>';
    }

    const hasEvidence = retrievalMode === "semantic embeddings"
        ? matches.some(match => match.score > 0.16)
        : hasRetrievalEvidence(matches);

    if (!hasEvidence) {
        finishRagWithoutAnswer(query, matches, retrievalMode);
        return;
    }

    document.getElementById("ragStatus").textContent =
        "Sources found · loading local LLM for a grounded answer…";

    let answer = "";

    try {
        if (!navigator.gpu) throw new Error("No WebGPU");

        engine = await webllm.CreateMLCEngine(MODEL_ID, {
            initProgressCallback: report => {
                document.getElementById("ragProgress").style.width =
                    Math.round(Number(report.progress || 0) * 100) + "%";
            }
        });

        const context = matches.map((match, index) =>
            "[Source " + (index + 1) + "] " + match.text
        ).join("\n");

        const response = await engine.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content:
                        "Answer only from the provided sources. If the answer is not supported by the sources, say you do not know. " +
                        "Cite sources like [Source 1]."
                },
                {
                    role: "user",
                    content: "Question: " + query + "\n\nSources:\n" + context
                }
            ],
            temperature: 0,
            max_tokens: 260
        });

        answer = response.choices?.[0]?.message?.content || "";
    } catch {
        answer = fallbackGroundedAnswer(matches);
    }

    finishRag(query, matches, answer, retrievalMode);
}

function finishRagWithoutAnswer(query, matches, retrievalMode) {
    markComplete();

    document.getElementById("ragStatus").textContent = "No strong evidence found in the document.";
    document.getElementById("ragProgress").style.width = "100%";

    document.getElementById("ragResult").insertAdjacentHTML("beforeend", `
        <div class="answer-card">
            <div class="eyebrow">Grounded answer</div>
            <p><strong>I don't know from this document.</strong> Smart Ready did not find enough source evidence for “${escapeHtml(query)}”.</p>
        </div>

        <div class="learned-card">
            <strong>This is good AI behavior</strong>
            <p>RAG should not force an answer when retrieval finds no supporting evidence. “I don't know” is often safer than a confident invention.</p>
        </div>

        ${nextBuildHtml()}
    `);
}

function finishRag(query, matches, answer, retrievalMode) {
    markComplete();

    document.getElementById("ragStatus").textContent =
        "Grounded answer ready · " + retrievalMode;
    document.getElementById("ragProgress").style.width = "100%";

    document.getElementById("ragResult").insertAdjacentHTML("beforeend", `
        <div class="retrieval-card">
            <div class="eyebrow">Sources sent to the LLM</div>
            ${matches.map((match, index) => `
                <blockquote><strong>Source ${index + 1}</strong> · ${escapeHtml(match.text)}</blockquote>
            `).join("")}
        </div>

        <div class="answer-card">
            <div class="eyebrow">Grounded answer</div>
            <p>${escapeHtml(answer)}</p>
        </div>

        <div class="learned-card">
            <strong>RAG = retrieve, then generate</strong>
            <p>The app first finds relevant document chunks, then gives those chunks to the LLM. The answer is easier to ground and cite than asking the model to rely on memory alone.</p>
        </div>

        ${nextBuildHtml()}
    `);
}

function nextBuildHtml() {
    return `
        <div class="next-build-card">
            <span>Build 5 complete ✓</span>
            <strong>Next: turn failures and safety rules into real executable evals.</strong>
            <a class="button" href="project6.html">Start Build 6 →</a>
        </div>
    `;
}

function fallbackGroundedAnswer(matches) {
    if (!matches.length) {
        return "I don't know from this document.";
    }

    return matches
        .map((match, index) => match.text + " [Source " + (index + 1) + "]")
        .join(" ");
}

async function extractPdf(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 20); pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => item.str).join(" "));
    }

    return pages.join("\n");
}

function markComplete() {
    const progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    progress.build5 = true;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function showMessage(text) {
    const box = document.createElement("div");
    box.className = "warning-box";
    box.textContent = text;
    workspace.prepend(box);
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
