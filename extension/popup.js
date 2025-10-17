// Check connection status
chrome.runtime.sendMessage({ action: 'checkStatus' }, (response) => {
  const statusDiv = document.getElementById('status');

  if (response && response.connected) {
    statusDiv.className = 'status connected';
    statusDiv.textContent = '✓ Connected to Native Host';
  } else {
    statusDiv.className = 'status disconnected';
    statusDiv.textContent = '✗ Not Connected';
  }
});
