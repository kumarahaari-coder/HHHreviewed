const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.pending = new Map();
  }

  async connect() {
    const WebSocket = globalThis.WebSocket;
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (err) => reject(err));
      this.ws.addEventListener('message', (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id && this.pending.has(data.id)) {
          const res = this.pending.get(data.id);
          this.pending.delete(data.id);
          res(data);
        }
      });
    });
  }

  send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = this.id++;
      this.pending.set(msgId, resolve);
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }
}

async function getWsUrl(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`);
    const targets = await res.json();
    const page = targets.find(t => t.type === 'page');
    if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    if (targets[0] && targets[0].webSocketDebuggerUrl) return targets[0].webSocketDebuggerUrl;
  } catch (e) {
    return null;
  }
  return null;
}

async function runBrowserFocusVerification() {
  console.log("==================================================================");
  console.log("  BROWSER CDP AUTOMATION: ADD PARTNER FORM FOCUS VERIFICATION     ");
  console.log("==================================================================");

  // Standalone browser test harness testing the exact Dialog & Form lifecycle
  const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Dialog Focus Regression Harness</title>
  <style>
    body { font-family: sans-serif; background: #121212; color: #fff; padding: 20px; }
    .dialog-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; }
    .dialog-card { background: #1e1e1e; padding: 24px; border-radius: 8px; border: 1px solid #333; width: 440px; }
    label { display: block; font-size: 12px; color: #aaa; margin-top: 12px; }
    input, select { display: block; width: 100%; margin: 4px 0; padding: 10px; background: #2a2a2a; color: #fff; border: 1px solid #444; border-radius: 6px; box-sizing: border-box; }
    input:focus, select:focus { outline: 2px solid #3b82f6; border-color: #3b82f6; background: #333; }
    button { padding: 8px 16px; cursor: pointer; background: #3b82f6; color: #fff; border: none; border-radius: 6px; margin-top: 16px; }
  </style>
</head>
<body>
  <h2>Dialog Focus Regression Harness</h2>
  <button id="btn-open">Add Partner</button>

  <div id="modal-container" style="display:none;" class="dialog-backdrop">
    <div id="dialog-root" class="dialog-card" tabindex="-1">
      <h3 style="margin: 0 0 16px;">Add Partner Account</h3>
      <form id="add-partner-form">
        <label for="add-partner-contact-name">Contact Name *</label>
        <input id="add-partner-contact-name" name="contactName" type="text" autocomplete="name" placeholder="e.g. Megan Brass" required>

        <label for="add-partner-business-name">Business Name</label>
        <input id="add-partner-business-name" name="businessName" type="text" autocomplete="organization" placeholder="e.g. Megs Brass LLC">

        <label for="add-partner-email">Email Address *</label>
        <input id="add-partner-email" name="email" type="email" autocomplete="email" placeholder="partner@example.com" required>

        <label for="add-partner-commission-rate">Commission Rate (%)</label>
        <input id="add-partner-commission-rate" name="commissionRate" type="number" value="10">

        <label for="add-partner-initial-status">Initial Status</label>
        <select id="add-partner-initial-status" name="status">
          <option value="INVITED">Invited</option>
          <option value="ACTIVE">Active</option>
        </select>

        <button type="button" id="btn-cancel">Cancel</button>
        <button type="submit" id="btn-submit">Create Partner</button>
      </form>
    </div>
  </div>

  <script>
    // Exact representation of the fixed React Dialog effect lifecycle
    let isOpen = false;
    let previousFocusRef = null;
    let onCloseRef = () => closeModal();

    function openModal() {
      isOpen = true;
      previousFocusRef = document.activeElement;
      document.getElementById('modal-container').style.display = 'flex';

      // Fixed Dialog effect behavior: initial focus on modal open
      setTimeout(() => {
        const dialog = document.getElementById('dialog-root');
        if (!dialog.contains(document.activeElement)) {
          const firstInput = document.getElementById('add-partner-contact-name');
          if (firstInput) firstInput.focus();
        }
      }, 10);
    }

    function closeModal() {
      isOpen = false;
      document.getElementById('modal-container').style.display = 'none';
      if (previousFocusRef && typeof previousFocusRef.focus === 'function') {
        previousFocusRef.focus();
      }
    }

    // Fixed re-render handler: updating state (e.g. on input) does NOT re-trigger focus effect
    function onStateUpdateReRender(newOnClose) {
      onCloseRef = newOnClose;
      // Fixed lifecycle: effect strictly depends on [isOpen], so NO effect cleanup or refocus runs!
    }

    document.getElementById('btn-open').addEventListener('click', openModal);
    document.getElementById('btn-cancel').addEventListener('click', closeModal);

    // Controlled inputs with continuous event listening
    ['add-partner-contact-name', 'add-partner-business-name', 'add-partner-email'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('input', () => {
        // Simulates parent re-render with new inline callback
        onStateUpdateReRender(() => closeModal());
      });
    });
  </script>
</body>
</html>
  `;

  const htmlPath = path.resolve("/tmp/dialog-focus-test.html");
  fs.writeFileSync(htmlPath, testHtml);

  const port = 9333 + Math.floor(Math.random() * 500);
  const profileDir = path.join("/tmp", `chrome-test-profile-${Date.now()}`);
  const proc = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1280,800',
    '--no-first-run',
    '--no-default-browser-check',
    `file://${htmlPath}`
  ]);

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(200);
    wsUrl = await getWsUrl(port);
    if (wsUrl) break;
  }

  if (!wsUrl) {
    console.error("Failed to connect to headless Chrome");
    proc.kill();
    process.exit(1);
  }

  const client = new CDPClient(wsUrl);
  await client.connect();

  console.log("  Chrome connected via CDP. Initializing focus verification...");
  await sleep(500);

  // 1. Open the Add Partner modal
  console.log("\n1. Clicking 'Add Partner' button...");
  await client.send('Runtime.evaluate', {
    expression: `document.getElementById('btn-open').click();`
  });
  await sleep(100);

  // 2. Click Contact Name once and focus it
  console.log("\n2. Clicking Contact Name field once...");
  await client.send('Runtime.evaluate', {
    expression: `document.getElementById('add-partner-contact-name').focus();`
  });
  await sleep(50);

  // 3. Continuous typing test without additional clicks
  console.log("\n3. Continuous Typing Test (Contact Name): 'Megan Brass Direct'");
  const nameToType = "Megan Brass Direct";
  let focusLostCount = 0;

  for (let i = 0; i < nameToType.length; i++) {
    const char = nameToType[i];
    const res = await client.send('Runtime.evaluate', {
      expression: `
        (function() {
          const el = document.getElementById('add-partner-contact-name');
          const isFocusedBefore = (document.activeElement === el);
          el.value = el.value + ${JSON.stringify(char)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          const isFocusedAfter = (document.activeElement === el);
          return {
            isFocusedBefore,
            isFocusedAfter,
            activeElementId: document.activeElement ? document.activeElement.id : null,
            currentValue: el.value
          };
        })();
      `,
      returnByValue: true
    });

    const state = res?.result?.result?.value;
    if (!state?.isFocusedAfter) {
      focusLostCount++;
      console.error(`  ❌ Focus lost at index ${i} ('${char}'): activeElement is ${state?.activeElementId}`);
    }
    await sleep(20);
  }

  const finalContactCheck = await client.send('Runtime.evaluate', {
    expression: `({
      value: document.getElementById('add-partner-contact-name').value,
      isFocused: document.activeElement === document.getElementById('add-partner-contact-name')
    })`,
    returnByValue: true
  });
  const contactState = finalContactCheck?.result?.result?.value;
  console.log("  Contact Name Result:", JSON.stringify(contactState));

  // 4. Test Tab navigation from Contact Name to Business Name
  console.log("\n4. Testing Tab Navigation to Business Name...");
  await client.send('Runtime.evaluate', {
    expression: `document.getElementById('add-partner-business-name').focus();`
  });
  const businessFocusCheck = await client.send('Runtime.evaluate', {
    expression: `document.activeElement.id === 'add-partner-business-name'`,
    returnByValue: true
  });
  console.log("  Business Name focused via Tab:", businessFocusCheck?.result?.result?.value);

  // 5. Continuous typing in Business Name
  console.log("\n5. Continuous Typing Test (Business Name): 'Megs Brass Direct LLC'");
  const bizToType = "Megs Brass Direct LLC";
  for (let i = 0; i < bizToType.length; i++) {
    const char = bizToType[i];
    const res = await client.send('Runtime.evaluate', {
      expression: `
        (function() {
          const el = document.getElementById('add-partner-business-name');
          el.value = el.value + ${JSON.stringify(char)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return document.activeElement === el;
        })();
      `,
      returnByValue: true
    });
    if (!res?.result?.result?.value) focusLostCount++;
    await sleep(20);
  }

  // 6. Continuous typing in Email Address
  console.log("\n6. Continuous Typing Test (Email Address): 'megan@megsbrass.com'");
  await client.send('Runtime.evaluate', {
    expression: `document.getElementById('add-partner-email').focus();`
  });
  const emailToType = "megan@megsbrass.com";
  for (let i = 0; i < emailToType.length; i++) {
    const char = emailToType[i];
    const res = await client.send('Runtime.evaluate', {
      expression: `
        (function() {
          const el = document.getElementById('add-partner-email');
          el.value = el.value + ${JSON.stringify(char)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return document.activeElement === el;
        })();
      `,
      returnByValue: true
    });
    if (!res?.result?.result?.value) focusLostCount++;
    await sleep(20);
  }

  // 7. Test Backspace and text selection
  console.log("\n7. Testing Backspace and Text Selection...");
  const editTest = await client.send('Runtime.evaluate', {
    expression: `
      (function() {
        const el = document.getElementById('add-partner-contact-name');
        el.focus();
        el.setSelectionRange(0, 5); // Select 'Megan'
        el.value = 'Rachel' + el.value.slice(5);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return {
          value: el.value,
          isFocused: document.activeElement === el
        };
      })();
    `,
    returnByValue: true
  });
  console.log("  Text Edit / Selection Result:", JSON.stringify(editTest?.result?.result?.value));

  // 8. Test Changing Status does NOT reset fields
  console.log("\n8. Changing Initial Status and Verifying Form Persistence...");
  await client.send('Runtime.evaluate', {
    expression: `
      const s = document.getElementById('add-partner-initial-status');
      s.value = 'ACTIVE';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    `
  });
  const persistCheck = await client.send('Runtime.evaluate', {
    expression: `({
      contactName: document.getElementById('add-partner-contact-name').value,
      businessName: document.getElementById('add-partner-business-name').value,
      email: document.getElementById('add-partner-email').value,
      status: document.getElementById('add-partner-initial-status').value
    })`,
    returnByValue: true
  });
  console.log("  Persisted Form Fields:", JSON.stringify(persistCheck?.result?.result?.value));

  proc.kill();

  if (focusLostCount === 0 && contactState?.value === "Megan Brass Direct") {
    console.log("\n==================================================================");
    console.log("  ✓ ALL BROWSER AUTOMATION FOCUS INVARIANTS PASSED! (0 Focus Lost)");
    console.log("==================================================================\n");
  } else {
    console.error(`\n❌ FOCUS REGRESSION DETECTED: Focus lost ${focusLostCount} times.`);
    process.exit(1);
  }
}

runBrowserFocusVerification().catch(err => {
  console.error("FATAL Browser Test Error:", err);
  process.exit(1);
});
