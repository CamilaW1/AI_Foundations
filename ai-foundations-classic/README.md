# AI Foundations Study App

Mobile-first study app for learning the core concepts of Artificial Intelligence.

## Features

- 300 questions across Beginner, Intermediate, and Advanced levels
- 10 core Foundations of AI sections represented at every level
- Concise Theory reference
- Progress saved by level and topic
- Continue from the exact question where you stopped
- Mistakes review
- Shuffled answer choices
- Listen and Auto Listen using browser text-to-speech
- Mobile-friendly interface

## Project structure

```text
AI-Foundations/
├── index.html
├── css/
│   └── styles.css
├── data/
│   ├── questions.js
│   └── theory.js
└── js/
    ├── app.js
    ├── audio.js
    └── storage.js
```

## Run locally

Open `index.html` in a modern browser. No build step or backend is required.

Progress is stored locally in the browser with `localStorage`.
