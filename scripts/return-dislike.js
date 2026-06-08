// scripts/return-dislike.js
(function () {
    'use strict';

    function init(config) {
        if (!config.extensionEnabled || !config.feature_returnDislike) return;
        console.log('[YT Premium+] Return Dislike active');

        const extConfig = {
            disableVoteSubmission: false,
            disableLogging: true,
            coloredThumbs: false,
            coloredBar: false,
            colorTheme: "classic",
            numberDisplayFormat: "compactShort",
            numberDisplayRoundDown: true,
            tooltipPercentageMode: "none",
            numberDisplayReformatLikes: false,
            rateBarEnabled: false,
        };

        const LIKED_STATE = "LIKED_STATE";
        const DISLIKED_STATE = "DISLIKED_STATE";
        const NEUTRAL_STATE = "NEUTRAL_STATE";
        let previousState = 3;
        let likesvalue = 0;
        let dislikesvalue = 0;
        let preNavigateLikeButton = null;

        let isMobile = location.hostname == "m.youtube.com";
        let isShorts = () => location.pathname.startsWith("/shorts");
        let mobileDislikes = 0;

        function cLog(text, subtext = "") {
            if (!extConfig.disableLogging) {
                subtext = subtext.trim() === "" ? "" : `(${subtext})`;
                console.log(`[Return YouTube Dislikes] ${text} ${subtext}`);
            }
        }

        function isInViewport(element) {
            const rect = element.getBoundingClientRect();
            const height = innerHeight || document.documentElement.clientHeight;
            const width = innerWidth || document.documentElement.clientWidth;
            return (
                !(rect.top == 0 && rect.left == 0 && rect.bottom == 0 && rect.right == 0) &&
                rect.top >= 0 && rect.left >= 0 &&
                rect.bottom <= height && rect.right <= width
            );
        }

        function getButtons() {
            if (isShorts()) {
                let elements = document.querySelectorAll(
                    isMobile ? "ytm-like-button-renderer" : "#like-button > ytd-like-button-renderer"
                );
                for (let element of elements) {
                    if (isInViewport(element)) return element;
                }
            }
            if (isMobile) {
                return (
                    document.querySelector(".slim-video-action-bar-actions .segmented-buttons") ??
                    document.querySelector(".slim-video-action-bar-actions")
                );
            }
            if (document.getElementById("menu-container")?.offsetParent === null) {
                return (
                    document.querySelector("ytd-menu-renderer.ytd-watch-metadata > div") ??
                    document.querySelector("ytd-menu-renderer.ytd-video-primary-info-renderer > div")
                );
            } else {
                return document.getElementById("menu-container")?.querySelector("#top-level-buttons-computed");
            }
        }

        function getDislikeButton() {
            const buttons = getButtons();
            if (!buttons) return null;
            if (buttons.children[0]?.tagName === "YTD-SEGMENTED-LIKE-DISLIKE-BUTTON-RENDERER") {
                if (buttons.children[0].children[1] === undefined) {
                    return document.querySelector("#segmented-dislike-button");
                } else {
                    return buttons.children[0].children[1];
                }
            } else {
                if (buttons.querySelector("segmented-like-dislike-button-view-model")) {
                    const dislikeViewModel = buttons.querySelector("dislike-button-view-model");
                    if (!dislikeViewModel) cLog("Dislike button wasn't added to DOM yet...");
                    return dislikeViewModel;
                } else {
                    return buttons.children[1];
                }
            }
        }

        function getLikeButton() {
            const buttons = getButtons();
            if (!buttons) return null;
            return buttons.children[0]?.tagName === "YTD-SEGMENTED-LIKE-DISLIKE-BUTTON-RENDERER"
                ? document.querySelector("#segmented-like-button") !== null
                    ? document.querySelector("#segmented-like-button")
                    : buttons.children[0].children[0]
                : buttons.querySelector("like-button-view-model") ?? buttons.children[0];
        }

        function getLikeTextContainer() {
            const lb = getLikeButton();
            if (!lb) return null;
            return (
                lb.querySelector("#text") ??
                lb.getElementsByTagName("yt-formatted-string")[0] ??
                lb.querySelector("span[role='text']")
            );
        }

        function getDislikeTextContainer() {
            const dislikeButton = getDislikeButton();
            if (!dislikeButton) return null;
            let result =
                dislikeButton.querySelector(".ytSpecButtonShapeNextButtonTextContent") ??
                dislikeButton.querySelector("#text") ??
                dislikeButton.getElementsByTagName("yt-formatted-string")[0] ??
                dislikeButton.querySelector("span[role='text']");
            if (result === null) {
                let textDiv = document.createElement("div");
                textDiv.className = "ytSpecButtonShapeNextButtonTextContent";
                const btn = dislikeButton.querySelector("button");
                if (btn) {
                    btn.appendChild(textDiv);
                    btn.classList.remove("ytSpecButtonShapeNextIconButton");
                    btn.classList.add("yt-spec-button-shape-next--icon-leading", "ytSpecButtonShapeNextIconLeading");
                    btn.style.width = "";
                }
                result = textDiv;
            }
            return result;
        }

        function createObserver(options, callback) {
            const observerWrapper = {};
            observerWrapper.options = options;
            observerWrapper.observer = new MutationObserver(callback);
            observerWrapper.observe = function (element) { this.observer.observe(element, this.options); };
            observerWrapper.disconnect = function () { this.observer.disconnect(); };
            return observerWrapper;
        }

        let shortsObserver = null;
        if (isShorts() && !shortsObserver) {
            shortsObserver = createObserver({ attributes: true }, (mutationList) => {
                mutationList.forEach((mutation) => {
                    if (mutation.type === "attributes" && mutation.target.nodeName === "TP-YT-PAPER-BUTTON" && mutation.target.id === "button") {
                        if (mutation.target.getAttribute("aria-pressed") === "true") {
                            mutation.target.style.color =
                                mutation.target.parentElement.parentElement.id === "like-button"
                                    ? getColorFromTheme(true)
                                    : getColorFromTheme(false);
                        } else {
                            mutation.target.style.color = "unset";
                        }
                    }
                });
            });
        }

        function isVideoLiked() {
            const lb = getLikeButton();
            if (!lb) return false;
            if (isMobile) return lb.querySelector("button")?.getAttribute("aria-label") == "true";
            return lb.classList.contains("style-default-active");
        }

        function isVideoDisliked() {
            const db = getDislikeButton();
            if (!db) return false;
            if (isMobile) return db.querySelector("button")?.getAttribute("aria-label") == "true";
            return db.classList.contains("style-default-active");
        }

        function checkForUserAvatarButton() {
            if (isMobile) return;
            return !!document.querySelector("#avatar-btn");
        }

        function getState() {
            if (isVideoLiked()) return LIKED_STATE;
            if (isVideoDisliked()) return DISLIKED_STATE;
            return NEUTRAL_STATE;
        }

        function setLikes(likesCount) {
            const buttons = getButtons();
            if (!buttons) return;
            if (isMobile) {
                const el = buttons.children[0]?.querySelector(".button-renderer-text");
                if (el) el.innerText = likesCount;
                return;
            }
            const c = getLikeTextContainer();
            if (c) c.innerText = likesCount;
        }

        function setDislikes(dislikesCount) {
            if (isMobile) { mobileDislikes = dislikesCount; return; }
            const _container = getDislikeTextContainer();
            if (!_container) return;
            _container.removeAttribute("is-empty");
            if (_container.innerText !== dislikesCount) _container.innerText = dislikesCount;
        }

        function getLikeCountFromButton() {
            try {
                if (isShorts()) return false;
                const lb = getLikeButton();
                if (!lb) return false;
                let likeButton = lb.querySelector("yt-formatted-string#text") ?? lb.querySelector("button");
                let likesStr = likeButton.getAttribute("aria-label").replace(/\D/g, "");
                return likesStr.length > 0 ? parseInt(likesStr) : false;
            } catch { return false; }
        }

        // Inject CSS
        const styleEl = document.createElement('style');
        styleEl.textContent = `
            #return-youtube-dislike-bar-container { background: var(--yt-spec-icon-disabled); border-radius: 2px; }
            #return-youtube-dislike-bar { background: var(--yt-spec-text-primary); border-radius: 2px; transition: all 0.15s ease-in-out; }
            .ryd-tooltip { position: absolute; display: block; height: 2px; bottom: -10px; }
            .ryd-tooltip-bar-container { width: 100%; height: 2px; position: absolute; padding-top: 6px; padding-bottom: 12px; top: -6px; }
            ytd-menu-renderer.ytd-watch-metadata { overflow-y: visible !important; }
            #top-level-buttons-computed { position: relative !important; }
        `;
        document.head.appendChild(styleEl);

        function createRateBar(likes, dislikes) {
            if (isMobile || !extConfig.rateBarEnabled) return;
            // (Kept original logic - skipped for brevity since rateBar is disabled by default)
        }

        function setState() {
            cLog("Fetching votes...");
            const videoId = getVideoId();
            if (!videoId) return;
            fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`).then((response) => {
                response.json().then((json) => {
                    if (json && !("traceId" in response)) {
                        const { dislikes, likes } = json;
                        cLog(`Received count: ${dislikes}`);
                        likesvalue = likes;
                        dislikesvalue = dislikes;
                        setDislikes(numberFormat(dislikes));
                        if (extConfig.numberDisplayReformatLikes === true) {
                            const nativeLikes = getLikeCountFromButton();
                            if (nativeLikes !== false) setLikes(numberFormat(nativeLikes));
                        }
                        if (extConfig.coloredThumbs === true) {
                            const dislikeButton = getDislikeButton();
                            const likeButton = getLikeButton();
                            if (likeButton) likeButton.style.color = getColorFromTheme(true);
                            if (dislikeButton) dislikeButton.style.color = getColorFromTheme(false);
                        }
                    }
                }).catch(e => cLog("JSON parse error: " + e));
            }).catch(e => cLog("Fetch error: " + e));
        }

        function updateDOMDislikes() {
            setDislikes(numberFormat(dislikesvalue));
        }

        function likeClicked() {
            if (checkForUserAvatarButton() == true) {
                if (previousState == 1) { likesvalue--; updateDOMDislikes(); previousState = 3; }
                else if (previousState == 2) { likesvalue++; dislikesvalue--; updateDOMDislikes(); previousState = 1; }
                else if (previousState == 3) { likesvalue++; updateDOMDislikes(); previousState = 1; }
            }
        }

        function dislikeClicked() {
            if (checkForUserAvatarButton() == true) {
                if (previousState == 3) { dislikesvalue++; updateDOMDislikes(); previousState = 2; }
                else if (previousState == 2) { dislikesvalue--; updateDOMDislikes(); previousState = 3; }
                else if (previousState == 1) { likesvalue--; dislikesvalue++; updateDOMDislikes(); previousState = 2; }
            }
        }

        function getVideoId() {
            const urlObject = new URL(window.location.href);
            const pathname = urlObject.pathname;
            if (pathname.startsWith("/clip")) {
                return (document.querySelector("meta[itemprop='videoId']") || document.querySelector("meta[itemprop='identifier']"))?.content;
            } else {
                if (pathname.startsWith("/shorts")) return pathname.slice(8);
                return urlObject.searchParams.get("v");
            }
        }

        function isVideoLoaded() {
            if (isMobile) return document.getElementById("player")?.getAttribute("loading") == "false";
            const videoId = getVideoId();
            return (
                document.querySelector(`ytd-watch-grid[video-id='${videoId}']`) !== null ||
                document.querySelector(`ytd-watch-flexy[video-id='${videoId}']`) !== null ||
                document.querySelector('#player[loading="false"]:not([hidden])') !== null
            );
        }

        function roundDown(num) {
            if (num < 1000) return num;
            const int = Math.floor(Math.log10(num) - 2);
            const decimal = int + (int % 3 ? 1 : 0);
            const value = Math.floor(num / 10 ** decimal);
            return value * 10 ** decimal;
        }

        function numberFormat(numberState) {
            let numberDisplay = extConfig.numberDisplayRoundDown === false ? numberState : roundDown(numberState);
            return getNumberFormatter(extConfig.numberDisplayFormat).format(numberDisplay);
        }

        function getNumberFormatter(optionSelect) {
            let userLocales = document.documentElement.lang || navigator.language || "en";
            let formatterNotation, formatterCompactDisplay;
            switch (optionSelect) {
                case "compactLong": formatterNotation = "compact"; formatterCompactDisplay = "long"; break;
                case "standard": formatterNotation = "standard"; formatterCompactDisplay = "short"; break;
                default: formatterNotation = "compact"; formatterCompactDisplay = "short";
            }
            return Intl.NumberFormat(userLocales, { notation: formatterNotation, compactDisplay: formatterCompactDisplay });
        }

        function getColorFromTheme(voteIsLike) {
            switch (extConfig.colorTheme) {
                case "accessible": return voteIsLike ? "dodgerblue" : "gold";
                case "neon": return voteIsLike ? "aqua" : "magenta";
                default: return voteIsLike ? "lime" : "red";
            }
        }

        let smartimationObserver = null;

        function setEventListeners() {
            let jsInitChecktimer;
            function checkForJS_Finish() {
                if (isShorts() || (getButtons()?.offsetParent && isVideoLoaded())) {
                    const buttons = getButtons();
                    const dislikeButton = getDislikeButton();
                    const likeButton = getLikeButton();
                    if (preNavigateLikeButton !== likeButton && dislikeButton && likeButton) {
                        try {
                            likeButton.addEventListener("click", likeClicked);
                            dislikeButton.addEventListener("click", dislikeClicked);
                            likeButton.addEventListener("touchstart", likeClicked);
                            dislikeButton.addEventListener("touchstart", dislikeClicked);
                            dislikeButton.addEventListener("focusin", updateDOMDislikes);
                            dislikeButton.addEventListener("focusout", updateDOMDislikes);
                            preNavigateLikeButton = likeButton;

                            if (!smartimationObserver) {
                                smartimationObserver = createObserver({ attributes: true, subtree: true, childList: true }, updateDOMDislikes);
                                smartimationObserver.container = null;
                            }
                            const smartimationContainer = buttons.querySelector("yt-smartimation");
                            if (smartimationContainer && smartimationObserver.container != smartimationContainer) {
                                smartimationObserver.disconnect();
                                smartimationObserver.observe(smartimationContainer);
                                smartimationObserver.container = smartimationContainer;
                            }
                        } catch { return; }
                    }
                    if (dislikeButton) { setState(); clearInterval(jsInitChecktimer); }
                }
            }
            jsInitChecktimer = setInterval(checkForJS_Finish, 111);
        }

        window.addEventListener("yt-navigate-finish", setEventListeners, true);
        setEventListeners();

        if (isMobile) {
            let originalPush = history.pushState;
            history.pushState = function (...args) {
                setEventListeners();
                return originalPush.apply(history, args);
            };
            setInterval(() => {
                const dislikeButton = getDislikeButton();
                if (!dislikeButton) return;
                if (dislikeButton.querySelector(".button-renderer-text") === null) {
                    const c = getDislikeTextContainer();
                    if (c) c.innerText = mobileDislikes;
                } else {
                    const el = dislikeButton.querySelector(".button-renderer-text");
                    if (el) el.innerText = mobileDislikes;
                }
            }, 1000);
        }
    }

    document.addEventListener('ytPremiumConfigReady', (e) => init(e.detail));
})();