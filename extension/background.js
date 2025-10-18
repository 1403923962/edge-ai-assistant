/**
 * Background script - HTTP Polling mode (MV3 compatible)
 * Uses short polling instead of SSE to work with Service Worker lifecycle
 */

const HTTP_SERVER_URL = 'http://localhost:9999';
let isConnected = false;
const POLLING_ALARM = 'command-polling';
const POLL_INTERVAL_SECONDS = 2;

// Start polling when extension loads
chrome.runtime.onStartup.addListener(startPolling);
chrome.runtime.onInstalled.addListener(startPolling);

// Start polling for commands
function startPolling() {
  console.log('[Polling] Starting command polling');

  // Create alarm for periodic polling (every 2 seconds)
  chrome.alarms.create(POLLING_ALARM, {
    periodInMinutes: POLL_INTERVAL_SECONDS / 60
  });

  // Poll immediately once
  pollForCommands();
}

// Handle alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLLING_ALARM) {
    pollForCommands();
  }
});

// Poll for pending commands from Native Host
async function pollForCommands() {
  try {
    const response = await fetch(`${HTTP_SERVER_URL}/poll`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      // No command available or server error
      if (response.status === 204) {
        // 204 No Content = no pending commands (normal)
        if (!isConnected) {
          isConnected = true;
          console.log('[Polling] Connected to server');
        }
      }
      return;
    }

    const message = await response.json();

    if (message && message.action) {
      console.log('[Polling] Received command:', message.action);
      await handleServerMessage(message);
    }

    isConnected = true;
  } catch (error) {
    if (isConnected) {
      console.error('[Polling] Server unreachable:', error.message);
      isConnected = false;
    }
  }
}

// Message handler
async function handleServerMessage(message) {
  const { id, action, params } = message;

  try {
    let result;

    switch (action) {
      case 'click':
      case 'fill':
      case 'getText':
      case 'getHTML':
      case 'evaluate':
        result = await executeInTab(params.tabId, action, params);
        break;
      case 'navigate':
        result = await navigateTab(params.url);
        break;
      case 'screenshot':
        result = await takeScreenshot(params.tabId);
        break;
      case 'getActiveTab':
        result = await getActiveTab();
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    await sendResponse(id, { success: true, result });
  } catch (error) {
    await sendResponse(id, { success: false, error: error.message });
  }
}

// Send response back to Native Host
async function sendResponse(id, data) {
  try {
    const response = await fetch(`${HTTP_SERVER_URL}/response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...data })
    });

    if (!response.ok) {
      console.error('[Response] Failed to send:', response.statusText);
    }
  } catch (error) {
    console.error('[Response] Error:', error);
  }
}

// Tab actions
async function executeInTab(tabId, action, params) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const targetTabId = tabId || tabs[0]?.id;

  if (!targetTabId) {
    throw new Error('No active tab found. Please ensure Edge browser window is open and in the foreground.');
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    func: executeContentAction,
    args: [action, params]
  });

  return result.result;
}

function executeContentAction(action, params) {
  switch (action) {
    case 'click':
      const clickElement = document.querySelector(params.selector);
      if (!clickElement) throw new Error(`Element not found: ${params.selector}`);
      clickElement.click();
      return { success: true };

    case 'fill':
      const fillElement = document.querySelector(params.selector);
      if (!fillElement) throw new Error(`Element not found: ${params.selector}`);
      fillElement.value = params.value;
      fillElement.dispatchEvent(new Event('input', { bubbles: true }));
      fillElement.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };

    case 'getText':
      if (params.selector) {
        const textElement = document.querySelector(params.selector);
        if (!textElement) throw new Error(`Element not found: ${params.selector}`);
        return { text: textElement.innerText };
      }
      return { text: document.body.innerText };

    case 'getHTML':
      if (params.selector) {
        const htmlElement = document.querySelector(params.selector);
        if (!htmlElement) throw new Error(`Element not found: ${params.selector}`);
        return { html: htmlElement.innerHTML };
      }
      return { html: document.documentElement.outerHTML };

    case 'evaluate':
      try {
        let evalResult = eval(params.code);
        // Convert to JSON-serializable format
        if (typeof evalResult === 'function') {
          evalResult = evalResult.toString();
        } else if (evalResult === undefined) {
          evalResult = null;
        }
        return { result: evalResult };
      } catch (e) {
        throw new Error(`Evaluation error: ${e.message}`);
      }

    default:
      throw new Error(`Unknown content action: ${action}`);
  }
}

async function navigateTab(url) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab) {
    throw new Error('No active tab found. Please ensure Edge browser window is open and in the foreground.');
  }

  await chrome.tabs.update(tab.id, { url });
  return { success: true, url, tabId: tab.id };
}

async function takeScreenshot(tabId) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const targetTabId = tabId || tabs[0]?.id;

  if (!targetTabId) {
    throw new Error('No active tab found. Please ensure Edge browser window is open and in the foreground.');
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
  return { screenshot: dataUrl };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab) {
    throw new Error('No active tab found. Please ensure Edge browser window is open and in the foreground.');
  }

  return { id: tab.id, url: tab.url, title: tab.title };
}

// Listen for popup messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkStatus') {
    sendResponse({ connected: isConnected });
    return true;
  }
});

// Initialize polling
startPolling();
console.log('Edge AI Assistant loaded (Polling mode)');
