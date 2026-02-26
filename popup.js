// ─── Server URL (configurable via Settings tab) ───────────────────────────────
let SERVER_URL = 'https://web-production-1f057.up.railway.app';

// ─── Field Selector Map (fallback when no scan available) ─────────────────────
const FIELD_SELECTOR_MAP = {
  product_name:           { selector: 'input[id="product_name"]',           label: 'Product Name' },
  color:                  { selector: 'input[id="color"]',                   label: 'Color' },
  meesho_price:           { selector: 'input[id="meesho_price"]',            label: 'Meesho Price (₹)' },
  product_mrp:            { selector: 'input[id="product_mrp"]',             label: 'MRP (₹)' },
  only_wrong_return_price:{ selector: 'input[id="only_wrong_return_price"]', label: 'Wrong Return Price (₹)' },
  inventory:              { selector: 'input[id="inventory"]',               label: 'Inventory (qty)' },
  supplier_gst_percent:   { selector: 'input[id="supplier_gst_percent"]',    label: 'GST (%)' },
  hsn_code:               { selector: 'input[id="hsn_code"]',                label: 'HSN Code' },
  product_weight_in_gms:  { selector: 'input[id="product_weight_in_gms"]',   label: 'Weight (gms)' },
  supplier_product_id:    { selector: 'input[id="supplier_product_id"]',     label: 'Supplier Product ID' },
  category:               { selector: 'input[id="category"]',                label: 'Category' },
  brand:                  { selector: 'input[id="brand"]',                   label: 'Brand' },
  description:            { selector: 'textarea[id="description"]',          label: 'Description' },
};

// ─── State ────────────────────────────────────────────────────────────────────
let scannedFields  = null;  // fields captured from Meesho page via SCAN_FORM
let generatedFields = [];   // [{selector, value}] returned by AI

// ─── DOM Ready ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ── Load saved server URL from storage ────────────────────────────────────
  chrome.storage.sync.get(['serverUrl'], (result) => {
    if (result.serverUrl) {
      SERVER_URL = result.serverUrl.replace(/\/$/, ''); // strip trailing slash
    }
    const serverUrlInput = document.getElementById('serverUrlInput');
    if (serverUrlInput) serverUrlInput.value = SERVER_URL;
  });

  // ── Tab Switching ──────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // ── Settings Tab: Save Server URL ─────────────────────────────────────────
  const saveServerUrlBtn = document.getElementById('saveServerUrlBtn');
  const settingsStatus   = document.getElementById('settings-status');
  saveServerUrlBtn.addEventListener('click', () => {
    const input = document.getElementById('serverUrlInput').value.trim().replace(/\/$/, '');
    if (!input || !input.startsWith('http')) {
      showStatus(settingsStatus, '❌ Please enter a valid URL starting with http:// or https://', 'error');
      return;
    }
    chrome.storage.sync.set({ serverUrl: input }, () => {
      SERVER_URL = input;
      showStatus(settingsStatus, `✅ Server URL saved: ${input}`, 'success');
    });
  });

  // ── IMAGE TAB ──────────────────────────────────────────────────────────────
  const generateFromImageBtn = document.getElementById('generateFromImage');
  const fileInput            = document.getElementById('aiImage');
  const imageResult          = document.getElementById('image-result');
  const imageStatus          = document.getElementById('image-status');
  const imgScanFormBtn       = document.getElementById('imgScanFormBtn');
  const imgScanBadge         = document.getElementById('img-scan-badge');
  const imgAutofillBtn       = document.getElementById('imgAutofillBtn');
  const imgMeeshoPriceInput  = document.getElementById('imgMeeshoPrice');

  let imgScannedFields  = null;
  let imgGeneratedFields = [];

  // ── Image Tab: Scan Form ───────────────────────────────────────────────────
  imgScanFormBtn.addEventListener('click', async () => {
    setButtonLoading(imgScanFormBtn, true, 'Scanning...', true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.includes('supplier.meesho.com')) {
        imgScanBadge.className = 'scan-badge none';
        imgScanBadge.textContent = '⚠ Please open the Meesho supplier listing page first';
        return;
      }
      try { await chrome.tabs.sendMessage(tab.id, { action: 'PING' }); }
      catch (e) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selector-utils.js', 'content.js'] });
        await new Promise(r => setTimeout(r, 600));
      }
      const result = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_FORM' });
      if (result && result.success && result.fields && result.fields.length > 0) {
        imgScannedFields = result.fields;
        imgScanBadge.className = 'scan-badge found';
        imgScanBadge.textContent = `✅ ${result.fields.length} fields found`;
      } else {
        imgScannedFields = null;
        imgScanBadge.className = 'scan-badge none';
        imgScanBadge.textContent = '⚠ No fields found — make sure you are on the listing add/edit page';
      }
    } catch (err) {
      console.error('Img scan error:', err);
      imgScanBadge.className = 'scan-badge none';
      imgScanBadge.textContent = '⚠ Scan failed — refresh the Meesho page and try again';
    } finally {
      setButtonLoading(imgScanFormBtn, false, '📋 Scan Meesho Form Fields');
    }
  });

  // ── Image Tab: Generate & Autofill ────────────────────────────────────────
  generateFromImageBtn.addEventListener('click', async () => {
    if (!fileInput.files.length) {
      showStatus(imageStatus, 'Please select an image first.', 'error');
      return;
    }
    const formData = new FormData();
    formData.append('image', fileInput.files[0]);
    setButtonLoading(generateFromImageBtn, true, 'Analyzing Image...');
    imageResult.style.display = 'none';
    imgAutofillBtn.style.display = 'none';
    clearStatus(imageStatus);
    imgGeneratedFields = [];

    try {
      // Step 1: Analyze image → get text description
      const response = await fetch(`${SERVER_URL}/generate`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Server responded with status ' + response.status);
      const data = await response.json();

      if (!data.success) {
        showStatus(imageStatus, '❌ ' + (data.error || 'Image analysis failed.'), 'error');
        return;
      }

      const imageDescription = data.result;
      imageResult.textContent = imageDescription;
      imageResult.style.display = 'block';

      // Step 2: If scanned fields available, generate structured fields from image description
      if (imgScannedFields && imgScannedFields.length > 0) {
        showStatus(imageStatus, '🤖 Generating listing fields from image analysis...', 'info');

        const priceOverride = imgMeeshoPriceInput.value.trim();
        const descWithPrice = priceOverride
          ? imageDescription + ` Meesho price: ₹${priceOverride}.`
          : imageDescription;

        const formResp = await fetch(`${SERVER_URL}/generate-from-form`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: descWithPrice, formFields: imgScannedFields })
        });

        if (formResp.ok) {
          const formData2 = await formResp.json();
          if (formData2.success && formData2.fields) {
            let fields = formData2.fields;

            // Apply price override
            if (priceOverride) {
              fields = applyPriceOverride(fields, priceOverride);
            }

            imgGeneratedFields = fields;
            imgAutofillBtn.style.display = 'block';
            showStatus(imageStatus, `✅ Image analyzed! ${fields.length} fields generated. Click Autofill to fill the form.`, 'success');
          } else {
            showStatus(imageStatus, '✅ Image analyzed! Click Autofill to fill the form.', 'success');
          }
        } else {
          showStatus(imageStatus, '✅ Image analyzed! (Scan form first for autofill)', 'success');
        }
      } else {
        showStatus(imageStatus, '✅ Image analyzed! Scan the Meesho form first, then click Generate again to autofill.', 'success');
      }

    } catch (err) {
      console.error('Image generate error:', err);
      showStatus(imageStatus, `❌ Could not connect to server at ${SERVER_URL}`, 'error');
    } finally {
      setButtonLoading(generateFromImageBtn, false, '✨ Analyze Image & Generate');
    }
  });

  // ── Image Tab: Autofill Button ─────────────────────────────────────────────
  imgAutofillBtn.addEventListener('click', async () => {
    if (!imgGeneratedFields.length) {
      showStatus(imageStatus, 'No fields to autofill. Please generate first.', 'error');
      return;
    }
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.includes('supplier.meesho.com')) {
        showStatus(imageStatus, '⚠️ Please open the Meesho supplier listing page first.', 'error');
        return;
      }
      try { await chrome.tabs.sendMessage(tab.id, { action: 'PING' }); }
      catch (e) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selector-utils.js', 'content.js'] });
        await new Promise(r => setTimeout(r, 600));
      }
      await chrome.tabs.sendMessage(tab.id, { action: 'AUTOFILL', data: { fields: imgGeneratedFields, force: true } });
      showStatus(imageStatus, '🚀 Autofill started on Meesho tab!', 'success');
    } catch (err) {
      console.error('Img autofill error:', err);
      showStatus(imageStatus, '❌ Autofill failed: ' + err.message, 'error');
    }
  });

  // ── TEXT TAB ───────────────────────────────────────────────────────────────
  const scanFormBtn         = document.getElementById('scanFormBtn');
  const scanBadge           = document.getElementById('scan-badge');
  const generateFromTextBtn = document.getElementById('generateFromText');
  const descriptionInput    = document.getElementById('productDescription');
  const textStatus          = document.getElementById('text-status');
  const fieldsPanel         = document.getElementById('fields-panel');
  const fieldsList          = document.getElementById('fields-list');
  const autofillBtn         = document.getElementById('autofillBtn');
  const saveProfileBtn      = document.getElementById('saveProfileBtn');

  // ── STEP 1: Scan Form Fields ───────────────────────────────────────────────
  scanFormBtn.addEventListener('click', async () => {
    setButtonLoading(scanFormBtn, true, 'Scanning...', true);
    clearStatus(textStatus);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url || !tab.url.includes('supplier.meesho.com')) {
        scanBadge.className = 'scan-badge none';
        scanBadge.textContent = '⚠ Please open the Meesho supplier listing page first';
        setButtonLoading(scanFormBtn, false, '📋 Scan Meesho Form Fields');
        return;
      }

      // Ensure content script is injected
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'PING' });
      } catch (e) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selector-utils.js', 'content.js'] });
        await new Promise(r => setTimeout(r, 600));
      }

      const result = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_FORM' });

      if (result && result.success && result.fields && result.fields.length > 0) {
        scannedFields = result.fields;
        scanBadge.className = 'scan-badge found';
        scanBadge.textContent = `✅ ${result.fields.length} fields found on Meesho form`;
        showStatus(textStatus, `✅ Scanned ${result.fields.length} form fields. Now describe your product and click Generate & Autofill.`, 'success');
      } else {
        scannedFields = null;
        scanBadge.className = 'scan-badge none';
        scanBadge.textContent = '⚠ No fields found — make sure you are on the listing add/edit page';
      }
    } catch (err) {
      console.error('Scan error:', err);
      scannedFields = null;
      scanBadge.className = 'scan-badge none';
      scanBadge.textContent = '⚠ Scan failed — refresh the Meesho page and try again';
    } finally {
      setButtonLoading(scanFormBtn, false, '📋 Scan Meesho Form Fields');
    }
  });

  // ── STEP 3: Generate & Autofill ────────────────────────────────────────────
  generateFromTextBtn.addEventListener('click', async () => {
    const description = descriptionInput.value.trim();
    if (!description) {
      showStatus(textStatus, 'Please enter a product description first.', 'error');
      return;
    }

    setButtonLoading(generateFromTextBtn, true, 'Generating...');
    clearStatus(textStatus);
    fieldsPanel.style.display = 'none';
    autofillBtn.style.display = 'none';
    saveProfileBtn.style.display = 'none';
    fieldsList.innerHTML = '';
    generatedFields = [];

    const priceOverride = document.getElementById('txtMeeshoPrice').value.trim();

    try {
      let fields = [];

      if (scannedFields && scannedFields.length > 0) {
        // ── Smart path: use actual scanned form fields ──────────────────────
        showStatus(textStatus, '🤖 Sending scanned fields + description to AI...', 'info');

        // Append price to description if user specified it
        const descWithPrice = priceOverride
          ? description + ` Meesho price: ₹${priceOverride}.`
          : description;

        const response = await fetch(`${SERVER_URL}/generate-from-form`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: descWithPrice, formFields: scannedFields })
        });

        if (!response.ok) throw new Error('Server responded with status ' + response.status);
        const data = await response.json();

        if (!data.success) {
          showStatus(textStatus, '❌ ' + (data.error || 'Failed to generate listing.'), 'error');
          return;
        }

        fields = data.fields; // [{selector, value}]

        // Apply price override — force the meesho_price field to user's value
        if (priceOverride) {
          fields = applyPriceOverride(fields, priceOverride);
        }

        generatedFields = fields;

        // Render fields for review
        renderFieldsFromArray(fields, fieldsList);
        fieldsPanel.style.display = 'block';
        autofillBtn.style.display = 'block';
        saveProfileBtn.style.display = 'block';
        showStatus(textStatus, `✅ AI generated ${fields.length} field values. Review below, then click Autofill.`, 'success');

      } else {
        // ── Fallback path: use hardcoded selectors ──────────────────────────
        showStatus(textStatus, '🤖 Generating listing (tip: scan form first for better results)...', 'info');

        const descWithPrice = priceOverride
          ? description + ` Meesho price: ₹${priceOverride}.`
          : description;

        const response = await fetch(`${SERVER_URL}/generate-from-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: descWithPrice })
        });

        if (!response.ok) throw new Error('Server responded with status ' + response.status);
        const data = await response.json();

        if (!data.success || !data.fields) {
          showStatus(textStatus, '❌ ' + (data.error || 'Failed to generate listing.'), 'error');
          return;
        }

        // Convert fields object to [{selector, value}] array
        fields = Object.entries(data.fields)
          .filter(([, v]) => v && v.trim())
          .map(([key, value]) => {
            const meta = FIELD_SELECTOR_MAP[key];
            return { selector: meta ? meta.selector : `input[id="${key}"]`, value, label: meta ? meta.label : key };
          });

        // Apply price override
        if (priceOverride) {
          fields = applyPriceOverride(fields, priceOverride);
        }

        generatedFields = fields;
        renderFieldsFromArray(fields, fieldsList);
        fieldsPanel.style.display = 'block';
        autofillBtn.style.display = 'block';
        saveProfileBtn.style.display = 'block';
        showStatus(textStatus, `✅ Generated ${fields.length} fields. Review below, then click Autofill.`, 'success');
      }

    } catch (err) {
      console.error('Text generate error:', err);
      showStatus(textStatus, `❌ Could not connect to server at ${SERVER_URL}`, 'error');
    } finally {
      setButtonLoading(generateFromTextBtn, false, '✨ Generate & Autofill');
    }
  });

  // ── Autofill Button ────────────────────────────────────────────────────────
  autofillBtn.addEventListener('click', async () => {
    const fields = collectFieldsFromUI();
    if (!fields.length) {
      showStatus(textStatus, 'No fields to autofill.', 'error');
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url || !tab.url.includes('supplier.meesho.com')) {
        showStatus(textStatus, '⚠️ Please open the Meesho supplier listing page first, then click Autofill.', 'error');
        return;
      }

      // Ensure content script is ready
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'PING' });
      } catch (e) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selector-utils.js', 'content.js'] });
        await new Promise(r => setTimeout(r, 600));
      }

      await chrome.tabs.sendMessage(tab.id, {
        action: 'AUTOFILL',
        data: { fields, force: true }
      });

      showStatus(textStatus, '🚀 Autofill started on Meesho tab! Watch the form fill automatically.', 'success');
    } catch (err) {
      console.error('Autofill error:', err);
      showStatus(textStatus, '❌ Autofill failed: ' + err.message, 'error');
    }
  });

  // ── Save Profile Button ────────────────────────────────────────────────────
  saveProfileBtn.addEventListener('click', async () => {
    const fields = collectFieldsFromUI();
    if (!fields.length) return;

    const profileName = prompt('Enter a name for this profile:', 'AI Generated - ' + new Date().toLocaleDateString());
    if (!profileName) return;

    const profileId = 'ai_' + Date.now();
    chrome.runtime.sendMessage({
      action: 'SAVE_AI_PROFILE',
      payload: { profileId, profileName, fields }
    }, (res) => {
      if (res && res.success) {
        showStatus(textStatus, `💾 Profile "${profileName}" saved!`, 'success');
      } else {
        showStatus(textStatus, '❌ Failed to save profile.', 'error');
      }
    });
  });

});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Renders editable field rows from [{selector, value, label?}] array.
 */
function renderFieldsFromArray(fields, container) {
  container.innerHTML = '';
  for (const field of fields) {
    const label = field.label || field.selector;

    const row = document.createElement('div');
    row.className = 'field-row';
    row.dataset.selector = field.selector;

    const labelEl = document.createElement('div');
    labelEl.className = 'field-label';
    labelEl.textContent = label;
    labelEl.title = field.selector;

    const inputEl = document.createElement('input');
    inputEl.className = 'field-value';
    inputEl.type = 'text';
    inputEl.value = String(field.value || '');
    inputEl.dataset.selector = field.selector;

    row.appendChild(labelEl);
    row.appendChild(inputEl);
    container.appendChild(row);
  }
}

/**
 * Collects current values from the rendered field inputs.
 * Returns [{selector, value}] for content.js autofillProfile().
 */
function collectFieldsFromUI() {
  const inputs = document.querySelectorAll('#fields-list .field-value');
  const fields = [];
  inputs.forEach(input => {
    const selector = input.dataset.selector;
    const value = input.value.trim();
    if (selector && value) {
      fields.push({ selector, value });
    }
  });
  return fields;
}

/**
 * Overrides the meesho_price field in a [{selector, value}] array with user-specified price.
 * Also sets product_mrp to the same value if present.
 */
function applyPriceOverride(fields, price) {
  const priceStr = String(price).trim();
  let hasPriceField = false;
  const updated = fields.map(f => {
    const sel = f.selector || '';
    if (sel.includes('meesho_price') || (f.label && f.label.toLowerCase().includes('meesho price'))) {
      hasPriceField = true;
      return { ...f, value: priceStr };
    }
    return f;
  });
  // If no meesho_price field found in scanned fields, inject it
  if (!hasPriceField) {
    updated.push({ selector: 'input[id="meesho_price"]', value: priceStr, label: 'Meesho Price (₹)' });
  }
  return updated;
}

/** Shows a status message. */
function showStatus(el, msg, type) {
  el.textContent = msg;
  el.className = 'status ' + type;
}

/** Clears a status message. */
function clearStatus(el) {
  el.textContent = '';
  el.className = 'status';
}

/** Sets a button into loading/normal state. */
function setButtonLoading(btn, loading, label, darkSpinner = false) {
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner${darkSpinner ? ' spinner-dark' : ''}"></span>${label}`;
  } else {
    btn.disabled = false;
    btn.textContent = label;
  }
}
