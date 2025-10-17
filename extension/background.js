/**
 * Background script - Communicates with HTTP server (no Native Messaging)
 */

const HTTP_SERVER_URL = 'http://localhost:9999';
let eventSource = null;
let isConnected = false;

// Connect to HTTP server via SSE
function connectToServer() {
  console.log('Connecting to HTTP server:', HTTP_SERVER_URL);

  try {
    eventSource = new EventSource(`${HTTP_SERVER_URL}/events`);

    eventSource.onopen = () => {
      isConnected = true;
      console.log('Connected to HTTP server');
    };

    eventSource.onmessage = (event) => {
      console.log('Received message:', event.data);
      try {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      isConnected = false;

      if (eventSource) {
        eventSource.close();
      }

      // Retry connection after 5 seconds
      setTimeout(connectToServer, 5000);
    };
  } catch (error) {
    console.error('Failed to connect:', error);
    setTimeout(connectToServer, 5000);
  }
}

// Handle messages from HTTP server
async function handleServerMessage(message) {
  const { id, action, params } = message;

  try {
    let result;

    switch (action) {
      case 'click':
        result = await executeInTab(params.tabId, 'click', params);
        break;

      case 'fill':
        result = await executeInTab(params.tabId, 'fill', params);
        break;

      case 'getText':
        result = await executeInTab(params.tabId, 'getText', params);
        break;

      case 'getHTML':
        result = await executeInTab(params.tabId, 'getHTML', params);
        break;

      case 'navigate':
        result = await navigateTab(params.url);
        break;

      case 'screenshot':
        result = await takeScreenshot(params.tabId);
        break;

      case 'evaluate':
        result = await executeInTab(params.tabId, 'evaluate', params);
        break;

      case 'getActiveTab':
        result = await getActiveTab();
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Send response back via HTTP POST
    await sendResponse(id, { success: true, result });
  } catch (error) {
    await sendResponse(id, { success: false, error: error.message });
  }
}

// Send response back to server
async function sendResponse(id, data) {
  try {
    const response = await fetch(`${HTTP_SERVER_URL}/response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...data })
    });

    if (!response.ok) {
      console.error('Failed to send response:', response.statusText);
    }
  } catch (error) {
    console.error('Failed to send response:', error);
  }
}

// Execute action in content script
async function executeInTab(tabId, action, params) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const targetTabId = tabId || tabs[0]?.id;

  if (!targetTabId) {
    throw new Error('No active tab found');
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    func: executeContentAction,
    args: [action, params]
  });

  return result.result;
}

// Function injected into page
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
      const evalResult = eval(params.code);
      return { result: evalResult };

    default:
      throw new Error(`Unknown content action: ${action}`);
  }
}

// Navigate to URL
async function navigateTab(url) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  await chrome.tabs.update(tab.id, { url });

  return { success: true, url, tabId: tab.id };
}

// Take screenshot
async function takeScreenshot(tabId) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const targetTabId = tabId || tabs[0]?.id;

  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

  return { screenshot: dataUrl };
}

// Get active tab info
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  return {
    id: tab.id,
    url: tab.url,
    title: tab.title
  };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkStatus') {
    sendResponse({ connected: isConnected });
    return true;
  }
});

// Initialize
connectToServer();

// Log when extension loaded
console.log('Edge AI Assistant loaded (HTTP mode)');
