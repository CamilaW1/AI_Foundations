# AI Builder — Smart Ready

A project-based AI learning app where each project extends the same product.

## Projects

### Project 1 — Smart Bag Detector

- Choose three item classes.
- Capture five guided views per item.
- Train an in-browser classifier with TensorFlow.js, MobileNet and KNN.
- Test predictions with the camera.
- Add a confidence rule for uncertain predictions.

### Project 2 — Smart Planner

- Describe a real plan in natural language.
- Build a useful prompt.
- Run a local LLM in the browser with WebLLM.
- Request structured JSON.
- Turn the JSON into an editable checklist.
- Keep human review before accepting AI suggestions.

### Project 3 — Connected Smart Assistant

- Import calendar events from an .ics file locally in the browser.
- Add live weather by city.
- Minimize context before giving it to the model.
- Use the local LLM to build a connected preparation checklist.
- Review the list before confirming it.
- Continue toward camera verification from Project 1.

## Project structure

```text
smart-ready/
├── index.html
├── project2.html
├── project3.html
├── css/
│   ├── style.css
│   ├── project2.css
│   └── project3.css
└── js/
    ├── app.js
    ├── project2.js
    └── project3.js
```

## Privacy and cost

- Camera access is requested by the browser only when the user starts the camera.
- Project 1 image processing happens in the browser; this demo does not upload captured training photos to a server.
- Project 2 and Project 3 use a local WebLLM model. They do not use an OpenAI API key or paid OpenAI tokens.
- Project 3 calendar .ics files are parsed in the browser and are not uploaded by this demo.
- Project 3 sends only the city name and weather request to Open-Meteo. It does not request precise browser GPS location.
- Confirmed Project 2/3 checklist data may be stored in browser localStorage on that device.

## Third-party services and licences

- WebLLM is Apache-2.0 licensed.
- SmolLM2 is Apache-2.0 licensed.
- TensorFlow.js is Apache-2.0 licensed.
- Project 3 uses the Open-Meteo Free API for this non-commercial educational project. Open-Meteo weather data is provided under CC BY 4.0 and attribution is shown in the Project 3 interface.
- Open-Meteo's free API is for non-commercial use. Before using this project commercially, switch to a commercial weather plan/provider and review the current terms.

## Important

AI-generated checklists can be incomplete or wrong. The app is designed to require user review before a list is treated as final.

No paid AI/API service should be added to this project without explicit approval from the project owner.
