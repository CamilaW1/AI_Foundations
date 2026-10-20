# AI Builder — Smart Ready

Smart Ready is a project-based AI learning app for beginners. Every build extends the same useful product instead of teaching disconnected exercises.

## Learning path

1. **Build 1 — See:** train an in-browser computer-vision classifier with your own examples; learn classes, training/test data, predictions, confidence and uncertainty.
2. **Build 2 — Plan:** use a free local LLM to turn natural-language plans into structured checklists; learn tokens, prompts, structured output and hallucination risk.
3. **Build 3 — Connect:** add schedule and event-time weather context; learn APIs, permissions, data minimization, JSON and failure handling.
4. **Build 4 — Act:** give the model a goal and let it help choose exposed tools; learn the agent loop: goal → model → tool → observation → action.
5. **Build 5 — Remember:** save local preferences, compare keyword search with local semantic embeddings, retrieve document chunks and answer from sources; learn memory, retrieval, embeddings, RAG and citations.
6. **Build 6 — Trust:** run executable checks against shared app logic; learn evals, guardrails, privacy, fallback behavior and deployment thinking.

## Local-first design

- Build 1 vision runs in the browser with TensorFlow.js, MobileNet and KNN.
- Builds 2–5 keep the free local SmolLM2 model through WebLLM.
- No paid OpenAI API or other paid cloud LLM API is enabled.
- Build 3 calendar .ics files are parsed locally.
- Build 3 uses Open-Meteo for city search and forecast data.
- Build 5 reads TXT/MD and supported PDFs locally; PDF.js is used for local PDF text extraction. Universal Sentence Encoder is used locally for semantic embeddings when available.
- Learning progress, preferences, checklists and compact classifier data can be stored in browser localStorage.
- Build 1 classifier data can be reused by later checklists for a real cross-build camera check.

## Product structure

```text
smart-ready/
├── index.html
├── project1.html
├── project2.html
├── project3.html
├── project4.html
├── project5.html
├── project6.html
├── privacy.html
├── manifest.webmanifest
├── service-worker.js
├── css/
│   ├── style.css
│   ├── project2.css
│   ├── project3.css
│   └── privacy.css
└── js/
    ├── home.js
    ├── app.js
    ├── project2.js
    ├── project3.js
    ├── project4.js
    ├── project5.js
    ├── project6.js
    └── pwa.js
```

## Important learning distinction

Build 3 is a connected AI application: application code gathers the context. Build 4 introduces an agent pattern where the model helps choose which exposed tools to use for a goal.

## Privacy and cost

See `privacy.html` for the plain-language Privacy & Data Use page. No paid AI/API service should be added without explicit project-owner approval.

## Installable app

Smart Ready is a Progressive Web App (PWA). The install button lives on the Learning Path home screen so installation does not compete with project tasks.
