# AI Builder — Smart Bag Detector

Project 1 for the AI Builder learning app.

## What this version does

- Choose a bag type and three item classes.
- Collect five guided camera views per item.
- See all 15 training photos before training.
- Remove and retake weak examples.
- Train an in-browser image classifier using TensorFlow.js, MobileNet, and KNN.
- Test the classifier with a live camera.
- Learn confidence thresholds through the two-choice Hint mechanic.

## Project structure

```text
smart-ready/
├── index.html
├── css/
│   └── style.css
└── js/
    └── app.js
```

## Camera

Live camera access requires HTTPS or localhost. GitHub Pages provides HTTPS.

All captured images stay in the current browser session and are not uploaded to a server by this demo.
