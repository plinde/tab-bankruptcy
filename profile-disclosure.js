// Format the "Running as: ..." disclosure line shown in the popup.
//
// Pure function (no chrome.* calls) so it can be unit-tested in Node without a
// browser. Takes the object chrome.identity.getProfileUserInfo() resolves to
// (`{ email, id }`) — or any falsy/partial value — and returns the text to
// display. An extension can only ever read the CURRENT profile's account
// email; the Chrome profile display name and other profiles are unreachable.
function formatProfileDisclosure(userInfo) {
  const email = userInfo && typeof userInfo.email === 'string' ? userInfo.email.trim() : '';
  if (email) {
    return `Running as: ${email}`;
  }
  return 'Running as: this Chrome profile (not signed in)';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatProfileDisclosure };
}
