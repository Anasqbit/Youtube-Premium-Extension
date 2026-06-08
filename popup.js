document.addEventListener('DOMContentLoaded', function () {
    const toggleInput    = document.getElementById('toggleExtension');
    const statusText     = document.getElementById('statusText');
    const statusDot      = document.getElementById('statusDot');
    const toggleSub      = document.getElementById('toggleSub');
    const openOptionsBtn = document.getElementById('openOptions');

    // ── i18n ──────────────────────────────────────────────────────────
    function getMessage(key) {
        return window._messages && window._messages[key]
            ? window._messages[key].message
            : chrome.i18n.getMessage(key);
    }

    async function loadMessages(lang) {
        try {
            const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
            const res = await fetch(url);
            window._messages = await res.json();
        } catch (e) {
            window._messages = null;
        }
    }

    function applyI18n(lang) {
        document.body.classList.toggle('rtl', lang === 'ar');
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const msg = getMessage(key);
            if (msg) el.textContent = msg;
        });
        updateStatusUI(toggleInput.checked);
    }

    function updateStatusUI(isEnabled) {
        const key = isEnabled ? 'statusEnabled' : 'statusDisabled';
        const msg = getMessage(key);
        statusText.textContent = msg || (isEnabled ? 'Active & Running' : 'Paused');

        if (isEnabled) {
            statusDot.classList.remove('off');
            toggleSub.textContent = getMessage('allFeaturesActive') || 'All features active';
        } else {
            statusDot.classList.add('off');
            toggleSub.textContent = getMessage('extensionPaused') || 'Extension paused';
        }
    }

    // ── Initial load ──────────────────────────────────────────────────
    chrome.storage.sync.get({ extensionEnabled: true, language: 'en' }, async (data) => {
        toggleInput.checked = data.extensionEnabled;
        await loadMessages(data.language);
        applyI18n(data.language);
    });

    // ── Listen for language change from options page (real-time) ──────
    chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area !== 'sync') return;

        if (changes.language) {
            const newLang = changes.language.newValue;
            await loadMessages(newLang);
            applyI18n(newLang);
        }

        if (changes.extensionEnabled !== undefined) {
            toggleInput.checked = changes.extensionEnabled.newValue;
            updateStatusUI(changes.extensionEnabled.newValue);
        }
    });

    // ── Toggle main switch ────────────────────────────────────────────
    toggleInput.addEventListener('change', function () {
        const isChecked = toggleInput.checked;
        updateStatusUI(isChecked);
        chrome.storage.sync.set({ extensionEnabled: isChecked }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.url?.includes('youtube.com')) {
                    chrome.tabs.reload(tabs[0].id);
                }
            });
        });
    });

    // ── Open options page ─────────────────────────────────────────────
    openOptionsBtn.addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('options.html'));
        }
    });
});