/**
 * Tab Actions - Execute actions in content scripts
 */

class TabActions {
  async execute(action, params) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const targetTabId = params.tabId || tabs[0]?.id;

    if (!targetTabId) {
      throw new Error('No active tab found');
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: this._executeContentAction,
      args: [action, params]
    });

    return result.result;
  }

  _executeContentAction(action, params) {
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

  async navigate(url) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { url });
    return { success: true, url, tabId: tab.id };
  }

  async screenshot(tabId) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const targetTabId = tabId || tabs[0]?.id;
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    return { screenshot: dataUrl };
  }

  async getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title
    };
  }
}
