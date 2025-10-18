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

    // Check 204 No Content first (no pending commands)
    if (response.status === 204) {
      if (!isConnected) {
        isConnected = true;
        console.log('[Polling] Connected to server');
      }
      return;
    }

    if (!response.ok) {
      // Server error
      console.error('[Polling] Server error:', response.status, response.statusText);
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
      case 'pressKey':
      case 'select':
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
      case 'waitForElement':
        result = await waitForElement(params);
        break;
      case 'waitForTimeout':
        result = await waitForTimeout(params.timeout);
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

  // Special handling for evaluate - execute in MAIN world to bypass CSP
  if (action === 'evaluate') {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      world: 'MAIN',
      func: (code) => {
        try {
          const evalResult = eval(code);
          return { result: evalResult };
        } catch (e) {
          throw new Error(`Evaluation error: ${e.message}`);
        }
      },
      args: [params.code]
    });
    return result.result;
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

    case 'pressKey':
      const target = params.selector ? document.querySelector(params.selector) : document.activeElement || document.body;
      if (params.selector && !target) throw new Error(`Element not found: ${params.selector}`);

      // Focus element if selector provided
      if (params.selector && target !== document.activeElement) {
        target.focus();
      }

      // Dispatch keyboard events
      const keyboardEvent = new KeyboardEvent('keydown', {
        key: params.key,
        code: params.key,
        bubbles: true,
        cancelable: true
      });
      target.dispatchEvent(keyboardEvent);

      const keypressEvent = new KeyboardEvent('keypress', {
        key: params.key,
        code: params.key,
        bubbles: true,
        cancelable: true
      });
      target.dispatchEvent(keypressEvent);

      const keyupEvent = new KeyboardEvent('keyup', {
        key: params.key,
        code: params.key,
        bubbles: true,
        cancelable: true
      });
      target.dispatchEvent(keyupEvent);

      return { success: true, key: params.key };

    case 'select':
      const selectElement = document.querySelector(params.selector);
      if (!selectElement) throw new Error(`Element not found: ${params.selector}`);
      if (selectElement.tagName !== 'SELECT') throw new Error(`Element is not a SELECT element: ${params.selector}`);

      selectElement.value = params.value;
      selectElement.dispatchEvent(new Event('change', { bubbles: true }));
      selectElement.dispatchEvent(new Event('input', { bubbles: true }));

      return { success: true, value: params.value };

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
      // Note: This case is now handled in executeInTab using MAIN world
      // to bypass CSP restrictions. This fallback should not be reached.
      throw new Error('Evaluate should be handled in MAIN world');

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

async function waitForElement(params) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const targetTabId = params.tabId || tabs[0]?.id;

  if (!targetTabId) {
    throw new Error('No active tab found. Please ensure Edge browser window is open and in the foreground.');
  }

  const timeout = params.timeout || 30000; // Default 30 seconds
  const interval = params.interval || 500; // Check every 500ms

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    func: (selector, timeout, interval) => {
      return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const checkElement = () => {
          const element = document.querySelector(selector);

          if (element) {
            resolve({
              success: true,
              found: true,
              selector: selector,
              waitTime: Date.now() - startTime
            });
          } else if (Date.now() - startTime >= timeout) {
            reject(new Error(`Element not found after ${timeout}ms: ${selector}`));
          } else {
            setTimeout(checkElement, interval);
          }
        };

        checkElement();
      });
    },
    args: [params.selector, timeout, interval]
  });

  return result.result;
}

async function waitForTimeout(timeout) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true, waited: timeout });
    }, timeout);
  });
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
console.log('Edge AI Assistant loaded (Polling mode v1.1.0 - with press_key, select, wait)');
