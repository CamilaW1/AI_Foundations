(() => {
    const promptForm = document.getElementById("gamePromptForm");
    const promptInput = document.getElementById("gamePrompt");
    const creatorView = document.getElementById("creatorView");
    const gameView = document.getElementById("gameView");
    const preview = document.getElementById("generatedPreview");
    const stage = document.getElementById("gameStage");
    const humanScoreEl = document.getElementById("humanScore");
    const aiScoreEl = document.getElementById("aiScore");
    const roundLabel = document.getElementById("roundLabel");
    const exitGameButton = document.getElementById("exitGameButton");

    const state = {
        config: null,
        humanScore: 0,
        aiScore: 0,
        round: 1,
        selected: new Set()
    };

    const templates = {
        survival: {
            id: "survival",
            icon: "🌪️",
            title: "Iris Survival Battle",
            subtitle: "Choose the best gear. Then see what AI chooses.",
            rules: ["Pick 4 items", "AI picks 4", "Best survival score wins"]
        },
        hallucination: {
            id: "hallucination",
            icon: "🕵️",
            title: "Hallucination Hunt",
            subtitle: "AI makes a claim. You decide whether the evidence supports it.",
            rules: ["Read the claim", "Check the source", "Catch unsupported AI answers"]
        },
        agent: {
            id: "agent",
            icon: "🤖",
            title: "Agent Tool Race",
            subtitle: "Solve the mission with the fewest useful tools.",
            rules: ["Choose tools", "AI chooses tools", "Accuracy + efficiency wins"]
        }
    };

    const gear = [
        { id: "jacket", icon: "🧥", name: "Waterproof jacket", score: 3 },
        { id: "radio", icon: "📡", name: "Radio", score: 3 },
        { id: "water", icon: "🥤", name: "Water", score: 3 },
        { id: "battery", icon: "🔋", name: "Spare battery", score: 2 },
        { id: "samples", icon: "🧪", name: "Sample kit", score: 1 },
        { id: "tablet", icon: "📱", name: "Tablet", score: 1 },
        { id: "console", icon: "🎮", name: "Game console", score: -1 },
        { id: "slippers", icon: "🩴", name: "Slippers", score: -2 },
        { id: "cake", icon: "🍰", name: "Cake", score: 0 }
    ];

    const tools = [
        { id: "weather", icon: "🌦️", name: "Weather", useful: true },
        { id: "brief", icon: "📄", name: "Mission Brief", useful: true },
        { id: "equipment", icon: "🎒", name: "Equipment", useful: true },
        { id: "calendar", icon: "📅", name: "Calendar", useful: false },
        { id: "precise", icon: "📍", name: "Precise Location", useful: false },
        { id: "social", icon: "💬", name: "Social Feed", useful: false }
    ];

    const claims = [
        {
            claim: "The emergency shuttle returns at 18:40.",
            source: "Mission Brief: Emergency shuttle return time — 18:40.",
            supported: true
        },
        {
            claim: "All crew members must bring a red helmet.",
            source: "Mission Brief: All crew members must bring a certified helmet. No color is specified.",
            supported: false
        },
        {
            claim: "A waterproof outer layer is required during heavy rain.",
            source: "Safety Protocol: During heavy rain, every crew member must carry a waterproof outer layer.",
            supported: true
        }
    ];

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function chooseTemplate(text) {
        const value = text.toLowerCase();

        if (/halluc|lie|lying|claim|document|source|evidence|rag|secret/.test(value)) {
            return templates.hallucination;
        }

        if (/agent|tool|tools|api|minimum|efficient|route|prepare/.test(value)) {
            return templates.agent;
        }

        return templates.survival;
    }

    function generateFromPrompt(text) {
        const base = chooseTemplate(text);
        return {
            ...base,
            originalPrompt: text.trim() || "A game where I compete against AI on Iris."
        };
    }

    function renderPreview(config) {
        preview.classList.remove("hidden");
        preview.innerHTML = `
            <div class="generated-preview-inner">
                <div class="generated-game-top">
                    <div class="generated-game-icon">${config.icon}</div>
                    <div>
                        <span class="games-kicker">GAME READY</span>
                        <strong>${escapeHtml(config.title)}</strong>
                        <small>${escapeHtml(config.subtitle)}</small>
                    </div>
                </div>

                <div class="generated-rules">
                    ${config.rules.map(rule => `<span>${escapeHtml(rule)}</span>`).join("")}
                </div>

                <button id="playGeneratedButton" class="play-generated-button" type="button">▶ Play Now</button>
            </div>
        `;

        document.getElementById("playGeneratedButton").addEventListener("click", () => startGame(config));
        preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function makeGame(text) {
        const value = text.trim();
        if (!value) {
            promptInput.value = "Make a game where AI and I choose the best gear for a storm on Iris.";
        }

        state.config = generateFromPrompt(promptInput.value);
        renderPreview(state.config);
    }

    promptForm.addEventListener("submit", event => {
        event.preventDefault();
        makeGame(promptInput.value);
    });

    document.querySelectorAll("[data-prompt]").forEach(button => {
        button.addEventListener("click", () => {
            promptInput.value = button.dataset.prompt;
            makeGame(button.dataset.prompt);
        });
    });

    exitGameButton.addEventListener("click", () => {
        gameView.classList.add("hidden");
        creatorView.classList.remove("hidden");
        state.selected.clear();
    });

    function startGame(config) {
        state.config = config;
        state.humanScore = 0;
        state.aiScore = 0;
        state.round = 1;
        state.selected.clear();
        syncScore();

        creatorView.classList.add("hidden");
        gameView.classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });

        renderCurrentGame();
    }

    function syncScore() {
        humanScoreEl.textContent = state.humanScore;
        aiScoreEl.textContent = state.aiScore;
        roundLabel.textContent = "Round " + state.round;
    }

    function renderCurrentGame() {
        if (state.config.id === "hallucination") {
            renderHallucinationRound();
        } else if (state.config.id === "agent") {
            renderAgentRound();
        } else {
            renderSurvivalRound();
        }
    }

    function renderSurvivalRound() {
        state.selected.clear();

        stage.innerHTML = `
            <span class="games-kicker">HUMAN VS AI · SURVIVAL</span>
            <h2>Storm approaching Iris Base</h2>
            <p class="game-stage-intro">Choose exactly <strong>4 items</strong>. AI is choosing its own equipment at the same time.</p>

            <div class="game-choice-grid">
                ${gear.map(item => `
                    <button type="button" class="game-choice" data-gear="${item.id}">
                        <span class="game-choice-icon">${item.icon}</span>
                        <strong>${escapeHtml(item.name)}</strong>
                        <small>Tap to choose</small>
                    </button>
                `).join("")}
            </div>

            <div class="game-action-row">
                <button id="lockGear" class="game-primary-button" type="button" disabled>Lock 0 / 4</button>
            </div>
        `;

        const lock = document.getElementById("lockGear");

        stage.querySelectorAll("[data-gear]").forEach(button => {
            button.addEventListener("click", () => {
                const id = button.dataset.gear;

                if (state.selected.has(id)) {
                    state.selected.delete(id);
                } else if (state.selected.size < 4) {
                    state.selected.add(id);
                }

                stage.querySelectorAll("[data-gear]").forEach(card => {
                    card.classList.toggle("selected", state.selected.has(card.dataset.gear));
                });

                lock.textContent = "Lock " + state.selected.size + " / 4";
                lock.disabled = state.selected.size !== 4;
            });
        });

        lock.addEventListener("click", resolveSurvivalRound);
    }

    function resolveSurvivalRound() {
        const humanItems = gear.filter(item => state.selected.has(item.id));
        const aiPool = gear.slice().sort((a, b) => b.score - a.score);
        const aiItems = aiPool.slice(0, 4);

        const human = humanItems.reduce((sum, item) => sum + item.score, 0);
        const ai = aiItems.reduce((sum, item) => sum + item.score, 0);

        if (human > ai) state.humanScore += 1;
        else if (ai > human) state.aiScore += 1;
        else {
            state.humanScore += 1;
            state.aiScore += 1;
        }

        syncScore();

        const humanWinner = human >= ai;
        const aiWinner = ai >= human;

        stage.innerHTML = `
            <span class="games-kicker">ROUND RESULT</span>
            <h2>${human > ai ? "You beat the AI! 🏆" : human === ai ? "Draw! 🤝" : "AI wins this round 🤖"}</h2>
            <p class="game-stage-intro">The score rewards mission-critical gear for a dangerous storm.</p>

            <div class="battle-results">
                <div class="battle-panel ${humanWinner ? "winner" : ""}">
                    <h3>YOU · ${human} pts</h3>
                    ${humanItems.map(item => `<div class="result-item"><span>${item.icon} ${escapeHtml(item.name)}</span><strong>${item.score > 0 ? "+" : ""}${item.score}</strong></div>`).join("")}
                </div>
                <div class="battle-panel ${aiWinner ? "winner" : ""}">
                    <h3>AI · ${ai} pts</h3>
                    ${aiItems.map(item => `<div class="result-item"><span>${item.icon} ${escapeHtml(item.name)}</span><strong>${item.score > 0 ? "+" : ""}${item.score}</strong></div>`).join("")}
                </div>
            </div>

            <div class="game-feedback"><strong>AI concept:</strong> both you and AI optimized for the same objective. Change the objective and the “best” answer can change too.</div>

            <div class="game-action-row">
                <button id="nextRoundButton" class="game-primary-button" type="button">Play Again →</button>
            </div>
        `;

        document.getElementById("nextRoundButton").addEventListener("click", () => {
            state.round += 1;
            syncScore();
            renderSurvivalRound();
        });
    }

    function renderHallucinationRound() {
        const item = claims[(state.round - 1) % claims.length];

        stage.innerHTML = `
            <span class="games-kicker">HUMAN VS AI · EVIDENCE</span>
            <h2>Catch the hallucination</h2>
            <p class="game-stage-intro">AI made a claim. Decide whether the source actually supports it.</p>

            <div class="claim-card">
                <span class="games-kicker">AI CLAIM</span>
                <h3>“${escapeHtml(item.claim)}”</h3>
                <div class="claim-source"><strong>Source:</strong><br>${escapeHtml(item.source)}</div>
            </div>

            <div class="binary-buttons">
                <button type="button" data-answer="true">✅ Supported</button>
                <button type="button" data-answer="false">🔥 Not supported</button>
            </div>
        `;

        stage.querySelectorAll("[data-answer]").forEach(button => {
            button.addEventListener("click", () => {
                const answer = button.dataset.answer === "true";
                resolveHallucination(answer, item);
            });
        });
    }

    function resolveHallucination(answer, item) {
        const correct = answer === item.supported;
        if (correct) state.humanScore += 1;
        else state.aiScore += 1;
        syncScore();

        stage.innerHTML = `
            <span class="games-kicker">ROUND RESULT</span>
            <h2>${correct ? "You caught it! 🔥" : "AI fooled you 🤖"}</h2>
            <p class="game-stage-intro">${item.supported ? "The source directly supports the claim." : "The AI added information that was not in the source."}</p>

            <div class="game-feedback"><strong>AI concept:</strong> a fluent answer is not automatically a grounded answer. Check whether evidence actually supports the claim.</div>

            <div class="game-action-row">
                <button id="nextClaimButton" class="game-primary-button" type="button">Next Round →</button>
            </div>
        `;

        document.getElementById("nextClaimButton").addEventListener("click", () => {
            state.round += 1;
            syncScore();
            renderHallucinationRound();
        });
    }

    function renderAgentRound() {
        state.selected.clear();

        stage.innerHTML = `
            <span class="games-kicker">HUMAN VS AI · AGENT RACE</span>
            <h2>Prepare for an Iris storm</h2>
            <p class="game-stage-intro">Choose the <strong>minimum tools</strong> needed to prepare the expedition safely. Extra tools reduce efficiency and may expose unnecessary data.</p>

            <div class="game-choice-grid">
                ${tools.map(tool => `
                    <button type="button" class="game-choice tool-card" data-tool="${tool.id}">
                        <span class="game-choice-icon">${tool.icon}</span>
                        <strong>${escapeHtml(tool.name)}</strong>
                        <small>Tool</small>
                    </button>
                `).join("")}
            </div>

            <div class="game-action-row">
                <button id="runAgentButton" class="game-primary-button" type="button" disabled>Run with 0 tools</button>
            </div>
        `;

        const run = document.getElementById("runAgentButton");

        stage.querySelectorAll("[data-tool]").forEach(button => {
            button.addEventListener("click", () => {
                const id = button.dataset.tool;

                if (state.selected.has(id)) state.selected.delete(id);
                else state.selected.add(id);

                stage.querySelectorAll("[data-tool]").forEach(card => {
                    card.classList.toggle("selected", state.selected.has(card.dataset.tool));
                });

                run.disabled = state.selected.size === 0;
                run.textContent = "Run with " + state.selected.size + " tool" + (state.selected.size === 1 ? "" : "s");
            });
        });

        run.addEventListener("click", resolveAgentRound);
    }

    function resolveAgentRound() {
        const humanTools = tools.filter(tool => state.selected.has(tool.id));
        const usefulChosen = humanTools.filter(tool => tool.useful).length;
        const extras = humanTools.filter(tool => !tool.useful).length;
        const human = usefulChosen * 3 - extras;

        const aiTools = [tools[0], tools[1], tools[2], tools[3]];
        const ai = 3 * 3 - 1;

        if (human > ai) state.humanScore += 1;
        else if (ai > human) state.aiScore += 1;
        else {
            state.humanScore += 1;
            state.aiScore += 1;
        }

        syncScore();

        stage.innerHTML = `
            <span class="games-kicker">ROUND RESULT</span>
            <h2>${human > ai ? "More efficient than AI! 🏆" : human === ai ? "You matched AI 🤝" : "AI wins this round 🤖"}</h2>
            <p class="game-stage-intro">Useful tools earn points. Unnecessary tools reduce the score.</p>

            <div class="battle-results">
                <div class="battle-panel ${human >= ai ? "winner" : ""}">
                    <h3>YOU · ${human} pts</h3>
                    ${humanTools.map(tool => `<div class="result-item"><span>${tool.icon} ${escapeHtml(tool.name)}</span><strong>${tool.useful ? "useful" : "extra"}</strong></div>`).join("")}
                </div>
                <div class="battle-panel ${ai >= human ? "winner" : ""}">
                    <h3>AI · ${ai} pts</h3>
                    ${aiTools.map(tool => `<div class="result-item"><span>${tool.icon} ${escapeHtml(tool.name)}</span><strong>${tool.useful ? "useful" : "extra"}</strong></div>`).join("")}
                </div>
            </div>

            <div class="game-feedback"><strong>AI concept:</strong> a good agent is not the one that calls every tool. It should use only what helps accomplish the goal.</div>

            <div class="game-action-row">
                <button id="nextAgentButton" class="game-primary-button" type="button">Play Again →</button>
            </div>
        `;

        document.getElementById("nextAgentButton").addEventListener("click", () => {
            state.round += 1;
            syncScore();
            renderAgentRound();
        });
    }
})();