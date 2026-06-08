document.addEventListener('DOMContentLoaded', async function () {
    const languageSelect = document.getElementById('languageSelect');
    const saveBtn = document.getElementById('saveBtn');
    const toast = document.getElementById('toast');

    const features = ['premiumLogo', 'returnDislike', 'downloader', 'speedController'];

    async function loadMessages(lang) {
        try {
            const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
            const res = await fetch(url);
            return await res.json();
        } catch (e) { return null; }
    }

    function applyI18n(messages, lang) {
        if (lang === 'ar') document.body.classList.add('rtl');
        else document.body.classList.remove('rtl');

        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (messages && messages[key]) {
                el.textContent = messages[key].message;
            }
        });
    }

    // Load saved settings
    const defaults = {
        language: 'en',
        feature_premiumLogo: true,
        feature_returnDislike: true,
        feature_downloader: true,
        feature_speedController: true
    };

    chrome.storage.sync.get(defaults, async function (data) {
        languageSelect.value = data.language;
        features.forEach(f => {
            document.getElementById('feature_' + f).checked = data['feature_' + f];
        });
        const messages = await loadMessages(data.language);
        applyI18n(messages, data.language);
    });

    // Language change preview
    languageSelect.addEventListener('change', async () => {
        const lang = languageSelect.value;
        const messages = await loadMessages(lang);
        applyI18n(messages, lang);
    });

    // Save
    saveBtn.addEventListener('click', function () {
        const toSave = { language: languageSelect.value };
        features.forEach(f => {
            toSave['feature_' + f] = document.getElementById('feature_' + f).checked;
        });
        chrome.storage.sync.set(toSave, function () {
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2000);

            // Reload all YouTube tabs
            chrome.tabs.query({ url: '*://*.youtube.com/*' }, function (tabs) {
                tabs.forEach(tab => chrome.tabs.reload(tab.id));
            });
        });
    });
});