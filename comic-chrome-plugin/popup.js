const scanButton = document.querySelector('#scan');
const downloadButton = document.querySelector('#download');
const filenameInput = document.querySelector('#filename');
const countElement = document.querySelector('#count');
const statusElement = document.querySelector('#status');
const progressBar = document.querySelector('#progress-bar');
const imageList = document.querySelector('#image-list');
const selectAllButton = document.querySelector('#select-all');
const selectNoneButton = document.querySelector('#select-none');

let images = [];
let pageTitle = 'comic';
let activeTabId = null;
let activePageUrl = null;
const requestRuleId = 1;
let debuggee = null;
let resourceFrames = new Map();

function safeName(value) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 120) || 'comic';
}

function setBusy(busy) {
  scanButton.disabled = busy;
  selectAllButton.disabled = busy;
  selectNoneButton.disabled = busy;
  filenameInput.disabled = busy;
  for (const checkbox of imageList.querySelectorAll('input')) checkbox.disabled = busy;
  downloadButton.disabled = busy || !images.some((image) => image.selected);
}

function updateSelectionStatus() {
  const selected = images.filter((image) => image.selected);
  countElement.textContent = selected.length;
  downloadButton.disabled = selected.length === 0;
  statusElement.textContent = images.length
    ? `${selected.length} of ${images.length} image${images.length === 1 ? '' : 's'} selected.`
    : 'No loaded comic images were found on this page.';
  return selected;
}

function imageFilename(url, index) {
  try {
    const name = new URL(url).pathname.split('/').pop();
    return decodeURIComponent(name) || `Image ${index + 1}`;
  } catch {
    return `Image ${index + 1}`;
  }
}

function renderImages() {
  imageList.replaceChildren();

  images.forEach((image, index) => {
    const row = document.createElement('label');
    row.className = 'image-row';
    row.title = image.url;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = image.selected;
    checkbox.addEventListener('change', () => {
      image.selected = checkbox.checked;
      updateSelectionStatus();
    });

    const details = document.createElement('span');
    details.className = 'image-details';
    const name = document.createElement('span');
    name.className = 'image-name';
    name.textContent = imageFilename(image.url, index);
    const size = document.createElement('span');
    size.className = 'image-size';
    size.textContent = `${image.width} × ${image.height}`;
    details.append(name, size);
    row.append(checkbox, details);
    imageList.append(row);
  });

  updateSelectionStatus();
}

async function scanPage() {
  setBusy(true);
  progressBar.style.width = '0%';
  statusElement.textContent = 'Scanning this page…';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active browser tab was found.');
    activeTabId = tab.id;
    activePageUrl = tab.url;

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const seen = new Set();
        const found = [];

        for (const image of document.images) {
          const url = image.currentSrc || image.src;
          if (!url || seen.has(url) || !image.complete || !image.naturalWidth) continue;

          let pathname = '';
          try { pathname = new URL(url, document.baseURI).pathname; } catch { pathname = url; }
          if (!/\.(avif|gif|jpe?g|png|webp)$/i.test(pathname)) continue;

          seen.add(url);
          found.push({
            url,
            width: image.naturalWidth || image.width || 0,
            height: image.naturalHeight || image.height || 0
          });
        }

        return { title: document.title, images: found };
      }
    });

    images = (result?.images || []).map((image) => ({
      ...image,
      selected: image.width >= 500 || image.height >= 500
    }));
    pageTitle = safeName(result?.title || tab.title || 'comic');
    filenameInput.value = pageTitle;
    renderImages();
  } catch (error) {
    images = [];
    renderImages();
    countElement.textContent = '0';
    statusElement.textContent = error.message || 'Chrome would not allow this page to be scanned.';
  } finally {
    setBusy(false);
  }
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function view(size) {
  const bytes = new Uint8Array(size);
  return { bytes, data: new DataView(bytes.buffer) };
}

function createStoredZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const { time, date } = dosDateTime();
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const size = entry.bytes.byteLength;
    const checksum = crc32(entry.bytes);

    const local = view(30 + name.length);
    local.data.setUint32(0, 0x04034b50, true);
    local.data.setUint16(4, 20, true);
    local.data.setUint16(6, 0x0800, true);
    local.data.setUint16(8, 0, true);
    local.data.setUint16(10, time, true);
    local.data.setUint16(12, date, true);
    local.data.setUint32(14, checksum, true);
    local.data.setUint32(18, size, true);
    local.data.setUint32(22, size, true);
    local.data.setUint16(26, name.length, true);
    local.bytes.set(name, 30);
    localParts.push(local.bytes, entry.bytes);

    const central = view(46 + name.length);
    central.data.setUint32(0, 0x02014b50, true);
    central.data.setUint16(4, 20, true);
    central.data.setUint16(6, 20, true);
    central.data.setUint16(8, 0x0800, true);
    central.data.setUint16(10, 0, true);
    central.data.setUint16(12, time, true);
    central.data.setUint16(14, date, true);
    central.data.setUint32(16, checksum, true);
    central.data.setUint32(20, size, true);
    central.data.setUint32(24, size, true);
    central.data.setUint16(28, name.length, true);
    central.data.setUint32(42, offset, true);
    central.bytes.set(name, 46);
    centralParts.push(central.bytes);

    offset += local.bytes.byteLength + size;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.byteLength, 0);
  const end = view(22);
  end.data.setUint32(0, 0x06054b50, true);
  end.data.setUint16(8, entries.length, true);
  end.data.setUint16(10, entries.length, true);
  end.data.setUint32(12, centralSize, true);
  end.data.setUint32(16, offset, true);

  return new Blob([...localParts, ...centralParts, end.bytes], { type: 'application/vnd.comicbook+zip' });
}

function detectImageExtension(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes.length >= 6 && String.fromCharCode(...bytes.subarray(0, 6)).startsWith('GIF8')) return 'gif';
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) return 'webp';
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp'
    && ['avif', 'avis'].includes(String.fromCharCode(...bytes.subarray(8, 12)))
  ) return 'avif';
  return null;
}

function imageResult(bytes, source) {
  const extension = detectImageExtension(bytes);
  if (!extension) throw new Error(`The ${source} response was not supported image data.`);
  return { bytes, extension };
}

function decodeBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function fetchFromPage(url) {
  if (!activeTabId) throw new Error('The active page is no longer available.');

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: activeTabId },
    world: 'MAIN',
    args: [url],
    func: async (imageUrl) => {
      try {
        const response = await fetch(imageUrl, {
          credentials: 'include',
          cache: 'force-cache'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        const chunkSize = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
        }
        return { ok: true, base64: btoa(binary) };
      } catch (error) {
        return { ok: false, error: error?.message || String(error) };
      }
    }
  });

  if (!result?.ok) throw new Error(result?.error || 'The page could not fetch this image.');
  return decodeBase64(result.base64);
}

function collectFrameResources(frameTree) {
  const frameId = frameTree.frame.id;
  for (const resource of frameTree.resources || []) resourceFrames.set(resource.url, frameId);
  for (const child of frameTree.childFrames || []) collectFrameResources(child);
}

async function ensureDebuggerCache() {
  if (debuggee) return;
  if (!activeTabId) throw new Error('The active page is no longer available.');

  debuggee = { tabId: activeTabId };
  let attached = false;
  try {
    await chrome.debugger.attach(debuggee, '1.3');
    attached = true;
    await chrome.debugger.sendCommand(debuggee, 'Page.enable');
    await chrome.debugger.sendCommand(debuggee, 'Network.enable', {
      maxTotalBufferSize: 100000000,
      maxResourceBufferSize: 25000000
    });
    const { frameTree } = await chrome.debugger.sendCommand(debuggee, 'Page.getResourceTree');
    resourceFrames = new Map();
    collectFrameResources(frameTree);
  } catch (error) {
    if (attached) await chrome.debugger.detach(debuggee).catch(() => {});
    debuggee = null;
    throw error;
  }
}

async function fetchFromBrowserCache(url) {
  await ensureDebuggerCache();
  const frameId = resourceFrames.get(url);
  if (!frameId) throw new Error('The loaded image was not present in the tab resource cache.');

  const result = await chrome.debugger.sendCommand(debuggee, 'Page.getResourceContent', {
    frameId,
    url
  });
  if (!result?.base64Encoded) throw new Error('Chrome did not return binary image data.');
  return decodeBase64(result.content);
}

async function captureFromPageImage(url) {
  await ensureDebuggerCache();

  let requestId = null;
  let timeoutId;
  let eventListener;
  let settled = false;

  const cleanup = () => {
    clearTimeout(timeoutId);
    if (eventListener) chrome.debugger.onEvent.removeListener(eventListener);
  };

  const responseBody = new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };

    eventListener = (source, method, params) => {
      if (source.tabId !== activeTabId) return;

      if (method === 'Network.responseReceived' && params.response.url === url) {
        if (params.response.status >= 400) {
          finish(reject, new Error(`page image request returned HTTP ${params.response.status}`));
          return;
        }
        requestId = params.requestId;
      }

      if (method === 'Network.loadingFailed' && params.requestId === requestId) {
        finish(reject, new Error(params.errorText || 'The page image request failed.'));
      }

      if (method === 'Network.loadingFinished' && params.requestId === requestId) {
        chrome.debugger.sendCommand(debuggee, 'Network.getResponseBody', { requestId })
          .then((result) => {
            const bytes = result.base64Encoded
              ? decodeBase64(result.body)
              : new TextEncoder().encode(result.body);
            finish(resolve, bytes);
          })
          .catch((error) => finish(reject, error));
      }
    };

    chrome.debugger.onEvent.addListener(eventListener);
    timeoutId = setTimeout(() => {
      finish(reject, new Error('Timed out waiting for the page image response.'));
    }, 20_000);
  });

  try {
    const injection = chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      world: 'MAIN',
      args: [url],
      func: (imageUrl) => new Promise((resolve) => {
        const image = new Image();
        image.style.position = 'fixed';
        image.style.left = '-100000px';
        image.style.top = '0';
        image.style.width = '1px';
        image.style.height = '1px';
        image.onload = () => {
          image.remove();
          resolve({ ok: true });
        };
        image.onerror = () => {
          image.remove();
          resolve({ ok: false, error: 'The hidden page image did not load.' });
        };
        document.documentElement.append(image);
        image.src = imageUrl;
      })
    });

    const [injectionResult, bytes] = await Promise.all([injection, responseBody]);
    const pageResult = injectionResult[0]?.result;
    if (!pageResult?.ok) throw new Error(pageResult?.error || 'The page could not reload the image.');
    return bytes;
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function detachDebugger() {
  if (!debuggee) return;
  const attachedDebuggee = debuggee;
  debuggee = null;
  resourceFrames = new Map();
  await chrome.debugger.detach(attachedDebuggee);
}

async function fetchImage(url) {
  let extensionError;
  let pageError;
  let cacheError;

  try {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return imageResult(bytes, 'request');
  } catch (error) {
    extensionError = error;
  }

  try {
    const bytes = await fetchFromPage(url);
    return imageResult(bytes, 'page');
  } catch (error) {
    pageError = error;
  }

  try {
    const bytes = await fetchFromBrowserCache(url);
    return imageResult(bytes, 'cached');
  } catch (error) {
    cacheError = error;
  }

  try {
    const bytes = await captureFromPageImage(url);
    return imageResult(bytes, 'captured');
  } catch (captureError) {
    throw new Error(`request: ${extensionError.message}; page: ${pageError.message}; cache: ${cacheError.message}; capture: ${captureError.message}`);
  }
}

async function installImageRequestRule(urls) {
  const pageUrl = new URL(activePageUrl);
  if (!['http:', 'https:'].includes(pageUrl.protocol)) return;

  const requestDomains = [...new Set(urls.map((url) => new URL(url).hostname))];
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [requestRuleId],
    addRules: [{
      id: requestRuleId,
      priority: 1,
      condition: {
        initiatorDomains: [chrome.runtime.id],
        requestDomains,
        resourceTypes: ['xmlhttprequest']
      },
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'referer', operation: 'set', value: activePageUrl },
          { header: 'origin', operation: 'remove' }
        ]
      }
    }]
  });
}

async function removeImageRequestRule() {
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [requestRuleId] });
}

async function downloadComic() {
  const candidates = updateSelectionStatus();
  if (!candidates.length) return;

  setBusy(true);
  const entries = [];
  const failures = [];

  try {
    await installImageRequestRule(candidates.map((image) => image.url));

    for (let index = 0; index < candidates.length; index += 1) {
      const image = candidates[index];
      statusElement.textContent = `Fetching page ${index + 1} of ${candidates.length}…`;
      progressBar.style.width = `${Math.round((index / candidates.length) * 85)}%`;

      try {
        const { bytes, extension } = await fetchImage(image.url);
        const pageNumber = String(entries.length + 1).padStart(Math.max(3, String(candidates.length).length), '0');
        entries.push({ name: `${pageNumber}.${extension}`, bytes });
      } catch (error) {
        console.warn('Could not collect image', image.url, error);
        failures.push(`${imageFilename(image.url, index)}: ${error.message}`);
      }
    }

    if (!entries.length) {
      const detail = failures[0] ? ` ${failures[0]}` : '';
      throw new Error(`None of the images could be downloaded.${detail}`);
    }
    if (entries.length > 65535) throw new Error('This page has too many images for one CBZ archive.');

    statusElement.textContent = 'Building CBZ archive…';
    progressBar.style.width = '90%';
    const archive = createStoredZip(entries);
    const archiveUrl = URL.createObjectURL(archive);
    const archiveName = `${safeName(filenameInput.value || pageTitle)}.cbz`;

    try {
      await chrome.downloads.download({ url: archiveUrl, filename: archiveName, saveAs: true });
    } finally {
      setTimeout(() => URL.revokeObjectURL(archiveUrl), 60_000);
    }

    progressBar.style.width = '100%';
    statusElement.textContent = `Saved ${entries.length} page${entries.length === 1 ? '' : 's'}${failures.length ? `; skipped ${failures.length}` : ''}.`;
  } catch (error) {
    progressBar.style.width = '0%';
    statusElement.textContent = error.message || 'The comic could not be created.';
  } finally {
    await removeImageRequestRule().catch((error) => console.warn('Could not remove request rule', error));
    await detachDebugger().catch((error) => console.warn('Could not detach debugger', error));
    setBusy(false);
  }
}

scanButton.addEventListener('click', scanPage);
selectAllButton.addEventListener('click', () => {
  for (const image of images) image.selected = true;
  renderImages();
});
selectNoneButton.addEventListener('click', () => {
  for (const image of images) image.selected = false;
  renderImages();
});
downloadButton.addEventListener('click', downloadComic);

scanPage();
