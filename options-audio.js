(function () {
    const audioSources = [
        "https://www.myinstants.com/media/sounds/your-phone-ringing.mp3",
        "https://www.myinstants.com/media/sounds/chinese-meme-song.mp3",
        "https://www.myinstants.com/media/sounds/chinese-dream.mp3",
        "https://www.myinstants.com/media/sounds/chinese-rapping-dog.mp3",
        "https://www.myinstants.com/media/sounds/hy-zrybh-y-hbyby.mp3",
        "https://www.myinstants.com/media/sounds/y-yny-lyk-nt-msh-fhm-y-hj.mp3",
        "https://www.myinstants.com/media/sounds/dexter-meme.mp3",
        "https://www.myinstants.com/media/sounds/spiderman-meme-song.mp3",
        "https://www.myinstants.com/media/sounds/oh-no-no-no-tik-tok-song-sound-effect.mp3",
        "https://www.myinstants.com/media/sounds/sneaky-golem.mp3"
    ];

    const src = audioSources[Math.floor(Math.random() * audioSources.length)];
    const audio = new Audio(src);
    audio.volume = 0.55;
    audio.loop   = true;

    // Chrome Extensions يحتاج تفاعل المستخدم للتشغيل
    // نحاول مباشرة، وإذا منع نستنى أول click
    function tryPlay() {
        audio.play().catch(() => {
            document.addEventListener('click', function once() {
                audio.play();
                document.removeEventListener('click', once);
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryPlay);
    } else {
        tryPlay();
    }
})();