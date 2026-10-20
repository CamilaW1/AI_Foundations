import * as webllm from "https://esm.run/@mlc-ai/web-llm";
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const MODEL_ID = "SmolLM2-360M-Instruct-q4f32_1-MLC";
const PROGRESS_KEY = "smartReadyProgress";
const MEMORY_KEY = "smartReadyMemory";

const workspace = document.getElementById("workspace");

const memoryOptions = [
    "I keep a charger at work.",
    "I prefer a light packing list.",
    "I usually carry a water bottle."
];

const sampleDocument = `SCHOOL FIELD TRIP — SCIENCE CENTRE
Date: Friday
Students should bring a packed lunch, a refillable water bottle, and a light rain jacket.
Wear comfortable closed-toe shoes.
Do not bring money or electronic games.
The bus leaves school at 9:00 AM and returns at 3:00 PM.
Emergency medication should be given to the teacher according to school instructions.`;

let documentName = "";
let documentText = "";
let chunks = [];
let engine = null;

render();

function render() {
    const savedMemory = JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]");

    workspace.innerHTML = `
        <div class="eyebrow">Part 1 · Memory</div>
        <h2 class="section-title">Save useful preferences</h2>
        <p class="section-copy">Tap a preference. It is saved immediately on this device—there is no confirmation step.</p>

        <div class="memory-options">
            ${memoryOptions.map(option => `
                <button class="memory-chip ${savedMemory.includes(option) ? "selected" : ""}" type="button" data-memory="${escapeHtml(option)}">${escapeHtml(option)}</button>
            `).join("")}
        </div>

        <div class="learned-card">
            <strong>Memory is not the same as a prompt</strong>
            <p>A prompt is for this request. Memory is useful context the app can reuse later.</p>
        </div>

        <div class="section-divider"></div>

        <div class="eyebrow">Part 2 · Documents</div>
        <h2 class="section-title">Ask a question grounded in a source</h2>
        <p class="section-copy">Use the sample field-trip document or upload a local TXT, MD or PDF file. The document is processed in this browser.</p>

        <div class="choice-stack">
            <button id="sampleDoc" class="big-choice" type="button">
                <span>📄</span><div><strong>Use sample field-trip document</strong><small>Fastest path to see retrieval and RAG.</small></div>
            </button>
            <button id="uploadDoc" class="big-choice" type="button">
                <span>📁</span><div><strong>Use my document</strong><small>TXT, MD or PDF · local processing</small></div>
            </button>
        </div>

        <input id="documentFile" type="file" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" class="hidden">
        <div id="ragArea"></div>
    `;

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

function loadDocument(name, text) {
    documentName = name;
    documentText = text.trim();
    chunks = chunkText(documentText);

    document.getElementById("ragArea").innerHTML = `
        <div class="document-ready">
            <span>📄</span>
            <div><strong>${escapeHtml(documentName)}</strong><small>${chunks.length} searchable chunks created locally</small></div>
        </div>

        <div class="query-row">
            <input id="ragQuery" placeholder="Ask the document something">
            <button id="askDoc" class="button" type="button">Ask</button>
        </div>

        <div class="example-row">
            <button class="example-chip" data-query="What should I bring for the field trip?">What should I bring?</button>
            <button class="example-chip" data-query="What should I not bring?">What should I not bring?</button>
        </div>

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

function retrieve(query) {
    const queryTerms = terms(query);

    return chunks
        .map((text, index) => {
            const chunkTerms = terms(text);
            const overlap = queryTerms.filter(term => chunkTerms.includes(term)).length;
            const bonus = queryTerms.some(term => text.toLowerCase().includes(term)) ? 1 : 0;
            return { text, index, score: overlap + bonus };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
}

function terms(text) {
    const stop = new Set(["the","a","an","and","or","to","for","i","my","what","should","do","is","are","of","in","on"]);
    return [...new Set(
        text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter(term => term.length > 2 && !stop.has(term))
    )];
}

async function runRag(query) {
    const matches = retrieve(query);
    const result = document.getElementById("ragResult");

    result.innerHTML = `
        <div class="retrieval-card">
            <div class="eyebrow">Retrieval first</div>
            <h3>The app found these source chunks</h3>
            ${matches.map((match, index) => `
                <blockquote><strong>Source ${index + 1}</strong> · ${escapeHtml(match.text)}</blockquote>
            `).join("")}
        </div>

        <div class="model-card">
            <div class="model-progress"><span id="ragProgress"></span></div>
            <div id="ragStatus" class="small-note">Loading local LLM to answer only from retrieved context…</div>
        </div>
    `;

    let answer = "";

    try {
        if (!navigator.gpu) throw new Error("No WebGPU");

        engine = await webllm.CreateMLCEngine(MODEL_ID, {
            initProgressCallback: report => {
                document.getElementById("ragProgress").style.width =
                    Math.round(Number(report.progress || 0) * 100) + "%";
            }
        });

        const context = matches.map((match, index) => "[Source " + (index + 1) + "] " + match.text).join("\n");
        const memory = JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]");

        const response = await engine.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "Answer only from the provided sources. If the answer is not in the sources, say you do not know. Cite sources like [Source 1]."
                },
                {
                    role: "user",
                    content: "Question: " + query + "\n\nMemory (preferences, not document facts): " + JSON.stringify(memory) + "\n\nSources:\n" + context
                }
            ],
            temperature: 0,
            max_tokens: 260
        });

        answer = response.choices?.[0]?.message?.content || "";
    } catch {
        answer = fallbackAnswer(query, matches);
    }

    markComplete();

    result.insertAdjacentHTML("beforeend", `
        <div class="answer-card">
            <div class="eyebrow">Grounded answer</div>
            <p>${escapeHtml(answer)}</p>
        </div>

        <div class="learned-card">
            <strong>RAG = retrieve, then generate</strong>
            <p>Instead of asking the LLM to remember the whole document, the app retrieves relevant pieces and gives only those pieces to the model.</p>
        </div>

        <div class="concept-note">
            <strong>Where do embeddings fit?</strong> This learning build uses lightweight keyword retrieval so you can see the pipeline. Production RAG often uses <b>embeddings</b>: vectors of numbers that make semantically similar text easier to find even when the exact words differ.
        </div>

        <div class="next-build-card">
            <span>Build 5 complete ✓</span>
            <strong>Next: test whether Smart Ready is reliable enough to ship.</strong>
            <a class="button" href="project6.html">Start Build 6 →</a>
        </div>
    `);
}

function fallbackAnswer(query, matches) {
    const text = matches.map((match, index) => match.text + " [Source " + (index + 1) + "]").join(" ");
    return text || "I could not find that information in the document.";
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
