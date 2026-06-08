// main.js - ينسق تشغيل الميزات حسب الإعدادات
(function () {
    'use strict';

    // قراءة الإعدادات وحفظها في window عشان السكربتات الثانية تستخدمها
    chrome.storage.sync.get({
        extensionEnabled: true,
        feature_premiumLogo: true,
        feature_returnDislike: true,
        feature_downloader: true,
        feature_speedController: true
    }, function (data) {
        window.__YTPremiumConfig = data;

        if (!data.extensionEnabled) {
            console.log('[YT Premium+] Extension disabled.');
            return;
        }

        console.log('[YT Premium+] Active. Features:', data);

        // كل سكربت بشوف الإعدادات قبل ما يشتغل
        document.dispatchEvent(new CustomEvent('ytPremiumConfigReady', { detail: data }));
    });
})();