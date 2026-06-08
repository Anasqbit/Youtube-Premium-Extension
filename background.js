console.log("[YT Premium+] Background service worker loaded");

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request && request.type === "fetchRequest") {
        handleFetch(request, sendResponse);
        return true;
    }
});

async function handleFetch(request, sendResponse) {
    var url = request.url;
    var options = request.options || {};

    try {
        var fetchOptions = {
            method: options.method || "GET",
            headers: options.headers || {}
        };
        if (options.body) {
            fetchOptions.body = options.body;
        }

        var response = await fetch(url, fetchOptions);
        var text = await response.text();

        sendResponse({
            success: true,
            status: response.status,
            statusText: response.statusText,
            body: text
        });
    } catch (error) {
        console.error("[BG] Fetch error:", url, error.message);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}