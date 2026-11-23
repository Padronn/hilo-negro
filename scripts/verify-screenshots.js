// Chrome's headless window has a minimum layout width. Set the viewport through DevTools.
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { writeFile } = require("node:fs/promises");
const { join } = require("node:path");

const [browser, profile, origin, proof] = process.argv.slice(2);
const chrome = spawn(browser, [
  "--headless", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
  "--remote-debugging-pipe", "--user-data-dir=" + profile, "about:blank",
], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
const [requests, responses] = chrome.stdio.slice(3);
const pending = new Map();
let nextId = 0;
let buffer = "";

function stop(error) {
  for (const request of pending.values()) request.reject(error);
  pending.clear();
}

chrome.on("error", stop);
requests.on("error", stop);
const closed = once(chrome, "close");
closed.then(() => stop(new Error("Chrome closed the DevTools connection")), stop);
responses.setEncoding("utf8");
responses.on("data", (chunk) => {
  buffer += chunk;
  const messages = buffer.split("\0");
  buffer = messages.pop();
  for (const text of messages) {
    const message = JSON.parse(text);
    const request = pending.get(message.id);
    if (!request) continue;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  }
});

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(method + " timed out"));
    }, 30000);
    pending.set(id, {
      resolve(result) { clearTimeout(timer); resolve(result); },
      reject(error) { clearTimeout(timer); reject(error); },
    });
    requests.write(JSON.stringify({ id, method, params, sessionId }) + "\0");
  });
}

async function capture() {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page("Page.enable");
  for (const [width, height] of [[1280, 900], [390, 844]]) {
    await page("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    for (const [name, route] of [["inicio", "/"], ["menu", "/menu/"]]) {
      const url = origin + route;
      const navigation = await page("Page.navigate", { url });
      if (navigation.errorText) throw new Error(url + " " + navigation.errorText);

      // Wait for this exact document so a previous page can't satisfy the capture.
      let layout;
      for (let attempt = 0; attempt < 80; attempt++) {
        const result = await page("Runtime.evaluate", {
          expression: "({url: location.href, width: innerWidth, ready: document.readyState})",
          returnByValue: true,
        });
        layout = result.result.value;
        if (layout && layout.url === url && layout.ready === "complete") break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!layout || layout.url !== url || layout.ready !== "complete" || layout.width !== width) {
        throw new Error("Expected a loaded " + width + " px viewport at " + url + ", got " + JSON.stringify(layout));
      }
      const { data } = await page("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const png = Buffer.from(data, "base64");
      if (png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height) {
        throw new Error("Unexpected PNG dimensions for " + url);
      }
      const file = join(proof, name + "-" + width + ".png");
      await writeFile(file, png);
      console.log("SCREENSHOT " + width + "x" + height + " " + file);
    }
  }
}

capture().catch((error) => {
  console.error("SCREENSHOT FAILED: " + error.message);
  process.exitCode = 1;
}).finally(async () => {
  if (!chrome.pid || chrome.exitCode !== null || chrome.signalCode !== null) return;
  // Let Chrome stop its child processes before the verifier removes the temporary profile.
  const deadline = setTimeout(() => chrome.kill(), 5000);
  send("Browser.close").catch(() => chrome.kill());
  await closed.catch(() => {});
  clearTimeout(deadline);
});
