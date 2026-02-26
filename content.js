const ALLOWED_ORIGIN="https://supplier.meesho.com",CATALOG_PAGE_PATTERN=/\/panel\/v3\/new\/cataloging\/[^\/]+\/catalogs\/single\/(add|edit)/;
function isValidDomain(){return window.location.origin===ALLOWED_ORIGIN}
function isCatalogPage(){return CATALOG_PAGE_PATTERN.test(window.location.pathname)}
isValidDomain()&&isCatalogPage();

let highlightOverlay=null,stopCaptureButton=null,stopAutofillButton=null,isCaptureMode=false,isAutofilling=false,shouldStopAutofill=false,currentProfileId=null;

function initializeUI(){
  if(isValidDomain()){
    highlightOverlay=createOverlay();
    stopCaptureButton=createStopCaptureButton();
    stopAutofillButton=createStopAutofillButton();
  }
}

// ── Selector Parsing ──────────────────────────────────────────────────────────
function parseAndQuerySelector(sel){
  if(!sel)return null;

  // MUISELECT:Label — finds MUI Select div by label text
  if(sel.startsWith("MUISELECT:")){
    const labelText=sel.slice(10).trim().toLowerCase().replace(/\s*\*\s*$/,"").trim();
    const fcs=document.querySelectorAll(".MuiFormControl-root");
    for(const fc of fcs){
      const lbl=fc.querySelector(".MuiFormLabel-root,.MuiInputLabel-root,label");
      if(lbl){
        const lt=lbl.innerText.trim().toLowerCase().replace(/\s*\*\s*$/,"").trim();
        if(lt===labelText||lt.includes(labelText)||labelText.includes(lt)){
          const btn=fc.querySelector('div[role="button"][aria-haspopup="listbox"],div.MuiSelect-select[role="button"]');
          if(btn)return btn;
        }
      }
    }
    return null;
  }

  // SIZE:rowLabel::selector
  if(sel.startsWith("SIZE:")){
    const m=sel.match(/^SIZE:(.+?)::(.+)$/);
    if(!m)return null;
    const rowLabel=m[1],innerSel=m[2];
    const rows=document.querySelectorAll(".css-1hw3sau");
    for(const row of rows){
      const p=row.querySelector("p.css-twqx64");
      if(p&&p.innerText.trim()===rowLabel){
        const el=row.querySelector(innerSel);
        if(el)return el;
      }
    }
    return null;
  }

  // selector||index
  const parts=sel.split("||");
  const baseSel=parts[0];
  const idx=parts.length>1?parseInt(parts[1],10):0;
  const all=document.querySelectorAll(baseSel);
  return all.length===0?null:(all[idx]||null);
}

function waitForElement(sel,timeout=300){
  return new Promise(resolve=>{
    const find=()=>parseAndQuerySelector(sel);
    const el=find();
    if(el)return resolve(el);
    const obs=new MutationObserver(()=>{const e=find();if(e){obs.disconnect();resolve(e);}});
    obs.observe(document.body,{childList:true,subtree:true});
    setTimeout(()=>{obs.disconnect();resolve(null);},timeout);
  });
}

function waitForTextElement(text,timeout=2500){
  return new Promise(resolve=>{
    const needle=text.toLowerCase().trim();
    const find=()=>{
      const els=document.querySelectorAll('li[role="option"],li,div[role="option"],p,span');
      for(const el of els){
        if(el.offsetParent===null)continue;
        const t=el.innerText?el.innerText.toLowerCase().trim():"";
        if(t===needle||t.includes(needle))return el;
      }
      return null;
    };
    const found=find();
    if(found)return resolve(found);
    const obs=new MutationObserver(()=>{const e=find();if(e){obs.disconnect();resolve(e);}});
    obs.observe(document.body,{childList:true,subtree:true});
    setTimeout(()=>{obs.disconnect();resolve(null);},timeout);
  });
}

function setNativeValue(el,val){
  const nativeSetter=Object.getOwnPropertyDescriptor(el,"value")?.set;
  const proto=Object.getPrototypeOf(el);
  const protoSetter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
  if(nativeSetter&&nativeSetter!==protoSetter||protoSetter){
    protoSetter.call(el,val);
  } else {
    el.value=val;
  }
}

// ── UI Helpers ────────────────────────────────────────────────────────────────
function createOverlay(){
  const el=document.createElement("div");
  el.style.cssText="position:absolute;background:rgba(106,27,154,0.3);border:2px solid #6a1b9a;pointer-events:none;z-index:999999;display:none;transition:all 0.1s ease;";
  document.body.appendChild(el);
  return el;
}

function showToast(msg,isError=false){
  const el=document.createElement("div");
  el.innerText=msg;
  el.style.cssText=`position:fixed;bottom:20px;right:20px;background:${isError?"linear-gradient(180deg,#ff4444 0%,#cc0000 100%)":"linear-gradient(180deg,#00ff88 0%,#00cc6a 100%)"};color:${isError?"#fff":"#000"};padding:12px 20px;font-family:'VT323',monospace;font-size:16px;font-weight:bold;border:2px solid ${isError?"#ff6666":"#33ff9f"};z-index:1000000;box-shadow:0 4px 12px rgba(0,0,0,0.4);opacity:0;transition:opacity 0.3s;text-transform:uppercase;letter-spacing:1px;`;
  document.body.appendChild(el);
  requestAnimationFrame(()=>el.style.opacity="1");
  setTimeout(()=>{el.style.opacity="0";setTimeout(()=>el.remove(),300);},3000);
}

function showFillEffect(el){
  if(!el)return;
  const origOutline=el.style.outline,origShadow=el.style.boxShadow,origTrans=el.style.transition;
  el.style.transition="all 0.2s ease";
  el.style.outline="3px solid #00ff88";
  el.style.boxShadow="0 0 20px #00ff88,0 0 40px #00ff8866,inset 0 0 10px #00ff8833";
  const badge=document.createElement("div");
  badge.innerText="\u2713 FILLED";
  const r=el.getBoundingClientRect();
  badge.style.cssText=`position:absolute;left:${r.left+window.scrollX}px;top:${r.top+window.scrollY-30}px;background:linear-gradient(180deg,#00ff88 0%,#00cc6a 100%);color:#000;padding:4px 12px;font-family:'VT323',monospace;font-size:14px;font-weight:bold;border:2px solid #33ff9f;z-index:1000000;animation:floatUp 0.8s ease-out forwards;pointer-events:none;`;
  document.body.appendChild(badge);
  setTimeout(()=>{el.style.outline=origOutline;el.style.boxShadow=origShadow;el.style.transition=origTrans;},500);
  setTimeout(()=>badge.remove(),800);
}

function showSkipEffect(el){
  if(!el)return;
  const origOutline=el.style.outline,origShadow=el.style.boxShadow;
  el.style.outline="2px solid #ffaa00";
  el.style.boxShadow="0 0 10px #ffaa0066";
  const badge=document.createElement("div");
  badge.innerText="\xbb SKIP";
  const r=el.getBoundingClientRect();
  badge.style.cssText=`position:absolute;left:${r.left+window.scrollX}px;top:${r.top+window.scrollY-25}px;background:linear-gradient(180deg,#ffaa00 0%,#cc8800 100%);color:#000;padding:3px 10px;font-family:'VT323',monospace;font-size:12px;font-weight:bold;border:2px solid #ffcc44;z-index:1000000;animation:floatUp 0.5s ease-out forwards;pointer-events:none;`;
  document.body.appendChild(badge);
  setTimeout(()=>{el.style.outline=origOutline;el.style.boxShadow=origShadow;},300);
  setTimeout(()=>badge.remove(),500);
}

function showNotFoundEffect(sel){
  const el=document.createElement("div");
  const short=sel.length>30?"..."+sel.slice(-27):sel;
  el.innerHTML=`<span style="color:#ff6666">\u2715</span> NOT FOUND: ${short}`;
  el.style.cssText="position:fixed;top:70px;left:50%;transform:translateX(-50%);background:linear-gradient(180deg,#444 0%,#222 100%);color:#ff6666;padding:6px 16px;font-family:'VT323',monospace;font-size:14px;font-weight:bold;border:2px solid #666;z-index:1000000;animation:fadeOut 1s ease-out forwards;pointer-events:none;white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis;";
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),1000);
}

function initVisualEffectStyles(){
  if(document.getElementById("meesho-autofill-styles"))return;
  const s=document.createElement("style");
  s.id="meesho-autofill-styles";
  s.textContent=`
    @keyframes floatUp{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-20px)}}
    @keyframes fadeOut{0%{opacity:1}70%{opacity:1}100%{opacity:0}}
    @keyframes pulseGlow{0%{box-shadow:0 0 10px #00ff88}50%{box-shadow:0 0 25px #00ff88,0 0 40px #00ff8866}100%{box-shadow:0 0 10px #00ff88}}
    @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');
  `;
  document.head.appendChild(s);
}

function hideOverlay(){if(highlightOverlay)highlightOverlay.style.display="none";}

function createStopCaptureButton(){
  const btn=document.createElement("button");
  btn.id="meesho-autofill-stop-btn";
  btn.innerText="\u2715 Stop Capture";
  btn.style.cssText="position:fixed;top:20px;right:20px;z-index:1000001;background:#d32f2f;color:white;border:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:bold;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:none;";
  btn.addEventListener("click",stopCaptureMode);
  document.body.appendChild(btn);
  return btn;
}

function stopCaptureMode(){
  isCaptureMode=false;currentProfileId=null;document.body.style.cursor="default";
  hideOverlay();
  if(stopCaptureButton)stopCaptureButton.style.display="none";
  showToast("Capture Mode OFF");
}

function startCaptureMode(profileId){
  isCaptureMode=true;currentProfileId=profileId;document.body.style.cursor="crosshair";
  if(stopCaptureButton)stopCaptureButton.style.display="block";
  showToast("Capture Mode ON - Press ESC or click Stop to exit");
}

function createStopAutofillButton(){
  const btn=document.createElement("button");
  btn.id="meesho-autofill-stop-autofill-btn";
  btn.innerText="\u2b1b STOP AUTOFILL";
  btn.style.cssText="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:1000001;background:linear-gradient(180deg,#ff4444 0%,#cc0000 100%);color:white;border:3px solid #fff;padding:12px 24px;font-family:'VT323',monospace;font-size:18px;font-weight:bold;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.5);display:none;text-transform:uppercase;letter-spacing:2px;";
  const style=document.createElement("style");
  style.textContent="@keyframes pulse-stop{from{box-shadow:0 4px 12px rgba(255,0,0,0.3)}to{box-shadow:0 4px 20px rgba(255,0,0,0.7)}}";
  document.head.appendChild(style);
  btn.addEventListener("click",()=>{shouldStopAutofill=true;showToast("STOPPING...");});
  document.body.appendChild(btn);
  return btn;
}

function showStopAutofillButton(){if(stopAutofillButton)stopAutofillButton.style.display="block";}
function hideStopAutofillButton(){if(stopAutofillButton)stopAutofillButton.style.display="none";}

// ── Dropdown Detection ────────────────────────────────────────────────────────
function isDropdown(el){
  if(!el)return false;
  if("SELECT"===el.tagName)return false;
  if("DIV"===el.tagName)return true;
  if(el.readOnly)return true;
  const role=el.getAttribute("role");
  const haspopup=el.getAttribute("aria-haspopup");
  const autocomplete=el.getAttribute("aria-autocomplete");
  return role==="combobox"||haspopup==="listbox"||autocomplete==="list"||autocomplete==="both";
}

function waitForDropdownPopup(timeout=3000){
  return new Promise(resolve=>{
    const selectors=[".MuiPopover-paper",".MuiMenu-paper",".MuiPopper-root",'div[role="presentation"] .MuiPaper-root','div[role="listbox"]','ul[role="listbox"]'];
    const find=()=>{
      for(const s of selectors){
        const el=document.querySelector(s);
        if(el&&el.offsetParent!==null&&el.offsetWidth>0)return el;
      }
      return null;
    };
    const found=find();
    if(found)return resolve(found);
    const obs=new MutationObserver(()=>{const e=find();if(e){obs.disconnect();resolve(e);}});
    obs.observe(document.body,{childList:true,subtree:true});
    setTimeout(()=>{obs.disconnect();resolve(null);},timeout);
  });
}

function waitForDropdownOptions(timeout=2000){
  return new Promise(resolve=>{
    const selectors=[".MuiMenuItem-root",".MuiPopper-root li",'div[role="presentation"] li',".MuiPaper-root li",".MuiMenu-list li",'li[role="option"]'];
    const find=()=>{
      for(const s of selectors){
        const els=document.querySelectorAll(s);
        for(const el of els){
          if(el.offsetParent!==null&&el.offsetWidth>0&&el.offsetHeight>0&&!el.querySelector("input"))return el;
        }
      }
      return null;
    };
    const found=find();
    if(found)return resolve(found);
    const obs=new MutationObserver(()=>{const e=find();if(e){obs.disconnect();resolve(e);}});
    obs.observe(document.body,{childList:true,subtree:true,characterData:true});
    setTimeout(()=>{obs.disconnect();resolve(null);},timeout);
  });
}

// ── Field Filling ─────────────────────────────────────────────────────────────
async function fillField(el,value){
  if(!el||value===undefined||value===null)return;
  el.scrollIntoView({behavior:"instant",block:"center"});
  await new Promise(r=>setTimeout(r,80));

  // ── Native SELECT ──────────────────────────────────────────────────────────
  if("SELECT"===el.tagName){
    let matched=false;
    for(const opt of el.options){
      if(opt.text.trim()===value.trim()||opt.value===value){el.value=opt.value;matched=true;break;}
    }
    if(!matched){
      const vl=value.toLowerCase();
      for(const opt of el.options){
        if(opt.text.toLowerCase().includes(vl)){el.value=opt.value;matched=true;break;}
      }
    }
    el.dispatchEvent(new Event("change",{bubbles:true}));
    return;
  }

  // ── MUI Select (DIV with role="button" and aria-haspopup="listbox") ────────
  const isMuiSelect="DIV"===el.tagName||(el.getAttribute&&el.getAttribute("role")==="button"&&el.getAttribute("aria-haspopup")==="listbox");
  if(isMuiSelect){
    el.click();
    el.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,view:window}));
    const popup=await waitForDropdownPopup(3000);
    if(!popup){showToast(`Dropdown didn't open for "${value}"`,true);return;}
    await new Promise(r=>setTimeout(r,300));

    const vl=value.trim().toLowerCase();

    // ── Detect checkbox-based multi-select (e.g. Size → "Free Size" + Apply) ──
    const checkboxItems=document.querySelectorAll(
      '.MuiPopover-paper li input[type="checkbox"],.MuiMenu-paper li input[type="checkbox"],.MuiPopper-root li input[type="checkbox"],div[role="presentation"] li input[type="checkbox"]'
    );
    if(checkboxItems.length>0){
      // Find the li whose text matches value
      const liItems=document.querySelectorAll(
        '.MuiPopover-paper li,.MuiMenu-paper li,.MuiPopper-root li,div[role="presentation"] li'
      );
      let targetLi=null;
      for(const li of liItems){
        if(!li.offsetParent)continue;
        const txt=(li.innerText||"").trim().toLowerCase();
        if(txt===vl||txt.includes(vl)||vl.includes(txt)){targetLi=li;break;}
      }
      if(targetLi){
        const cb=targetLi.querySelector('input[type="checkbox"]');
        if(cb&&!cb.checked){
          cb.click();
          targetLi.click();
        }
        await new Promise(r=>setTimeout(r,200));
      }
      // Click the "Apply" button inside the popup
      const allBtns=document.querySelectorAll('button');
      for(const btn of allBtns){
        if(btn.offsetParent&&(btn.innerText||"").trim().toLowerCase()==="apply"){
          btn.click();
          await new Promise(r=>setTimeout(r,200));
          break;
        }
      }
      return;
    }

    // ── Standard single-select listbox ────────────────────────────────────────
    const optSelectors=['li[role="option"]','ul[role="listbox"] li','.MuiMenuItem-root','.MuiList-root li','.MuiPaper-root li'];
    let found=null;

    // Exact match
    for(const s of optSelectors){
      const opts=document.querySelectorAll(s);
      for(const opt of opts){
        if(!opt.offsetParent)continue;
        if((opt.innerText||"").trim()===value.trim()){found=opt;break;}
      }
      if(found)break;
    }
    // Partial match
    if(!found){
      for(const s of optSelectors){
        const opts=document.querySelectorAll(s);
        for(const opt of opts){
          if(!opt.offsetParent)continue;
          const txt=(opt.innerText||"").trim().toLowerCase();
          if(txt.includes(vl)||vl.includes(txt)){found=opt;break;}
        }
        if(found)break;
      }
    }

    if(found){
      found.scrollIntoView({behavior:"instant",block:"center"});
      found.click();
      await new Promise(r=>setTimeout(r,150));
    } else {
      showToast(`Option "${value}" not found in dropdown`,true);
      document.body.click();
      await new Promise(r=>setTimeout(r,100));
    }
    return;
  }

  // ── MUI Autocomplete (INPUT with combobox/autocomplete) ────────────────────
  if("INPUT"===el.tagName&&isDropdown(el)){
    const values=value.split(",").map(v=>v.trim()).filter(v=>v);
    for(const val of values){
      el.focus();el.click();
      el.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,view:window}));
      el.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,cancelable:true,view:window}));
      if(!await waitForDropdownPopup(3000)){showToast(`Dropdown didn't open for "${val}"`,true);continue;}
      await new Promise(r=>setTimeout(r,80));

      const searchInput=document.querySelector('.MuiPopover-paper input[placeholder="Search"],.MuiMenu-paper input[placeholder="Search"],.MuiPopper-root input[placeholder="Search"],div[role="presentation"] input[placeholder="Search"]');
      if(searchInput){
        searchInput.focus();setNativeValue(searchInput,val);
        searchInput.dispatchEvent(new Event("input",{bubbles:true}));
        searchInput.dispatchEvent(new Event("change",{bubbles:true}));
        await waitForDropdownOptions(2000);
        await new Promise(r=>setTimeout(r,150));
      }

      let found=null,first=null;
      const rowSelectors=[".MuiMenuItem-root",".MuiPopper-root li",'div[role="presentation"] li',".MuiPaper-root li",".MuiMenu-list li"];
      for(const s of rowSelectors){
        const opts=document.querySelectorAll(s);
        for(const opt of opts){
          if(!opt.offsetParent||opt.offsetWidth===0||opt.offsetHeight===0)continue;
          if(opt.querySelector("input"))continue;
          if(!first)first=opt;
          if((opt.innerText||"").trim()===val.trim()){found=opt;break;}
        }
        if(found)break;
      }

      const target=found||first;
      if(target){
        target.scrollIntoView({behavior:"instant",block:"center"});
        target.click();
        await new Promise(r=>setTimeout(r,100));
      } else {
        const el2=await waitForTextElement(val,2000);
        if(el2){el2.scrollIntoView({behavior:"instant",block:"center"});el2.click();await new Promise(r=>setTimeout(r,100));}
        else showToast(`Option "${val}" not found`,true);
      }
    }
    document.body.click();
    await new Promise(r=>setTimeout(r,80));
    return;
  }

  // ── Textarea (description, long text) ─────────────────────────────────────
  if("TEXTAREA"===el.tagName){
    if(el.readOnly||el.disabled)return;
    el.focus();
    // Small delay to let React settle after focus
    await new Promise(r=>setTimeout(r,50));

    // Reset React's internal value tracker so it detects the upcoming change.
    // Without this, React compares the new DOM value against its cached "last
    // known value", sees no diff, and silently ignores the input event.
    const tracker=el._valueTracker;
    if(tracker) tracker.setValue('');

    // Set value via native React prototype setter
    const textareaSetter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value")?.set;
    if(textareaSetter){
      textareaSetter.call(el,value);
    } else {
      el.value=value;
    }

    // Dispatch InputEvent (not generic Event) — React 18 requires InputEvent
    // to properly trigger its synthetic onChange and update component state.
    el.dispatchEvent(new InputEvent("input",{bubbles:true,cancelable:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
    el.dispatchEvent(new Event("blur",{bubbles:true}));
    await new Promise(r=>setTimeout(r,100));
    return;
  }

  // ── Plain text input ───────────────────────────────────────────────────────
  if(el.readOnly||el.disabled)return;
  el.focus();
  const inputSetter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value")?.set;
  if(inputSetter){
    inputSetter.call(el,value);
  } else {
    setNativeValue(el,value);
  }
  el.dispatchEvent(new Event("input",{bubbles:true}));
  el.dispatchEvent(new Event("change",{bubbles:true}));
  el.dispatchEvent(new Event("blur",{bubbles:true}));
}

// ── Field Label Extractor ─────────────────────────────────────────────────────
function getFieldLabel(el){
  if(el.id){
    const lbl=document.querySelector('label[for="'+CSS.escape(el.id)+'"]');
    if(lbl)return lbl.innerText.trim().replace(/\s*\*\s*$/,"").trim();
  }
  const ariaLabelledBy=el.getAttribute("aria-labelledby");
  if(ariaLabelledBy){
    const lbl=document.getElementById(ariaLabelledBy);
    if(lbl)return lbl.innerText.trim().replace(/\s*\*\s*$/,"").trim();
  }
  const ariaLabel=el.getAttribute("aria-label");
  if(ariaLabel)return ariaLabel.replace(/\s*\*\s*$/,"").trim();
  if(el.placeholder)return el.placeholder;
  const fc=el.closest(".MuiFormControl-root");
  if(fc){
    const lbl=fc.querySelector(".MuiFormLabel-root,.MuiInputLabel-root,label");
    if(lbl)return lbl.innerText.trim().replace(/\s*\*\s*$/,"").trim();
  }
  return el.id||el.name||"";
}

// ── Form Scanner ──────────────────────────────────────────────────────────────
function scanFormFields(){
  const fields=[];
  const seen=new Set();

  // 1. Standard inputs, textareas, native selects
  const inputs=document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]),textarea,select');
  for(const el of inputs){
    if(!el.offsetParent)continue;
    if(el.disabled)continue;
    // Use correct tag name for selector (textarea vs input)
    const tag=el.tagName.toLowerCase();
    const sel=el.id?(tag+'[id="'+el.id+'"]'):(typeof getStableSelector==="function"?getStableSelector(el):null);
    if(!sel||seen.has(sel))continue;
    seen.add(sel);
    const label=getFieldLabel(el);
    if(!label&&!el.id)continue;
    const dd=isDropdown(el);
    fields.push({
      selector:sel,
      label:label||el.id||el.name||sel,
      type:dd?"dropdown":(el.tagName==="TEXTAREA"?"textarea":"text"),
      id:el.id||""
    });
  }

  // 2. MUI Select dropdowns (render as divs, not inputs)
  const formControls=document.querySelectorAll(".MuiFormControl-root");
  for(const fc of formControls){
    const btn=fc.querySelector('div[role="button"][aria-haspopup="listbox"],div.MuiSelect-select[role="button"]');
    if(!btn||!btn.offsetParent)continue;
    const lbl=fc.querySelector(".MuiFormLabel-root,.MuiInputLabel-root,label");
    if(!lbl)continue;
    const labelText=lbl.innerText.trim().replace(/\s*\*\s*$/,"").trim();
    if(!labelText)continue;
    const sel="MUISELECT:"+labelText;
    if(seen.has(sel))continue;
    seen.add(sel);
    fields.push({selector:sel,label:labelText,type:"select",id:""});
  }

  return fields;
}

// ── Autofill Profile ──────────────────────────────────────────────────────────
async function autofillProfile(data){
  if(!data||!data.fields)return;
  if(isAutofilling){showToast("Autofill already running!",true);return;}
  const forceAutofill=data.force||false;
  isAutofilling=true;shouldStopAutofill=false;
  showStopAutofillButton();

  // Check "Copy price to all sizes" checkbox
  let copyPriceChecked=false;
  try{
    const copyEl=Array.from(document.querySelectorAll("p,span,div")).find(e=>e.innerText&&e.innerText.trim()==="Copy price details to all sizes");
    if(copyEl){
      const parent=copyEl.closest(".MuiBox-root")||copyEl.parentElement;
      if(parent){const cb=parent.querySelector('input[type="checkbox"]');if(cb&&cb.checked)copyPriceChecked=true;}
    }
  }catch(e){}

  const dedupeIds=["meesho_price","only_wrong_return_price","product_mrp","inventory","supplier_gst_percent","hsn_code","product_weight_in_gms","supplier_product_id","product_name","color"];
  const filledIds=new Set();
  let filled=0,skipped=0;

  for(const field of data.fields){
    if(shouldStopAutofill){showToast(`STOPPED! Filled: ${filled}, Skipped: ${skipped}`);break;}

    const sel=field.selector;
    const val=String(field.value||"").trim();
    if(!val)continue;

    // Extract ID from selector for deduplication
    let fieldId=null;
    const idMatch=sel.match(/id=["']([^"']+)["']/)||sel.match(/#([a-zA-Z0-9_-]+)/);
    if(idMatch)fieldId=idMatch[1];

    let el=null;

    if(fieldId&&dedupeIds.includes(fieldId)){
      if(filledIds.has(fieldId)){skipped++;continue;}
      if(sel.startsWith("SIZE:")){
        const m=sel.match(/^SIZE:(.+?)::(.+)$/);
        if(m){el=parseAndQuerySelector(m[2])||await waitForElement(m[2]);if(el)filledIds.add(fieldId);}
      } else if(copyPriceChecked&&["meesho_price","only_wrong_return_price","product_mrp","inventory"].includes(fieldId)){
        const rows=document.querySelectorAll(".css-1hw3sau");
        if(rows.length>0){el=rows[0].querySelector(`input[id="${fieldId}"]`);if(el)filledIds.add(fieldId);}
      } else {
        el=parseAndQuerySelector(sel)||await waitForElement(sel);
        if(el)filledIds.add(fieldId);
      }
    } else {
      el=parseAndQuerySelector(sel)||await waitForElement(sel);
    }

    if(el){
      const currentVal=(el.value||el.innerText||"").trim();
      if(currentVal===val){showSkipEffect(el);skipped++;await new Promise(r=>setTimeout(r,100));continue;}
      if(currentVal&&!isDropdown(el)&&"SELECT"!==el.tagName&&!forceAutofill){showSkipEffect(el);skipped++;await new Promise(r=>setTimeout(r,100));continue;}
      try{
        await fillField(el,val);
        showFillEffect(el);
        filled++;
        await new Promise(r=>setTimeout(r,200));
      }catch(e){console.error("fillField error:",e);}
    } else {
      showNotFoundEffect(sel);
      skipped++;
    }
  }

  if(!shouldStopAutofill)showToast(`Done! Filled: ${filled}, Skipped: ${skipped}`);
  isAutofilling=false;shouldStopAutofill=false;
  hideStopAutofillButton();
}

// ── Init ──────────────────────────────────────────────────────────────────────
if(isValidDomain())initVisualEffectStyles();

chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  if(msg.action==="PING"){respond({ready:true});return true;}
  if(msg.action==="SCAN_FORM"){respond({success:true,fields:scanFormFields()});return true;}
  if(msg.action==="START_CAPTURE"){startCaptureMode(msg.profileId);respond({success:true});return true;}
  if(msg.action==="AUTOFILL"){stopCaptureMode();autofillProfile(msg.data);respond({success:true});return true;}
});

document.addEventListener("keydown",e=>{if(e.key==="Escape"&&isCaptureMode)stopCaptureMode();});

document.addEventListener("mouseover",e=>{
  if(!isCaptureMode)return;
  const t=e.target;
  if(["INPUT","TEXTAREA","SELECT"].includes(t.tagName)){
    const r=t.getBoundingClientRect();
    if(highlightOverlay){
      highlightOverlay.style.width=r.width+"px";
      highlightOverlay.style.height=r.height+"px";
      highlightOverlay.style.top=(window.scrollY+r.top)+"px";
      highlightOverlay.style.left=(window.scrollX+r.left)+"px";
      highlightOverlay.style.display="block";
    }
  } else hideOverlay();
});

document.addEventListener("click",async e=>{
  if(!isCaptureMode)return;
  const t=e.target;
  if(["INPUT","TEXTAREA","SELECT"].includes(t.tagName)){
    e.preventDefault();e.stopPropagation();
    const sel=typeof getStableSelector==="function"?getStableSelector(t):null;
    if(!sel){showToast("Error: Selector util not loaded",true);return;}
    const val=t.value;
    const newVal=prompt(`Save field: ${sel}\nValue:`,val);
    if(newVal!==null){
      chrome.runtime.sendMessage({action:"SAVE_FIELD",payload:{profileId:currentProfileId,field:{selector:sel,type:t.type||t.tagName.toLowerCase(),value:newVal}}},(res)=>{
        showToast(res&&res.success?"Field Saved!":"Error Saving");
      });
    }
  }
},true);

initializeUI();
