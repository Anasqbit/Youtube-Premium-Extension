// scripts/downloader.js
(function () {
    'use strict';

    function init(config) {
        if (!config.extensionEnabled || !config.feature_downloader) return;
        console.log('[YT Premium+] Video Downloader active');

        // ════════ bgFetch: استبدال GM_xmlhttpRequest ════════
        function bgFetch(opts) {
            return new Promise((resolve) => {
                const url = opts.url;
                const fetchOptions = {
                    method: opts.method || 'GET',
                    headers: opts.headers || {},
                };
                if (opts.data) fetchOptions.body = opts.data;

                chrome.runtime.sendMessage(
                    { type: 'fetchRequest', url, options: fetchOptions },
                    (response) => {
                        if (chrome.runtime.lastError || !response) {
                            resolve({ status: 0, responseText: '', error: true });
                            return;
                        }
                        if (!response.success) {
                            resolve({ status: 0, responseText: '', error: true });
                            return;
                        }
                        resolve({
                            status: response.status,
                            responseText: response.body,
                        });
                    }
                );
            });
        }

        function GM_xmlhttpRequest(opts) {
            bgFetch(opts).then(res => {
                if (res.error) {
                    if (opts.onerror) opts.onerror(res);
                    return;
                }
                if (opts.onload) opts.onload(res);
            });
        }

        const ANY4K_PAGE = 'https://any4k.com/download/youtube/';
        const API_DOWNLOAD = 'https://api.any4k.com/v1/dlp/download';
        const API_PROGRESS = 'https://api.any4k.com/v1/dlp/download_progress';
        const API_FILE = 'https://api.any4k.com/v1/file/o';
        const DEVICE_ID = '00000000000000000000000000000000';

        const VID_IDS = {
            WRAPPER: 'yt-dl-wrapper',
            FMT_BTN: 'yt-dl-fmt-btn',
            DL_BTN: 'yt-dl-dl-btn',
            POPUP: 'yt-dl-popup',
            BACKDROP: 'yt-dl-backdrop',
            STYLE: 'yt-dl-style',
        };

        let cache = { videoId: null, groups: null, title: null };
        let selectedFmt = null;

        const commonFields = () => ({
            lang: 'en', country: 'US', platform: 'Web',
            sysVer: '1.0', appVer: '1.0',
            bundleId: 'OK', deviceId: DEVICE_ID,
        });

        const isWatch = () => location.pathname === '/watch';
        const isShorts = () => location.pathname.startsWith('/shorts/');
        const isDark = () => document.documentElement.hasAttribute('dark');
        const isLive = () => !!(
            window.ytInitialPlayerResponse?.videoDetails?.isLiveContent ||
            document.querySelector('.ytp-live')
        );

        function getVideoId() {
            if (isWatch()) return new URLSearchParams(location.search).get('v');
            if (isShorts()) return location.pathname.split('/shorts/')[1]?.split('/')[0] || null;
            return null;
        }

        function getVideoUrl() {
            const id = getVideoId();
            if (!id) return null;
            return isShorts()
                ? `https://www.youtube.com/shorts/${id}`
                : `https://www.youtube.com/watch?v=${id}`;
        }

        function formatSize(bytes) {
            if (!bytes) return '';
            const mb = bytes / (1024 * 1024);
            if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
            return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(2)} MB`;
        }

        function formatHz(asr) {
            if (!asr) return '';
            return asr >= 1000 ? `${(asr / 1000).toFixed(0)}kHz` : `${asr}Hz`;
        }

        function fixJson(str) {
            return str
                .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')
                .replace(/:\s*"?h"?\b/g, ':"m4a"')
                .replace(/:\s*"?i"?\b/g, ':"mp4a"')
                .replace(/:\s*([a-z])\b(?!")/g, (match, ch) => {
                    if (ch === 'a') return ':true';
                    if (ch === 'c') return ':false';
                    return ':"mp4"';
                })
                .replace(/void\s+0/g, 'null');
        }

        function scrapeFormats(videoId, cb) {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${ANY4K_PAGE}${videoId}`,
                headers: { 'Accept': 'text/html,*/*' },
                timeout: 25000,
                onload(res) {
                    if (res.status !== 200) { cb(`HTTP ${res.status}`); return; }
                    const clean = res.responseText.replace(/\\u002F/g, '/');

                    let title = '';
                    const tm = clean.match(/"title":"((?:[^"\\]|\\.)*)"/);
                    if (tm) {
                        title = tm[1]
                            .replace(/\\u([\dA-Fa-f]{4})/g,
                                (_, h) => String.fromCharCode(parseInt(h, 16)))
                            .replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                    }

                    const dlMatch = clean.match(/download:(\[.*?\]),raw_video/);
                    const audioMatch = clean.match(/raw_audio:(\[.*?\])\}/);
                    const groups = [];

                    if (audioMatch) {
                        try {
                            const list = JSON.parse(fixJson(audioMatch[1]));
                            if (list.length) {
                                groups.push({
                                    label: 'Audio',
                                    items: list.map(f => ({
                                        id: f.id,
                                        label: `${(f.ext || 'm4a').toUpperCase()} ${formatHz(f.asr)} — ${formatSize(f.filesize)}`,
                                        ext: f.ext || 'm4a',
                                    }))
                                });
                            }
                        } catch (e) { console.warn('[YTDl] audio parse:', e); }
                    }

                    if (dlMatch) {
                        try {
                            const list = JSON.parse(fixJson(dlMatch[1]));
                            if (list.length) {
                                groups.push({
                                    label: 'Video + Audio',
                                    items: list.map(f => ({
                                        id: f.id,
                                        label: `MP4 ${f.res_text || ''} — ${formatSize(f.filesize)}`,
                                        ext: 'mp4',
                                    }))
                                });
                            }
                        } catch (e) { console.warn('[YTDl] video parse:', e); }
                    }

                    cache = { videoId, groups, title };
                    cb(null, groups);
                },
                onerror() { cb('Network error'); },
                ontimeout() { cb('Request timed out'); },
            });
        }

        function injectVidStyle() {
            if (document.getElementById(VID_IDS.STYLE)) return;
            const dark = isDark();
            const bg = dark ? '#272727' : '#f2f2f2';
            const hover = dark ? '#3f3f3f' : '#e5e5e5';
            const color = dark ? '#fff' : '#030303';
            const popBg = dark ? '#1e1e1e' : '#fff';
            const popBd = dark ? '#444' : '#ddd';
            const grpCl = dark ? '#999' : '#666';

            const s = document.createElement('style');
            s.id = VID_IDS.STYLE;
            s.textContent = `
#${VID_IDS.WRAPPER}{display:inline-flex;align-items:center;gap:6px;margin:0 8px;}
.yt-dl-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:36px;padding:0 14px;border:none;border-radius:18px;background:${bg};color:${color};font:500 14px/1 "Roboto","Arial",sans-serif;cursor:pointer;white-space:nowrap;transition:background .15s;box-sizing:border-box;}
.yt-dl-btn:hover:not(:disabled){background:${hover};}
.yt-dl-btn:disabled{opacity:.5;cursor:not-allowed;}
#${VID_IDS.FMT_BTN}{min-width:155px;max-width:220px;justify-content:space-between;padding:0 10px 0 14px;}
#${VID_IDS.FMT_BTN} .arr{width:0;height:0;flex-shrink:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid currentColor;margin-left:4px;}
#${VID_IDS.BACKDROP}{position:fixed;inset:0;z-index:2200;background:rgba(0,0,0,0.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:yt-dl-fade-in .15s ease;}
@keyframes yt-dl-fade-in{from{opacity:0}to{opacity:1}}
#${VID_IDS.POPUP}{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2201;background:${popBg};color:${color};border:1px solid ${popBd};border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.4);padding:8px;width:320px;max-width:calc(100vw - 32px);max-height:70vh;overflow-y:auto;animation:yt-dl-popup-in .18s ease;}
@keyframes yt-dl-popup-in{from{opacity:0;transform:translate(-50%,-48%)}to{opacity:1;transform:translate(-50%,-50%)}}
.yt-dl-popup-header{display:flex;align-items:center;justify-content:space-between;padding:6px 8px 10px;font-size:13px;font-weight:700;color:${grpCl};border-bottom:1px solid ${popBd};margin-bottom:4px;}
.yt-dl-popup-close{background:none;border:none;cursor:pointer;color:${grpCl};font-size:18px;line-height:1;padding:0 4px;border-radius:4px;transition:color .15s;}
.yt-dl-popup-close:hover{color:${color};}
.yt-dl-grp{font-size:11px;font-weight:700;color:${grpCl};text-transform:uppercase;letter-spacing:.5px;padding:10px 8px 4px;user-select:none;}
.yt-dl-opt{display:block;width:100%;padding:9px 12px;font-size:13.5px;background:none;border:none;border-radius:8px;color:inherit;cursor:pointer;text-align:left;box-sizing:border-box;transition:background .1s;}
.yt-dl-opt:hover{background:${hover};}
.yt-dl-opt.active{font-weight:700;background:rgba(62,130,247,.13);color:${dark ? '#60a5fa' : '#1d4ed8'};}
.yt-dl-spin-wrap{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;padding:28px;font-size:13px;color:${grpCl};}
.yt-dl-spin{width:26px;height:26px;border-radius:50%;border:2.5px solid ${dark ? '#444' : '#ddd'};border-top-color:${dark ? '#fff' : '#333'};animation:yt-dl-rot .7s linear infinite;}
@keyframes yt-dl-rot{to{transform:rotate(360deg);}}
.yt-dl-loading{background:#d97706 !important;color:#fff !important;}
.yt-dl-done{background:#16a34a !important;color:#fff !important;}
            `;
            document.head.appendChild(s);
        }

        function makeSvgIcon(w, h, strokeW, paths) {
            const NS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('width', w); svg.setAttribute('height', h);
            svg.style.cssText = `flex-shrink:0;fill:none;stroke:currentColor;stroke-width:${strokeW};stroke-linecap:round;stroke-linejoin:round;`;
            paths.forEach(d => {
                const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.appendChild(p);
            });
            return svg;
        }

        const DL_PATHS = ['M12 4v12', 'M8 12l4 4 4-4', 'M4 18h16'];
        const makeVidIcon = () => makeSvgIcon('16', '16', '2.2', DL_PATHS);

        function findContainer() {
            if (isWatch()) return document.querySelector('#top-level-buttons-computed');
            if (isShorts()) return document.querySelector('#end');
            return null;
        }

        function buildVidUI(container) {
            if (document.getElementById(VID_IDS.WRAPPER)) return;
            injectVidStyle();

            const fmtLabel = document.createElement('span');
            fmtLabel.textContent = 'Select Format';
            const arr = document.createElement('span');
            arr.className = 'arr';

            const fmtBtn = document.createElement('button');
            fmtBtn.id = VID_IDS.FMT_BTN;
            fmtBtn.className = 'yt-dl-btn';
            fmtBtn.appendChild(fmtLabel);
            fmtBtn.appendChild(arr);
            fmtBtn.addEventListener('click', onFmtClick);

            const dlLabel = document.createElement('span');
            dlLabel.textContent = 'Download';

            const dlBtn = document.createElement('button');
            dlBtn.id = VID_IDS.DL_BTN;
            dlBtn.className = 'yt-dl-btn';
            dlBtn.appendChild(makeVidIcon());
            dlBtn.appendChild(dlLabel);
            dlBtn.addEventListener('click', onDlClick);

            const wrapper = document.createElement('div');
            wrapper.id = VID_IDS.WRAPPER;
            wrapper.appendChild(fmtBtn);
            wrapper.appendChild(dlBtn);

            const like = container.querySelector('#segmented-like-button');
            if (like) like.after(wrapper);
            else container.appendChild(wrapper);

            syncVidDisabled();
        }

        function removeVidUI() {
            document.getElementById(VID_IDS.WRAPPER)?.remove();
            closePopup();
            cache = { videoId: null, groups: null, title: null };
            selectedFmt = null;
        }

        function syncVidDisabled() {
            const off = !(isWatch() || isShorts()) || isLive();
            [VID_IDS.FMT_BTN, VID_IDS.DL_BTN].forEach(id => {
                const b = document.getElementById(id);
                if (b && !b.dataset.loading) b.disabled = off;
            });
            const vid = getVideoId();
            if (vid && vid !== cache.videoId) {
                cache = { videoId: null, groups: null, title: null };
                selectedFmt = null;
                const lbl = document.querySelector(`#${VID_IDS.FMT_BTN} span`);
                if (lbl) lbl.textContent = 'Select Format';
            }
        }

        function onFmtClick(e) {
            e.stopPropagation();
            if (document.getElementById(VID_IDS.POPUP)) { closePopup(); return; }
            openPopup();
        }

        function openPopup() {
            const backdrop = document.createElement('div');
            backdrop.id = VID_IDS.BACKDROP;
            backdrop.addEventListener('click', closePopup);
            document.body.appendChild(backdrop);

            const popup = document.createElement('div');
            popup.id = VID_IDS.POPUP;

            const header = document.createElement('div');
            header.className = 'yt-dl-popup-header';
            const headerTitle = document.createElement('span');
            headerTitle.textContent = 'Choose Quality';
            const closeBtn = document.createElement('button');
            closeBtn.className = 'yt-dl-popup-close';
            closeBtn.textContent = '✕';
            closeBtn.addEventListener('click', closePopup);
            header.appendChild(headerTitle);
            header.appendChild(closeBtn);
            popup.appendChild(header);
            document.body.appendChild(popup);

            const vid = getVideoId();
            if (cache.videoId === vid && cache.groups) {
                renderFormats(popup, cache.groups);
            } else {
                showSpinner(popup, 'Loading formats…');
                scrapeFormats(vid, (err, groups) => {
                    const p = document.getElementById(VID_IDS.POPUP);
                    if (!p) return;
                    while (p.children.length > 1) p.removeChild(p.lastChild);
                    if (err) {
                        const spinWrap = p.querySelector('.yt-dl-spin-wrap');
                        if (spinWrap) spinWrap.remove();
                        const errEl = document.createElement('div');
                        errEl.className = 'yt-dl-spin-wrap';
                        errEl.textContent = '❌ Failed to load formats';
                        p.appendChild(errEl);
                        return;
                    }
                    renderFormats(p, groups);
                });
            }

            document.addEventListener('keydown', onEscKey, true);
        }

        function showSpinner(popup, text) {
            const wrap = document.createElement('div');
            wrap.className = 'yt-dl-spin-wrap';
            const spin = document.createElement('div');
            spin.className = 'yt-dl-spin';
            const lbl = document.createElement('span');
            lbl.textContent = text;
            wrap.appendChild(spin);
            wrap.appendChild(lbl);
            popup.appendChild(wrap);
        }

        function renderFormats(popup, groups) {
            if (!groups || groups.length === 0) {
                const errEl = document.createElement('div');
                errEl.className = 'yt-dl-spin-wrap';
                errEl.textContent = '❌ No formats available';
                popup.appendChild(errEl);
                return;
            }

            groups.forEach(({ label, items }) => {
                const grp = document.createElement('div');
                grp.className = 'yt-dl-grp';
                grp.textContent = label;
                popup.appendChild(grp);

                items.forEach(fmt => {
                    const btn = document.createElement('button');
                    btn.className = 'yt-dl-opt' + (selectedFmt?.id === fmt.id ? ' active' : '');
                    btn.textContent = fmt.label;
                    btn.addEventListener('click', () => {
                        selectedFmt = fmt;
                        const lbl = document.querySelector(`#${VID_IDS.FMT_BTN} span`);
                        if (lbl) lbl.textContent = fmt.label;
                        closePopup();
                    });
                    popup.appendChild(btn);
                });
            });
        }

        function closePopup() {
            document.getElementById(VID_IDS.POPUP)?.remove();
            document.getElementById(VID_IDS.BACKDROP)?.remove();
            document.querySelectorAll('tp-yt-iron-overlay-backdrop').forEach(el => el.remove());
            document.removeEventListener('keydown', onEscKey, true);
        }

        function onEscKey(e) {
            if (e.key === 'Escape') closePopup();
        }

        function onDlClick() {
            const dlBtn = document.getElementById(VID_IDS.DL_BTN);
            const fmtBtn = document.getElementById(VID_IDS.FMT_BTN);
            if (!dlBtn || !fmtBtn || dlBtn.dataset.loading) return;
            if (!selectedFmt) { alert('Please select a format first'); return; }

            const url = getVideoUrl();
            if (!url) return;

            const dlLabel = dlBtn.querySelector('span');
            const icon = dlBtn.querySelector('svg');

            const setLoading = txt => {
                dlBtn.dataset.loading = '1';
                dlBtn.disabled = true;
                fmtBtn.disabled = true;
                if (icon) icon.style.display = 'none';
                dlLabel.textContent = txt;
                dlBtn.classList.add('yt-dl-loading');
            };

            const resetBtn = () => {
                delete dlBtn.dataset.loading;
                dlBtn.classList.remove('yt-dl-loading', 'yt-dl-done');
                if (icon) icon.style.display = '';
                dlLabel.textContent = 'Download';
                syncVidDisabled();
            };

            const setDone = () => {
                dlBtn.classList.remove('yt-dl-loading');
                dlBtn.classList.add('yt-dl-done');
                if (icon) icon.style.display = 'none';
                dlLabel.textContent = '✅ Done!';
                setTimeout(resetBtn, 3000);
            };

            setLoading('⏳ Starting…');
            startAny4kDownload(url, dlLabel, setDone, resetBtn);
        }

        function startAny4kDownload(videoUrl, dlLabel, setDone, resetBtn) {
            GM_xmlhttpRequest({
                method: 'POST',
                url: API_DOWNLOAD,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({
                    url: videoUrl,
                    format: selectedFmt.id,
                    ...commonFields()
                }),
                timeout: 25000,
                onload(res) {
                    let json;
                    try { json = JSON.parse(res.responseText); }
                    catch { alert('❌ Bad server response'); resetBtn(); return; }

                    if (json?.err_code !== 0) {
                        alert(`❌ ${json?.err_msg || 'API error'}`);
                        resetBtn(); return;
                    }

                    const dlId = json.id;
                    if (!dlId) { alert('❌ No download ID'); resetBtn(); return; }

                    dlLabel.textContent = '⏳ 0%';
                    listenSSE(dlId, 0, dlLabel, setDone, resetBtn);
                },
                onerror() { alert('❌ Network error'); resetBtn(); },
                ontimeout() { alert('❌ Timeout'); resetBtn(); },
            });
        }

        function listenSSE(dlId, attempt, dlLabel, setDone, resetBtn) {
            if (attempt > 8) { alert('❌ Failed after multiple retries.'); resetBtn(); return; }

            let es;
            let finished = false;

            const finish = fn => {
                if (finished) return;
                finished = true;
                try { es?.close(); } catch (e) { }
                fn();
            };

            try {
                es = new EventSource(`${API_PROGRESS}?id=${dlId}`);
            } catch (e) {
                alert('❌ EventSource not supported');
                resetBtn(); return;
            }

            es.addEventListener('progress', e => {
                const n = parseFloat(e.data);
                if (!isNaN(n)) dlLabel.textContent = `⏳ ${Math.floor(n)}%`;
            });

            es.addEventListener('done', () => {
                finish(() => {
                    triggerIframeDownload(`${API_FILE}?i=${dlId}`);
                    setDone();
                });
            });

            es.addEventListener('error', e => {
                const data = e.data || '';
                if (data.includes('High demand')) {
                    finish(() => {
                        dlLabel.textContent = `⏳ Queue (${attempt + 1})…`;
                        setTimeout(() => listenSSE(dlId, attempt + 1, dlLabel, setDone, resetBtn), 40000);
                    });
                    return;
                }
                if (data) { finish(() => { alert(`❌ ${data}`); resetBtn(); }); }
            });

            const guard = setTimeout(() => {
                finish(() => setTimeout(() => listenSSE(dlId, attempt + 1, dlLabel, setDone, resetBtn), 2000));
            }, 300000);

            es.addEventListener('done', () => clearTimeout(guard));
            es.addEventListener('error', () => clearTimeout(guard));
        }

        function triggerIframeDownload(fileUrl) {
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'display:none;width:0;height:0;border:none;position:fixed;';
            iframe.src = fileUrl;
            document.body.appendChild(iframe);
            setTimeout(() => iframe.remove(), 60000);
        }

        function checkAndInject() {
            const container = findContainer();
            const vidExisting = document.getElementById(VID_IDS.WRAPPER);
            if (container && !vidExisting) buildVidUI(container);
            else if (!container && vidExisting) removeVidUI();
            else syncVidDisabled();
        }

        let moTimer = null;
        new MutationObserver(() => {
            if (moTimer) return;
            moTimer = setTimeout(() => { moTimer = null; checkAndInject(); }, 350);
        }).observe(document.body, { childList: true, subtree: true });

        document.addEventListener('yt-navigate-finish', () => {
            removeVidUI();
            setTimeout(checkAndInject, 900);
            setTimeout(checkAndInject, 2500);
        });

        window.addEventListener('load', () => {
            checkAndInject();
            setTimeout(checkAndInject, 1800);
        });

        if (document.body) checkAndInject();
    }

    document.addEventListener('ytPremiumConfigReady', (e) => init(e.detail));
})();