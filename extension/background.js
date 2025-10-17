/**
 * Background script (Refactored) - HTTP mode
 */

// Import would require build system, so inline for now
const HTTP_SERVER_URL = 'http://localhost:9999';
let eventSource = null;
let isConnected = false;

// Connection management
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
      if (eventSource) eventSource.close();
      setTimeout(connectToServer, 5000);
    };
  } catch (error) {
    console.error('Failed to connect:', error);
    setTimeout(connectToServer, 5000);
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
        result = await navigateTab(params.url, params.tabId);
        break;
      case 'screenshot':
        result = await takeScreenshot(params.tabId, params.selector);
        break;
      case 'getActiveTab':
        result = await getActiveTab();
        break;
      case 'listTabs':
        result = await listAllTabs();
        break;
      case 'switchTab':
        result = await switchToTab(params.tabId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    await sendResponse(id, { success: true, result });
  } catch (error) {
    await sendResponse(id, { success: false, error: error.message });
  }
}

// Send response
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

// Tab actions
async function executeInTab(tabId, action, params) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const targetTabId = tabId || tabs[0]?.id;

  if (!targetTabId) throw new Error('No active tab found');

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
      const evalResult = eval(params.code);
      return { result: evalResult };

    default:
      throw new Error(`Unknown content action: ${action}`);
  }
}

async function navigateTab(url, tabId) {
  let targetTabId = tabId;

  // If no tabId specified, use active tab
  if (!targetTabId) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTabId = tabs[0]?.id;
  }

  if (!targetTabId) {
    throw new Error('No tab found');
  }

  await chrome.tabs.update(targetTabId, { url });
  return { success: true, url, tabId: targetTabId };
}

async function takeScreenshot(tabId, selector) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const targetTabId = tabId || tabs[0]?.id;

  // If no selector, return full screenshot
  if (!selector) {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    return { screenshot: dataUrl };
  }

  // For element screenshot, use content script to crop
  // First capture full page
  const fullScreenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

  // Then crop in content script (has access to DOM APIs)
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    func: cropImageInPage,
    args: [fullScreenshot, selector]
  });

  return { screenshot: result.result };
}

// This function runs in the page context where Image and Canvas are available
function cropImageInPage(dataUrl, selector) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (!element) {
      reject(new Error(`Element not found: ${selector}`));
      return;
    }

    const rect = element.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext('2d');

      ctx.drawImage(
        img,
        rect.x * dpr,
        rect.y * dpr,
        rect.width * dpr,
        rect.height * dpr,
        0,
        0,
        rect.width * dpr,
        rect.height * dpr
      );

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load screenshot'));
    img.src = dataUrl;
  });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  return { id: tab.id, url: tab.url, title: tab.title };
}

async function listAllTabs() {
  const tabs = await chrome.tabs.query({});
  return {
    tabs: tabs.map(tab => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      windowId: tab.windowId,
      index: tab.index
    }))
  };
}

async function switchToTab(tabId) {
  if (!tabId) {
    throw new Error('tabId is required');
  }

  // Get tab info
  const tab = await chrome.tabs.get(tabId);

  // Switch to the window containing this tab
  await chrome.windows.update(tab.windowId, { focused: true });

  // Activate the tab
  await chrome.tabs.update(tabId, { active: true });

  return {
    success: true,
    id: tab.id,
    url: tab.url,
    title: tab.title
  };
}

// Listen for popup messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkStatus') {
    sendResponse({ connected: isConnected });
    return true;
  }
});

// Initialize
connectToServer();
console.log('Edge AI Assistant loaded (HTTP mode)');
