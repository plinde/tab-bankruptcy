async function focusBrowserWindow(windowId, updateWindow) {
  if (!Number.isInteger(windowId) || windowId < 0) {
    throw new Error('Invalid browser window identifier.');
  }

  await updateWindow(windowId, { focused: true });
  return { success: true, windowId };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { focusBrowserWindow };
}
