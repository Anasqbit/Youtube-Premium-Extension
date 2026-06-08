// scripts/speed-controller.js
(function () {
    'use strict';

    function init(config) {
        if (!config.extensionEnabled || !config.feature_speedController) return;
        console.log('[YT Premium+] Speed Controller active');

        const MAX_SPEED = 10;
        const MIN_SPEED = 0.25;
        let isUpdating = false;
        let isDragging = false;
        let lastUserSetRate = null;
        let lastUserSetTimeout = null;
        let currentDragRate = null;
        let rafId = null;

        function injectProtectionCSS() {
            if (document.getElementById('yt-speed-protection-css')) return;
            const style = document.createElement('style');
            style.id = 'yt-speed-protection-css';
            style.textContent = `
                .ytp-speedslider.yt-custom-dragging {
                    background: linear-gradient(to right,
                        #fff 0%,
                        #fff var(--yt-custom-percent, 0%),
                        rgba(255,255,255,0.2) var(--yt-custom-percent, 0%),
                        rgba(255,255,255,0.2) 100%) !important;
                }
            `;
            document.head.appendChild(style);
        }

        function calcPercent(rate) {
            return ((rate - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 100;
        }

        function forceCorrectFill(slider, rate) {
            const percent = calcPercent(rate);
            slider.style.setProperty('--yt-custom-percent', `${percent}%`);
            slider.style.setProperty('--yt-slider-shape-gradient-percent', `${percent}%`);
        }

        function dragRenderLoop() {
            if (!isDragging) { rafId = null; return; }
            const slider = document.querySelector('.ytp-speedslider');
            if (slider && currentDragRate !== null) forceCorrectFill(slider, currentDragRate);
            rafId = requestAnimationFrame(dragRenderLoop);
        }

        function updateExternalMenuLabel(text) {
            const menuItems = document.querySelectorAll('.ytp-menuitem');
            menuItems.forEach(item => {
                const label = item.querySelector('.ytp-menuitem-label');
                if (label && (label.innerText.includes('سرعة التشغيل') || label.innerText.includes('Playback speed'))) {
                    const content = item.querySelector('.ytp-menuitem-content');
                    if (content && content.innerText !== text) content.innerText = text;
                }
            });
        }

        function syncUIWithVideoSpeed(force = false) {
            const videoElement = document.querySelector('video');
            const speedSlider = document.querySelector('.ytp-speedslider');
            if (!videoElement || !speedSlider || isUpdating) return;
            if (isDragging && !force) return;
            const currentPlaybackRate = videoElement.playbackRate;
            const currentValText = currentPlaybackRate.toFixed(2) + 'x';
            isUpdating = true;
            if (speedSlider.getAttribute('max') !== String(MAX_SPEED)) {
                speedSlider.setAttribute('max', String(MAX_SPEED));
                speedSlider.ariaValueMax = String(MAX_SPEED);
            }
            if (parseFloat(speedSlider.value) !== currentPlaybackRate) {
                speedSlider.value = currentPlaybackRate;
            }
            const textLabel = document.querySelector('.ytp-speedslider-text');
            const displayLabel = document.querySelector('.ytp-variable-speed-panel-display span');
            if (textLabel && textLabel.innerText !== currentValText) textLabel.innerText = currentValText;
            if (displayLabel && displayLabel.innerText !== currentValText) displayLabel.innerText = currentValText;
            forceCorrectFill(speedSlider, currentPlaybackRate);
            updateExternalMenuLabel(currentValText);
            setTimeout(() => { isUpdating = false; }, 10);
        }

        function markUserSetRate(rate) {
            lastUserSetRate = rate;
            if (lastUserSetTimeout) clearTimeout(lastUserSetTimeout);
            lastUserSetTimeout = setTimeout(() => { lastUserSetRate = null; }, 1500);
        }

        function fixPlusMinusButtons() {
            if (!window._presetsResetDone) {
                document.querySelectorAll('.ytp-variable-speed-panel-button[data-custom-bound]')
                    .forEach(b => delete b.dataset.customBound);
                window._presetsResetDone = true;
            }
            const allButtons = document.querySelectorAll('.ytp-variable-speed-panel-button');
            const videoElement = document.querySelector('video');
            const speedSlider = document.querySelector('.ytp-speedslider');
            if (!videoElement || !speedSlider || allButtons.length === 0) return;
            allButtons.forEach(button => {
                if (button.dataset.customBound) return;
                const isPreset = button.classList.contains('ytp-variable-speed-panel-preset-button');
                if (isPreset) {
                    button.dataset.customBound = "true";
                    button.addEventListener('click', (e) => {
                        e.preventDefault(); e.stopImmediatePropagation();
                        const span = button.querySelector('span');
                        if (!span) return;
                        const presetValue = parseFloat(span.innerText);
                        if (isNaN(presetValue)) return;
                        const newRate = Math.min(MAX_SPEED, Math.max(MIN_SPEED, presetValue));
                        markUserSetRate(newRate);
                        videoElement.playbackRate = parseFloat(newRate.toFixed(2));
                        speedSlider.value = videoElement.playbackRate;
                        syncUIWithVideoSpeed(true);
                    }, true);
                } else {
                    button.dataset.customBound = "true";
                    button.addEventListener('click', (e) => {
                        e.preventDefault(); e.stopImmediatePropagation();
                        let currentRate = videoElement.playbackRate;
                        const isPlus = button.ariaLabel && (button.ariaLabel.includes('زيادة') || button.ariaLabel.toLowerCase().includes('increase'));
                        if (isPlus) currentRate = Math.min(MAX_SPEED, currentRate + 0.05);
                        else currentRate = Math.max(MIN_SPEED, currentRate - 0.05);
                        markUserSetRate(currentRate);
                        videoElement.playbackRate = parseFloat(currentRate.toFixed(2));
                        speedSlider.value = videoElement.playbackRate;
                        syncUIWithVideoSpeed(true);
                    }, true);
                }
            });
        }

        function bindSliderDragEvents() {
            const speedSlider = document.querySelector('.ytp-speedslider');
            if (!speedSlider || speedSlider.dataset.dragBound) return;
            speedSlider.dataset.dragBound = "true";
            const videoElement = document.querySelector('video');
            const startDrag = () => {
                isDragging = true;
                currentDragRate = videoElement ? videoElement.playbackRate : parseFloat(speedSlider.value);
                if (!rafId) rafId = requestAnimationFrame(dragRenderLoop);
            };
            const endDrag = () => {
                if (!isDragging) return;
                isDragging = false;
                currentDragRate = null;
                if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
                setTimeout(() => syncUIWithVideoSpeed(true), 20);
            };
            speedSlider.addEventListener('mousedown', startDrag);
            speedSlider.addEventListener('touchstart', startDrag, { passive: true });
            speedSlider.addEventListener('keydown', startDrag);
            window.addEventListener('mouseup', endDrag);
            window.addEventListener('touchend', endDrag);
            speedSlider.addEventListener('keyup', endDrag);
        }

        const videoElement = document.querySelector('video');
        if (videoElement) {
            const originalRateDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
            Object.defineProperty(videoElement, 'playbackRate', {
                get: function () { return originalRateDescriptor.get.call(this); },
                set: function (val) {
                    if (lastUserSetRate !== null && val < lastUserSetRate && val <= 2) {
                        originalRateDescriptor.set.call(this, lastUserSetRate);
                        return;
                    }
                    originalRateDescriptor.set.call(this, val);
                },
                configurable: true
            });
            videoElement.addEventListener('ratechange', () => {
                if (isDragging) { currentDragRate = videoElement.playbackRate; return; }
                const currentValText = videoElement.playbackRate.toFixed(2) + 'x';
                updateExternalMenuLabel(currentValText);
                const speedSlider = document.querySelector('.ytp-speedslider');
                if (speedSlider) syncUIWithVideoSpeed();
            });
        }

        let observerTimeout = null;
        const observer = new MutationObserver(() => {
            if (isDragging) return;
            if (observerTimeout) return;
            observerTimeout = setTimeout(() => {
                observerTimeout = null;
                syncUIWithVideoSpeed();
                fixPlusMinusButtons();
                bindSliderDragEvents();
                const vid = document.querySelector('video');
                if (vid) updateExternalMenuLabel(vid.playbackRate.toFixed(2) + 'x');
            }, 50);
        });

        if (document.body) observer.observe(document.body, { childList: true, subtree: true });
        else window.addEventListener('DOMContentLoaded', () => observer.observe(document.body, { childList: true, subtree: true }));

        document.addEventListener('input', (e) => {
            if (e.target && e.target.classList && e.target.classList.contains('ytp-speedslider')) {
                const vid = document.querySelector('video');
                if (vid) {
                    const newRate = parseFloat(e.target.value);
                    markUserSetRate(newRate);
                    currentDragRate = newRate;
                    isUpdating = true;
                    vid.playbackRate = newRate;
                    const textLabel = document.querySelector('.ytp-speedslider-text');
                    if (textLabel) textLabel.innerText = newRate.toFixed(2) + 'x';
                    setTimeout(() => { isUpdating = false; }, 10);
                }
            }
        }, true);

        document.addEventListener('change', (e) => {
            if (e.target && e.target.classList && e.target.classList.contains('ytp-speedslider')) {
                e.stopImmediatePropagation();
                const newRate = parseFloat(e.target.value);
                const vid = document.querySelector('video');
                if (!isNaN(newRate) && vid) {
                    markUserSetRate(newRate);
                    isUpdating = true;
                    vid.playbackRate = newRate;
                    setTimeout(() => { isUpdating = false; }, 10);
                }
            }
        }, true);

        injectProtectionCSS();
        syncUIWithVideoSpeed(true);
        fixPlusMinusButtons();
        bindSliderDragEvents();
        if (videoElement) updateExternalMenuLabel(videoElement.playbackRate.toFixed(2) + 'x');
    }

    document.addEventListener('ytPremiumConfigReady', (e) => init(e.detail));
})();