/**
 * Content script - Runs in web page context
 * Note: Most operations are handled via executeScript in background.js
 * This is here for potential future enhancements
 */

console.log('Edge AI Assistant content script loaded');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);

  // Handle any content-specific operations here
  sendResponse({ received: true });
});
