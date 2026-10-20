const BUILDS = [
    {
        id: 1,
        title: "Teach it to See",
        name: "Smart Bag Detector",
        icon: "👁️",
        file: "project1.html",
        skill: "Computer vision",
        outcome: "Train a model to recognize your own objects."
    },
    {
        id: 2,
        title: "Teach it to Plan",
        name: "Smart Planner",
        icon: "🧠",
        file: "project2.html",
        skill: "Local LLM",
        outcome: "Turn a real plan into a structured checklist."
    },
    {
        id: 3,
        title: "Give it Context",
        name: "Connected Assistant",
        icon: "🌐",
        file: "project3.html",
        skill: "APIs + real data",
        outcome: "Combine schedule and weather with the planner."
    },
    {
        id: 4,
        title: "Teach it to Act",
        name: "First AI Agent",
        icon: "🛠️",
        file: "project4.html",
        skill: "Tools + agent loop",
        outcome: "Give a goal and let the model choose useful tools."
    },
    {
        id: 5,
        title: "Teach it to Remember",
        name: "Memory & Documents",
        icon: "🧩",
        file: "project5.html",
        skill: "Retrieval + RAG",
        outcome: "Use preferences and documents as grounded context."
    },
    {
        id: 6,
        title: "Make it Trustworthy",
        name: "Test & Ship",
        icon: "✅",
        file: "project6.html",
        skill: "Evals + reliability",
        outcome: "Break the app, test it and prepare it to ship."
    }
];

const progress = JSON.parse(localStorage.getItem("smartReadyProgress") || "{}");
const completed = BUILDS.filter(build => progress["build" + build.id]).length;
const percent = Math.round((completed / BUILDS.length) * 100);

document.getElementById("courseProgressBar").style.width = percent + "%";
document.getElementById("courseProgressText").textContent = completed + " of " + BUILDS.length + " builds complete";
document.getElementById("courseProgressPct").textContent = percent + "%";

const firstIncomplete = BUILDS.find(build => !progress["build" + build.id])?.id || 6;

document.getElementById("buildGrid").innerHTML = BUILDS.map(build => {
    const isComplete = Boolean(progress["build" + build.id]);
    const isNext = build.id === firstIncomplete && !isComplete;

    return `
        <a class="build-card ${isComplete ? "complete" : ""} ${isNext ? "next" : ""}" href="${build.file}">
            <div class="build-card-top">
                <span class="build-number">Build ${build.id}</span>
                <span class="build-state">${isComplete ? "Complete ✓" : isNext ? "Start here →" : ""}</span>
            </div>
            <div class="build-card-body">
                <div class="build-card-icon">${build.icon}</div>
                <div>
                    <strong>${build.title}</strong>
                    <h3>${build.name}</h3>
                    <p>${build.outcome}</p>
                    <span class="skill-chip">${build.skill}</span>
                </div>
            </div>
        </a>
    `;
}).join("");
