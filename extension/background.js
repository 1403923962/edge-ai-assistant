/**
 * Background script - Communicates with Native Messaging Host
 */

const NATIVE_HOST_NAME = 'com.edge.ai.assistant';
let nativePort = null;
let isConnected = false;

// Connect to native host
function connectNativeHost() {
  console.log('Connecting to native host:', NATIVE_HOST_NAME);

  nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

  nativePort.onMessage.addListener((message) => {
    console.log('Received from native host:', message);
    handleNativeMessage(message);
  });

  nativePort.onDisconnect.addListener(() => {
    console.error('Disconnected from native host');
    console.error('Last error:', chrome.runtime.lastError);
    isConnected = false;
    nativePort = null;

    // Retry connection after 5 seconds
    setTimeout(connectNativeHost, 5000);
  });

  isConnected = true;
  console.log('Connected to native host');
}

// Handle messages from native host
async function handleNativeMessage(message) {
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

    sendToNativeHost({
      type: 'response',
      id,
      success: true,
      result
    });
  } catch (error) {
    sendToNativeHost({
      type: 'response',
      id,
      success: false,
      error: error.message
    });
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

  return new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve({ success: true, url });
      }
    });
  });
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

// Send message to native host
function sendToNativeHost(message) {
  if (nativePort && isConnected) {
    nativePort.postMessage(message);
  } else {
    console.error('Not connected to native host');
  }
}

// Send event to native host
function sendEvent(eventType, data) {
  sendToNativeHost({
    type: 'event',
    eventType,
    data
  });
}

// Listen for tab updates (page loads)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    sendEvent('page_load', {
      tabId,
      url: tab.url,
      title: tab.title,
      timestamp: Date.now()
    });
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  sendEvent('tab_activated', {
    tabId: activeInfo.tabId,
    url: tab.url,
    title: tab.title,
    timestamp: Date.now()
  });
});

// Listen for navigation (before page load)
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) { // Main frame only
    sendEvent('navigation', {
      tabId: details.tabId,
      url: details.url,
      transitionType: details.transitionType,
      timestamp: Date.now()
    });
  }
});

// Initialize
connectNativeHost();

// Log when extension loaded
console.log('Edge AI Assistant loaded');
