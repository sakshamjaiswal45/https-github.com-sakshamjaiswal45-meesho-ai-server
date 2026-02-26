async function handleSaveField(e){try{const{profileId:r,field:t}=e;if(!r||!t)return!1;let s=(await chrome.storage.local.get(["profiles"])).profiles||{};if(!s[r])return!1;const i=s[r].fields.findIndex(e=>e.selector===t.selector);return i>-1?s[r].fields[i]=t:s[r].fields.push(t),await chrome.storage.local.set({profiles:s}),!0}catch(e){return!1}}

async function handleSaveAIProfile(payload) {
  try {
    const { profileId, profileName, fields } = payload;
    if (!profileId || !profileName || !fields) return false;
    const data = await chrome.storage.local.get(['profiles']);
    const profiles = data.profiles || {};
    profiles[profileId] = {
      id: profileId,
      name: profileName,
      fields: fields,
      createdAt: Date.now(),
      source: 'ai-text'
    };
    await chrome.storage.local.set({ profiles });
    return true;
  } catch (e) {
    return false;
  }
}

chrome.runtime.onMessage.addListener((e, r, t) => {
  if ('SAVE_FIELD' === e.action) {
    return handleSaveField(e.payload).then(e => { t({ success: e }); }), true;
  }
  if ('SAVE_AI_PROFILE' === e.action) {
    return handleSaveAIProfile(e.payload).then(result => { t({ success: result }); }), true;
  }
});
