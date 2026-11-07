// DevTools page — creates Issues panel entries via chrome.devtools.inspectedWindow.eval
// For MVP we expose a helper to surface AI governance issues in the inspected window's console.
chrome.devtools.panels.create("AI Protect", "icons/icon16.png", "src/devtools/panel.html", () => {});
