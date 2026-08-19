# Comic Page Collector

A small Chrome extension that collects comic-page images loaded in the active tab and downloads them as a `.cbz` comic archive. It recognizes JPEG, WebP, PNG, GIF, and AVIF image data, even when a URL has a misleading file extension.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Choose the `comic-chrome-plugin` folder.
5. Pin **Comic Page Collector** to the toolbar.

## Use it

1. Open a page that has loaded all of the comic-page images.
2. Click the extension.
3. Review the image names, then select the images to include.
4. Confirm the archive name and click **Download CBZ**.

Large images start selected. Images smaller than 500 pixels in both dimensions start unselected to avoid collecting icons and thumbnails, but every discovered JPG can be included with its checkbox.

Some image hosts reject requests that do not come from the comic webpage. While building an archive, the extension temporarily sends the active page as the referrer for only the selected image domains, then removes that temporary rule.

If normal requests are blocked, the extension briefly uses Chrome's debugger interface. It first checks the tab's resource cache. For dynamically loaded images that are absent from that cache, it asks the webpage to load a hidden copy and captures the response as it arrives without trying to read it through CORS. Chrome displays its standard debugging notification while this fallback is active and the extension detaches immediately afterward.

## Why CBZ instead of CBR?

CBZ files are ZIP archives. CBR files are RAR archives. Giving a ZIP file a `.cbr` extension produces an invalid/mislabeled comic file, so this extension creates the correct `.cbz` format used by the archive app.
