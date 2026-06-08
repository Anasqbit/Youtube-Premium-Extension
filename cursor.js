// cursor.js — custom cursor animation
(function () {
    const _script = document.currentScript || document.querySelector('script[src*="cursor.js"]');
    const HOVER = (_script && _script.dataset.hover)
        ? _script.dataset.hover
        : 'button, input, select, label, .pill-toggle, .save-btn, .lang-select, [role="button"]';
    // Inject style
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { cursor: none !important; }';
    document.head.appendChild(style);

    // Inject canvas
    const cv = document.createElement('canvas');
    cv.id = 'cur-c';
    cv.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:999999;';
    document.body.appendChild(cv);

const ctx = cv.getContext('2d');
    function resize() { cv.width = innerWidth; cv.height = innerHeight; }
    resize(); window.addEventListener('resize', resize);

    const CW = 36, CH = 48, SC = CW / 24;

    /* arrow clip path at offset gx,gy */
    function arrowPath(gx, gy) {
        ctx.beginPath();
        ctx.moveTo(gx + 4.5*SC,   gy + 0.79*SC);
        ctx.lineTo(gx + 4.5*SC,   gy + 23.21*SC);
        ctx.lineTo(gx + 11.06*SC, gy + 16.64*SC);
        ctx.lineTo(gx + 20.35*SC, gy + 16.64*SC);
        ctx.closePath();
    }

    /* ── particles ── */
    const particles = [];

    function spawnParticle(gx, gy, fillT) {
        /* random point INSIDE the arrow body */
        const bottom = gy + 23.21*SC;
        const top    = gy + 0.79*SC;
        const H      = bottom - top;
        /* spawn in the white zone (above fill) */
        const spawnY = top + Math.random() * H * (1 - fillT) * 0.9;
        const spawnX = gx + (5 + Math.random() * 9) * SC;

        /* velocity: outward burst */
        const angle = -Math.PI/2 + (Math.random() - 0.5) * Math.PI * 0.9;
        const speed = 1.2 + Math.random() * 2.2;

        particles.push({
            x: spawnX, y: spawnY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r:  1.6 + Math.random() * 1.8,
            life: 1,
            decay: 0.022 + Math.random() * 0.018,
        });
    }

    /* ── state ── */
    let mx = -300, my = -300;
    let hovering  = false;
    let fillT     = 0;
    let wavePhase = 0;
    let lastTs    = null;
    const FILL_SPEED  = 0.0022;
    const DRAIN_SPEED = 0.008;

    document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
    document.addEventListener('mouseover', e => {
        if (e.target.closest && e.target.closest(HOVER)) hovering = true;
    });
    document.addEventListener('mouseout', e => {
        if (!e.target.closest) return;
        if (e.target.closest(HOVER)) {
            const to = e.relatedTarget;
            if (!to || !(to.closest && to.closest(HOVER))) hovering = false;
        }
    });

    function loop(ts) {
        if (!lastTs) lastTs = ts;
        const dt = Math.min(ts - lastTs, 40);
        lastTs = ts;
        ctx.clearRect(0, 0, cv.width, cv.height);

        /* fill progress */
        fillT = hovering
            ? Math.min(fillT + FILL_SPEED * dt, 1)
            : Math.max(fillT - DRAIN_SPEED * dt, 0);
        wavePhase += 0.055 * (dt / 16);

        const gx = mx, gy = my;
        const bottom = gy + 23.21*SC;
        const top    = gy + 0.79*SC;
        const H      = bottom - top;
        const fillY  = bottom - fillT * H;

        /* spawn particles only while hovering and not yet full */
        if (hovering && fillT < 0.95 && Math.random() < 0.55) {
            spawnParticle(gx, gy, fillT);
        }

        /* update + draw particles */
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x  += p.vx * (dt / 16);
            p.y  += p.vy * (dt / 16);
            p.vy += 0.04 * (dt / 16);   /* tiny gravity */
            p.life -= p.decay * (dt / 16);
            if (p.life <= 0) { particles.splice(i, 1); continue; }

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0,0,0,${p.life * 0.85})`;
            ctx.fill();
        }

        /* ── draw cursor ── */
        /* white body */
        arrowPath(gx, gy);
        ctx.fillStyle = '#fff';
        ctx.fill();

        /* liquid fill with wave */
        if (fillT > 0) {
            const wAmp = (fillT > 0.04 && fillT < 0.97) ? 2.5 : 0;
            ctx.save();
            arrowPath(gx, gy);
            ctx.clip();

            ctx.beginPath();
            const steps = 28;
            ctx.moveTo(gx - 2, fillY);
            for (let i = 0; i <= steps; i++) {
                const px = gx + (i / steps) * (CW + 4);
                const wy = fillY + Math.sin((i / steps) * Math.PI * 3 + wavePhase) * wAmp;
                ctx.lineTo(px, wy);
            }
            ctx.lineTo(gx + CW + 4, bottom + 2);
            ctx.lineTo(gx - 2,      bottom + 2);
            ctx.closePath();
            ctx.fillStyle = '#000';
            ctx.fill();

            ctx.restore();
        }

        /* outline — fades near full */
        const sA = fillT > 0.88 ? Math.max(0, 1 - (fillT - 0.88) / 0.12) : 1;
        if (sA > 0) {
            arrowPath(gx, gy);
            ctx.strokeStyle = `rgba(0,0,0,${sA})`;
            ctx.lineWidth   = 1.8;
            ctx.lineJoin    = 'round';
            ctx.stroke();
        }

        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
})();