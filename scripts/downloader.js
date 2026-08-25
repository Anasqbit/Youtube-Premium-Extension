// scripts/downloader.js
(function () {
    'use strict';

    function init(config) {
        if (!config.extensionEnabled || !config.feature_downloader) return;
        console.log('[YT Premium+] Video Downloader active');

        function bgFetch(opts) {
            return new Promise((resolve) => {
                const url = opts.url;
                const fetchOptions = {
                    method: opts.method || 'GET',
                    headers: opts.headers || {},
                    credentials: 'include',
                };
                if (opts.data) fetchOptions.body = opts.data;

                const timeoutMs = opts.timeout || 25000;
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject({ timeout: true }), timeoutMs)
                );

                const fetchPromise = new Promise((res) => {
                    chrome.runtime.sendMessage(
                        { type: 'fetchRequest', url, options: fetchOptions },
                        (response) => {
                            if (chrome.runtime.lastError || !response) {
                                res({ status: 0, responseText: '', error: true });
                                return;
                            }
                            if (!response.success) {
                                res({ status: 0, responseText: '', error: true });
                                return;
                            }
                            res({
                                status: response.status,
                                responseText: response.body,
                            });
                        }
                    );
                });

                Promise.race([fetchPromise, timeoutPromise])
                    .then(resolve)
                    .catch((err) => {
                        if (err && err.timeout) {
                            resolve({ status: 0, responseText: '', timedOut: true });
                        } else {
                            resolve({ status: 0, responseText: '', error: true });
                        }
                    });
            });
        }

        function GM_xmlhttpRequest(opts) {
            bgFetch(opts).then(res => {
                if (res.timedOut) {
                    if (opts.ontimeout) opts.ontimeout(res);
                    return;
                }
                if (res.error) {
                    if (opts.onerror) opts.onerror(res);
                    return;
                }
                if (opts.onload) opts.onload(res);
            });
        }

        const API_INFO = 'https://snapscooper.com/api/tool/post-info';

        const VID_IDS = {
            WRAPPER  : 'yt-dl-wrapper',
            FMT_BTN  : 'yt-dl-fmt-btn',
            DL_BTN   : 'yt-dl-dl-btn',
            POPUP    : 'yt-dl-popup',
            BACKDROP : 'yt-dl-backdrop',
            STYLE    : 'yt-dl-style',
        };

        let cache = { videoId: null, groups: null, title: null };
        let selectedFmt = null;

        

        const isWatch  = () => location.pathname === '/watch';
        const isShorts = () => location.pathname.startsWith('/shorts/');
        const isDark   = () => document.documentElement.hasAttribute('dark');
        const isLive   = () => !!(
            window.ytInitialPlayerResponse?.videoDetails?.isLiveContent ||
            document.querySelector('.ytp-live')
        );

        function getVideoId() {
            if (isWatch())  return new URLSearchParams(location.search).get('v');
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

        function buildFileName(rawTitle, fmt) {
            let title = rawTitle || 'video';
            title = title.replace(/\s*[-–|]\s*YouTube\s*$/i, '').trim();
            title = title.replace(/snapscooper\.com[-\s]*/gi, '').trim();
            title = title.replace(/_/g, ' ');
            title = title.replace(/\s{2,}/g, ' ').trim();
            title = title.replace(/[\\/:*?"<>|]/g, '').trim();
            title = title.slice(0, 120) || 'video';
            const qualityLabel = extractQualityLabel(fmt.label);
            if (qualityLabel) return `${title} (${qualityLabel}).${fmt.ext}`;
            return `${title}.${fmt.ext}`;
        }

        function extractQualityLabel(label) {
            const match = label.match(/(\d+(?:\.\d+)?(?:kHz|p))/i);
            return match ? match[1] : '';
        }

        function formatSize(bytes) {
            if (!bytes) return '';
            const mb = bytes / (1024 * 1024);
            if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
            return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(2)} MB`;
        }

        

        function scrapeFormats(videoId, cb) {
            const url = getVideoUrl() ||
                (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
            if (!url) { cb('No video URL'); return; }

            GM_xmlhttpRequest({
                method  : 'POST',
                url     : API_INFO,
                headers : {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                data    : JSON.stringify({ toolId: 'youtube', url, highres: true }),
                timeout : 25_000,
                onload(res) {
                    if (res.status < 200 || res.status >= 300) {
                        cb(`HTTP ${res.status}`);
                        return;
                    }

                    let json;
                    try { json = JSON.parse(res.responseText); }
                    catch { cb('Bad server response'); return; }

                    const content = Array.isArray(json?.contents) ? json.contents[0] : null;
                    if (!content) { cb('No formats found'); return; }

                    const extensionFor = (mime, fallback) => {
                        const value = String(mime || '').toLowerCase();
                        if (value.includes('webm')) return 'webm';
                        if (value.includes('mp4')) return 'mp4';
                        return fallback;
                    };
                    const withSize = (label, bytes) => {
                        const size = formatSize(bytes);
                        return size ? `${label} — ${size}` : label;
                    };
                    const capitalizeFirst = value => {
                        const text = String(value || '').trim();
                        return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : '';
                    };
                    const formatLanguage = value => String(value || '').trim()
                        .split(/([\s_-]+)/)
                        .filter(Boolean)
                        .map(part => {
                            if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase();
                            if (/^[A-Za-z]/.test(part)) return capitalizeFirst(part);
                            return part;
                        })
                        .join('');
                    const formatAudioLabel = (rawLabel, ext) => {
                        const raw = String(rawLabel || '').trim();
                        const match = raw.match(/^([A-Za-z][A-Za-z_-]*)\s+[\d.]+\s*kBps\b(?:\s+(.+?))?$/i);
                        const quality = capitalizeFirst(match?.[1] || raw.split(/\s+/)[0] || 'Audio');
                        const language = formatLanguage(match?.[2] || '');
                        const format = [String(ext || 'm4a').toUpperCase(), language]
                            .filter(Boolean)
                            .join(' ');
                        return [quality, format].filter(Boolean).join(' - ');
                    };
                    const audioSortData = (rawLabel, ext) => {
                        const raw = String(rawLabel || '').trim();
                        const quality = raw.match(/^([A-Za-z]+)/)?.[1]?.toLowerCase() || '';
                        const language = raw.match(/kBps\b\s+(.+)$/i)?.[1]?.trim() || '';
                        const qualityRank = { ultralow: 1, low: 2, medium: 3, high: 4, original: 5 }[quality] || 0;
                        const formatRank = String(ext || '').toLowerCase() === 'webm' ? 1 : 2;
                        return {
                            isOriginal: /(?:^|[\s_-])original(?:$|[\s_-])/i.test(raw),
                            qualityRank,
                            languageKey: language.replace(/[_-]+/g, ' ').toLowerCase(),
                            formatRank,
                        };
                    };
                    const groups = [];

                    const audioItems = (Array.isArray(content.audios) ? content.audios : [])
                        .filter(f => f?.url)
                        .map(f => {
                            const ext = extensionFor(f.mime_type, 'm4a');
                            const sortData = audioSortData(f.label, ext);
                            const audioLabel = formatAudioLabel(f.label, ext);
                            return {
                                id    : f.url,
                                url   : f.url,
                                label : withSize(audioLabel, f.content_length),
                                buttonLabel : audioLabel,
                                ext,
                                isRender : false,
                                _isOriginal : sortData.isOriginal,
                                _qualityRank : sortData.qualityRank,
                                _languageKey : sortData.languageKey,
                                _formatRank : sortData.formatRank,
                            };
                        })
                        .sort((a, b) =>
                            Number(b._isOriginal) - Number(a._isOriginal) ||
                            b._qualityRank - a._qualityRank ||
                            (a._languageKey < b._languageKey ? -1 : a._languageKey > b._languageKey ? 1 : 0) ||
                            a._formatRank - b._formatRank,
                        )
                        .map(({ _isOriginal, _qualityRank, _languageKey, _formatRank, ...format }) => format);
                    if (audioItems.length) groups.push({ label: 'Audio', items: audioItems });

                    const videoItems = (Array.isArray(content.videos) ? content.videos : [])
                        .filter(f => f?.url && f?.has_audio !== false)
                        .map(f => ({
                            id    : f.url,
                            url   : f.url,
                            label : withSize(f.label || 'Video', f.content_length),
                            ext   : extensionFor(f.mime_type, 'mp4'),
                            isRender : f.is_render === true,
                        }));
                    if (videoItems.length) groups.push({ label: 'Video + Audio', items: videoItems });

                    const videoOnlyItems = (Array.isArray(content.videos) ? content.videos : [])
                        .filter(f => f?.url && f?.has_audio === false)
                        .map(f => ({
                            id    : f.url,
                            url   : f.url,
                            label : withSize(`${f.label || 'Video'} (video only)`, f.content_length),
                            ext   : extensionFor(f.mime_type, 'mp4'),
                            isRender : f.is_render === true,
                        }));
                    if (videoOnlyItems.length) groups.push({ label: 'Video Only', items: videoOnlyItems });

                    if (!groups.length) { cb('Could not parse formats'); return; }
                    cache = {
                        videoId,
                        groups,
                        title: typeof json?.title === 'string' ? json.title : '',
                    };
                    cb(null, groups);
                },
                onerror  () { cb('Network error'); },
                ontimeout() { cb('Request timed out'); },
            });
        }

        // ══════════════════════════════════════════════════
        // Style — بستايل يوتيوب (7.2.0)
        // ══════════════════════════════════════════════════
        function injectVidStyle() {
            if (document.getElementById(VID_IDS.STYLE)) return;
            const dark  = isDark();
            const hover = dark ? '#3f3f3f' : '#e5e5e5';
            const color = dark ? '#fff'    : '#030303';
            const popBg = dark ? '#1e1e1e' : '#fff';
            const popBd = dark ? '#444'    : '#ddd';
            const grpCl = dark ? '#999'    : '#666';

            const s = document.createElement('style');
            s.id = VID_IDS.STYLE;
            s.textContent = `
#${VID_IDS.WRAPPER}{display:inline-flex;align-items:center;gap:6px;margin:0 8px;}
#${VID_IDS.BACKDROP}{
    position:fixed;inset:0;z-index:2200;
    background:rgba(0,0,0,0.55);
    backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);
    animation:yt-dl-fade-in .15s ease;
}
@keyframes yt-dl-fade-in{from{opacity:0}to{opacity:1}}
#${VID_IDS.POPUP}{
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    z-index:2201;background:${popBg};color:${color};
    border:1px solid ${popBd};border-radius:14px;
    box-shadow:0 20px 60px rgba(0,0,0,.4);
    padding:8px;width:320px;max-width:calc(100vw - 32px);
    max-height:70vh;overflow-y:auto;
    animation:yt-dl-popup-in .18s ease;
}
@keyframes yt-dl-popup-in{
    from{opacity:0;transform:translate(-50%,-48%)}
    to  {opacity:1;transform:translate(-50%,-50%)}
}
.yt-dl-popup-header{
    display:flex;align-items:center;justify-content:space-between;
    padding:6px 8px 10px;font-size:13px;font-weight:700;color:${grpCl};
    border-bottom:1px solid ${popBd};margin-bottom:4px;
}
.yt-dl-popup-close{
    background:none;border:none;cursor:pointer;color:${grpCl};
    font-size:18px;line-height:1;padding:0 4px;border-radius:4px;transition:color .15s;
}
        .yt-dl-popup-close:hover{color:${color};}
.yt-dl-tabs{
    display:flex;gap:4px;padding:4px;margin:0 0 4px;
    border-bottom:1px solid ${popBd};
}
.yt-dl-tab{
    flex:1;border:none;border-radius:7px 7px 0 0;padding:9px 8px;
    background:transparent;color:${grpCl};cursor:pointer;font-size:12px;font-weight:700;
    transition:background .12s,color .12s;
}
.yt-dl-tab:hover{background:${hover};color:${color};}
.yt-dl-tab.active{background:rgba(62,130,247,.15);color:${dark ? '#60a5fa' : '#1d4ed8'};}
.yt-dl-tab-panel{display:none;}
.yt-dl-tab-panel.active{display:block;}
.yt-dl-empty{padding:24px 12px;text-align:center;font-size:13px;color:${grpCl};}
.yt-dl-grp{
    font-size:11px;font-weight:700;color:${grpCl};
    text-transform:uppercase;letter-spacing:.5px;padding:10px 8px 4px;user-select:none;
}
.yt-dl-opt{
    display:block;width:100%;padding:9px 12px;font-size:13.5px;
    background:none;border:none;border-radius:8px;
    color:inherit;cursor:pointer;text-align:left;
    box-sizing:border-box;transition:background .1s;
}
.yt-dl-opt:hover{background:${hover};}
.yt-dl-opt.active{font-weight:700;background:rgba(62,130,247,.13);color:${dark ? '#60a5fa' : '#1d4ed8'};}
.yt-dl-spin-wrap{
    display:flex;align-items:center;justify-content:center;
    flex-direction:column;gap:10px;padding:28px;font-size:13px;color:${grpCl};
}
.yt-dl-spin{
    width:26px;height:26px;border-radius:50%;
    border:2.5px solid ${dark ? '#444' : '#ddd'};
    border-top-color:${dark ? '#fff' : '#333'};
    animation:yt-dl-rot .7s linear infinite;
}
@keyframes yt-dl-rot{to{transform:rotate(360deg);}}
.yt-dl-loading{background:#d97706 !important;color:#fff !important;border-color:transparent !important;}
.yt-dl-done   {background:#16a34a !important;color:#fff !important;border-color:transparent !important;}
.yt-dl-loading .ytSpecButtonShapeNextButtonTextContent,
.yt-dl-done    .ytSpecButtonShapeNextButtonTextContent{color:#fff !important;}
            `;
            document.head.appendChild(s);
        }

        // ══════════════════════════════════════════════════
        // SVG Icons
        // ══════════════════════════════════════════════════
        function makeDownloadSvg() {
            const NS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('height', '24');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('width', '24');
            svg.style.cssText = 'pointer-events:none;display:inherit;width:100%;height:100%;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;';
            ['M12 4v12', 'M8 12l4 4 4-4', 'M4 18h16'].forEach(d => {
                const p = document.createElementNS(NS, 'path');
                p.setAttribute('d', d);
                svg.appendChild(p);
            });
            return svg;
        }

        function makeArrowSvg() {
            const NS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('height', '24');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('width', '24');
            svg.style.cssText = 'pointer-events:none;display:inherit;width:100%;height:100%;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;';
            const p = document.createElementNS(NS, 'path');
            p.setAttribute('d', 'M6 9l6 6 6-6');
            svg.appendChild(p);
            return svg;
        }

        // ══════════════════════════════════════════════════
        // createYtButton — يبني زر بستايل يوتيوب
        // ══════════════════════════════════════════════════
        function createYtButton(text, iconSvg, id) {
            const wrapper = document.createElement('yt-button-view-model');
            wrapper.className = 'ytd-menu-renderer';

            const buttonViewModel = document.createElement('button-view-model');
            buttonViewModel.className = 'ytSpecButtonViewModelHost style-scope ytd-menu-renderer';

            const btn = document.createElement('button');
            btn.id = id;
            btn.className = 'ytSpecButtonShapeNextHost ytSpecButtonShapeNextTonal ytSpecButtonShapeNextMono ytSpecButtonShapeNextSizeM ytSpecButtonShapeNextIconLeading ytSpecButtonShapeNextEnableBackdropFilterExperiment';
            btn.setAttribute('aria-label', text);
            btn.setAttribute('aria-disabled', 'false');

            const iconContainer = document.createElement('div');
            iconContainer.className = 'ytSpecButtonShapeNextIcon ytSpecButtonShapeNextElevatedContent';
            iconContainer.setAttribute('aria-hidden', 'true');

            const span1 = document.createElement('span');
            span1.className = 'ytIconWrapperHost';
            span1.style.cssText = 'width:24px;height:24px;';

            const span2 = document.createElement('span');
            span2.className = 'yt-icon-shape ytSpecIconShapeHost';

            const iconDiv = document.createElement('div');
            iconDiv.style.cssText = 'width:100%;height:100%;display:block;fill:currentcolor;';
            iconDiv.appendChild(iconSvg);
            span2.appendChild(iconDiv);
            span1.appendChild(span2);
            iconContainer.appendChild(span1);
            btn.appendChild(iconContainer);

            const textDiv = document.createElement('div');
            textDiv.className = 'ytSpecButtonShapeNextButtonTextContent ytSpecButtonShapeNextElevatedContent';
            textDiv.textContent = text;
            btn.appendChild(textDiv);

            const feedbackShape = document.createElement('yt-touch-feedback-shape');
            feedbackShape.setAttribute('aria-hidden', 'true');
            feedbackShape.className = 'ytSpecTouchFeedbackShapeHost ytSpecTouchFeedbackShapeTouchResponse';
            const strokeDiv = document.createElement('div');
            strokeDiv.className = 'ytSpecTouchFeedbackShapeStroke';
            const fillDiv = document.createElement('div');
            fillDiv.className = 'ytSpecTouchFeedbackShapeFill';
            feedbackShape.appendChild(strokeDiv);
            feedbackShape.appendChild(fillDiv);
            btn.appendChild(feedbackShape);

            const lightShape = document.createElement('yt-light-shape');
            lightShape.setAttribute('aria-hidden', 'true');
            lightShape.className = 'contribYtLightShapeHost contribYtLightShapeStaticRimLight contribYtLightShapeStaticRimLightTonal';
            lightShape.style.cssText = '--yt-light-wash-opacity:0;--yt-light-wash-x:0px;--yt-light-wash-y:0px;--yt-light-wash-size:0px;';
            const washLight = document.createElement('div');
            washLight.className = 'contribYtLightShapeStaticWashLight contribYtLightShapeStaticWashLightTonal';
            lightShape.appendChild(washLight);
            btn.appendChild(lightShape);

            buttonViewModel.appendChild(btn);
            wrapper.appendChild(buttonViewModel);

            return { btn, wrapper };
        }

        function findContainer() {
            if (isWatch())  return document.querySelector('#top-level-buttons-computed');
            if (isShorts()) return document.querySelector('#end');
            return null;
        }

        // ══════════════════════════════════════════════════
        // buildVidUI — أزرار بستايل يوتيوب
        // ══════════════════════════════════════════════════
        function buildVidUI(container) {
            if (document.getElementById(VID_IDS.WRAPPER)) return;
            injectVidStyle();

            const fmtObj = createYtButton('Select Format', makeArrowSvg(),    VID_IDS.FMT_BTN);
            const dlObj  = createYtButton('Download',      makeDownloadSvg(), VID_IDS.DL_BTN);

            fmtObj.btn.addEventListener('click', onFmtClick);
            dlObj.btn.addEventListener('click',  onDlClick);

            const wrapper = document.createElement('div');
            wrapper.id = VID_IDS.WRAPPER;
            wrapper.appendChild(fmtObj.wrapper);
            wrapper.appendChild(dlObj.wrapper);

            const like = container.querySelector('#segmented-like-button');
            if (like) like.after(wrapper);
            else container.appendChild(wrapper);

            setFormatButtonLabel(selectedFmt?.buttonLabel || selectedFmt?.label || 'Select Format');
            syncVidDisabled();
        }

        function removeVidUI() {
            document.getElementById(VID_IDS.WRAPPER)?.remove();
            closePopup();
            cache = { videoId: null, groups: null, title: null };
            selectedFmt = null;
        }

        function setFormatButtonLabel(label) {
            const value = label || 'Select Format';
            const button = document.getElementById(VID_IDS.FMT_BTN);
            const text = button?.querySelector('.ytSpecButtonShapeNextButtonTextContent');
            if (text) {
                text.textContent = value;
                text.setAttribute('title', value);
            }
            if (button) button.setAttribute('aria-label', value);
        }

        // ══════════════════════════════════════════════════
        // syncVidDisabled — تحكم دقيق بالأزرار
        // ══════════════════════════════════════════════════
        function syncVidDisabled() {
            const off = !(isWatch() || isShorts()) || isLive();
            [VID_IDS.FMT_BTN, VID_IDS.DL_BTN].forEach(id => {
                const b = document.getElementById(id);
                if (b && !b.dataset.loading) {
                    b.disabled = off;
                    if (off) {
                        b.setAttribute('aria-disabled', 'true');
                        b.style.opacity = '0.5';
                        b.style.pointerEvents = 'none';
                    } else {
                        b.setAttribute('aria-disabled', 'false');
                        b.style.opacity = '1';
                        b.style.pointerEvents = 'auto';
                    }
                }
            });
            const vid = getVideoId();
            if (vid && vid !== cache.videoId) {
                cache = { videoId: null, groups: null, title: null };
                selectedFmt = null;
                setFormatButtonLabel('Select Format');
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
                        const msg = document.createElement('div');
                        msg.style.cssText = 'padding:20px;font-size:13px;text-align:center;color:#f87171;';
                        msg.textContent = '⚠️ ' + err;
                        p.appendChild(msg);
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
            const groupsByTab = {
                video: groups.filter(({ label }) => label !== 'Audio'),
                audio: groups.filter(({ label }) => label === 'Audio'),
            };
            const tabs = document.createElement('div');
            tabs.className = 'yt-dl-tabs';
            tabs.setAttribute('role', 'tablist');

            const panels = {};
            const tabButtons = {};
            const renderGroupList = (panel, groupList) => {
                if (!groupList.length) {
                    const empty = document.createElement('div');
                    empty.className = 'yt-dl-empty';
                    empty.textContent = 'No formats available';
                    panel.appendChild(empty);
                    return;
                }

                groupList.forEach(({ label, items }) => {
                    if (groupList.length > 1) {
                        const grp = document.createElement('div');
                        grp.className = 'yt-dl-grp';
                        grp.textContent = label;
                        panel.appendChild(grp);
                    }
                    items.forEach(fmt => {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'yt-dl-opt' + (selectedFmt?.id === fmt.id ? ' active' : '');
                        btn.textContent = fmt.label;
                        btn.addEventListener('click', () => {
                            selectedFmt = fmt;
                            setFormatButtonLabel(fmt.buttonLabel || fmt.label);
                            closePopup();
                        });
                        panel.appendChild(btn);
                    });
                });
            };

            ['audio', 'video'].forEach(type => {
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'yt-dl-tab';
                tab.textContent = type === 'video' ? 'Video' : 'Audio';
                tab.setAttribute('role', 'tab');
                tab.setAttribute('aria-controls', `yt-dl-${type}-panel`);

                const panel = document.createElement('div');
                panel.id = `yt-dl-${type}-panel`;
                panel.className = 'yt-dl-tab-panel';
                panel.setAttribute('role', 'tabpanel');
                renderGroupList(panel, groupsByTab[type]);

                tabButtons[type] = tab;
                panels[type] = panel;
                tabs.appendChild(tab);
                popup.appendChild(panel);

                tab.addEventListener('click', () => {
                    Object.keys(tabButtons).forEach(key => {
                        const isActive = key === type;
                        tabButtons[key].classList.toggle('active', isActive);
                        tabButtons[key].setAttribute('aria-selected', String(isActive));
                        panels[key].classList.toggle('active', isActive);
                    });
                });
            });

            popup.insertBefore(tabs, popup.children[1] || null);
            const initialTab = groupsByTab.video.length ? 'video' : 'audio';
            tabButtons[initialTab].click();
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
            const dlBtn  = document.getElementById(VID_IDS.DL_BTN);
            const fmtBtn = document.getElementById(VID_IDS.FMT_BTN);
            if (!dlBtn || !fmtBtn || dlBtn.dataset.loading) return;
            if (!selectedFmt) { alert('Please select a format first'); return; }

            const url = getVideoUrl();
            if (!url) return;

            const dlLabel = dlBtn.querySelector('.ytSpecButtonShapeNextButtonTextContent');
            const icon    = dlBtn.querySelector('.ytSpecButtonShapeNextIcon');

            const setLoading = txt => {
                dlBtn.dataset.loading = '1';
                dlBtn.disabled  = true;
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

            const rawTitle = cache.title ||
                (document.title || 'video')
                    .replace(/\s*[-–|]\s*YouTube\s*$/i, '').trim();
            const fileName = buildFileName(rawTitle, selectedFmt);
            console.log('[YTDl] File name:', fileName);

            setLoading('⏳ Starting…');

            if (selectedFmt.isRender) {
                startRenderedDownload(selectedFmt.url, dlLabel, fileName, setDone, resetBtn);
                return;
            }

            try {
                triggerDirectDownload(selectedFmt.url, fileName);
                setDone();
            } catch (e) {
                console.error('[YTDl] direct download:', e);
                alert('❌ Download could not be started');
                resetBtn();
            }
        }

        function startRenderedDownload(renderUrl, dlLabel, fileName, setDone, resetBtn) {
            if (!renderUrl) {
                alert('❌ Missing render URL');
                resetBtn();
                return;
            }

            dlLabel.textContent = '⏳ Queued…';
            GM_xmlhttpRequest({
                method  : 'GET',
                url     : renderUrl,
                headers : { 'Accept': 'application/json' },
                timeout : 30_000,
                onload(res) {
                    if (res.status < 200 || res.status >= 300) {
                        alert(`❌ Render HTTP ${res.status}`);
                        resetBtn();
                        return;
                    }

                    let job;
                    try { job = JSON.parse(res.responseText); }
                    catch {
                        alert('❌ Bad render response');
                        resetBtn();
                        return;
                    }

                    if (job?.status === 'done' && job?.output?.url) {
                        try {
                            triggerDirectDownload(job.output.url, fileName);
                            setDone();
                        } catch (e) {
                            console.error('[YTDl] rendered download:', e);
                            alert('❌ Download could not be started');
                            resetBtn();
                        }
                        return;
                    }

                    const sseUrl = normalizeSseUrl(job?.sseStatusUrl || job?.statusUrl, job?.jobId);
                    if (!sseUrl) {
                        alert(`❌ ${job?.error || 'No render status URL'}`);
                        resetBtn();
                        return;
                    }
                    listenRenderSSE(sseUrl, dlLabel, fileName, setDone, resetBtn);
                },
                onerror  () { alert('❌ Render network error'); resetBtn(); },
                ontimeout() { alert('❌ Render timeout');        resetBtn(); },
            });
        }

        function normalizeSseUrl(url, jobId) {
            if (!url && jobId) {
                return `https://render-api-v3-ins1.smvd.xyz/api/v1/render/status/sse/${encodeURIComponent(jobId)}`;
            }
            if (!url) return null;
            const value = String(url).replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
            if (/\/status\/sse\/[^/?#]+$/i.test(value)) return value;
            const match = value.match(/^(.*\/status)\/([^/?#]+)$/i);
            if (match) return `${match[1]}/sse/${match[2]}`;
            return null;
        }

        function listenRenderSSE(sseUrl, dlLabel, fileName, setDone, resetBtn) {
            let es;
            let finished = false;
            const guardTimer = setTimeout(() => finish(() => {
                alert('❌ Render timed out');
                resetBtn();
            }), 600_000);

            const finish = fn => {
                if (finished) return;
                finished = true;
                clearTimeout(guardTimer);
                try { es?.close(); } catch (e) {}
                fn();
            };

            const fail = message => finish(() => {
                alert(`❌ ${message}`);
                resetBtn();
            });

            const handleMessage = raw => {
                if (!raw) return;
                let data;
                try { data = JSON.parse(raw); }
                catch { return; }

                const progress = Number(data.progress);
                if (Number.isFinite(progress)) {
                    dlLabel.textContent = `⏳ Rendering ${Math.floor(progress)}%`;
                } else if (data.status === 'queued' || data.status === 'processing') {
                    dlLabel.textContent = '⏳ Rendering…';
                }

                if (data.status === 'done') {
                    const outputUrl = data.output?.url;
                    if (!outputUrl) { fail(data.error || 'Render finished without a file'); return; }
                    finish(() => {
                        try {
                            triggerDirectDownload(outputUrl, fileName);
                            setDone();
                        } catch (e) {
                            console.error('[YTDl] rendered output:', e);
                            alert('❌ Download could not be started');
                            resetBtn();
                        }
                    });
                } else if (data.status === 'error' || data.error) {
                    fail(data.error || 'Render failed');
                }
            };

            try {
                es = new EventSource(sseUrl);
            } catch (e) {
                console.warn('[YTDl] EventSource not available for render');
                alert('❌ Render status is not supported');
                resetBtn();
                clearTimeout(guardTimer);
                return;
            }

            es.onmessage = e => handleMessage(e.data);
            es.addEventListener('progress', e => handleMessage(e.data));
            es.addEventListener('done', e => handleMessage(e.data));
            es.addEventListener('error', e => {
                if (e.data) handleMessage(e.data);
                else if (es.readyState === EventSource.CLOSED) fail('Render status connection closed');
            });
        }

        function triggerDirectDownload(fileUrl, fileName) {
            if (!fileUrl) throw new Error('Missing download URL');
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'display:none;width:0;height:0;border:none;position:fixed;';
            iframe.title = fileName || 'download';
            iframe.src = fileUrl;
            document.body.appendChild(iframe);
            setTimeout(() => iframe.remove(), 60_000);
        }

        function checkAndInject() {
            const container   = findContainer();
            const vidExisting = document.getElementById(VID_IDS.WRAPPER);
            if      (container && !vidExisting)  buildVidUI(container);
            else if (!container && vidExisting)  removeVidUI();
            else    syncVidDisabled();
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