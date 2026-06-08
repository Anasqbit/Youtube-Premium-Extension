(function () {
    const canvas = document.getElementById('bgCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H;

    function resize() {
        W = canvas.width  = window.innerWidth  || 800;
        H = canvas.height = window.innerHeight || 600;
    }
    resize();
    window.addEventListener('resize', resize);

    // ── Wave bands ────────────────────────────────────────────────────
    // بدل blobs ثابتة: موجات أفقية تتموج ببطء
    const bands = [
        { yf: 0.18, amp: 0.06, freq: 0.0018, phase: 0.0,  r: 0.55, c: [255, 45,  45],  a: 0.09 },
        { yf: 0.42, amp: 0.05, freq: 0.0013, phase: 1.8,  r: 0.60, c: [255, 120, 50],  a: 0.07 },
        { yf: 0.65, amp: 0.07, freq: 0.0021, phase: 3.2,  r: 0.50, c: [200, 30,  30],  a: 0.08 },
        { yf: 0.85, amp: 0.04, freq: 0.0009, phase: 0.9,  r: 0.65, c: [255, 80,  40],  a: 0.06 },
    ];

    // ── Flowing particles ─────────────────────────────────────────────
    const COLORS = [
        [255, 45,  45],
        [255, 140, 66],
        [200, 30,  30],
        [255, 90,  60],
    ];
    const particles = Array.from({ length: 80 }, () => {
        const col = COLORS[Math.floor(Math.random() * COLORS.length)];
        return {
            x:     Math.random(),
            y:     Math.random(),
            r:     Math.random() * 1.8 + 0.3,
            vx:    (Math.random() - 0.5) * 0.18,
            vy:    -(Math.random() * 0.25 + 0.05),   // يطفو للأعلى
            alpha: Math.random() * 0.45 + 0.08,
            life:  Math.random(),                     // 0→1 دورة الحياة
            decay: Math.random() * 0.0008 + 0.0004,
            col,
        };
    });

    // ── Stars (ثوابت صغيرة جداً) ──────────────────────────────────────
    const stars = Array.from({ length: 120 }, () => ({
        x:     Math.random(),
        y:     Math.random(),
        r:     Math.random() * 0.7 + 0.2,
        alpha: Math.random() * 0.25 + 0.04,
        twink: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.025 + 0.008,
    }));

    let t = 0;

    function draw() {
        t++;
        ctx.clearRect(0, 0, W, H);

        // ── 1. خلفية تدرج عميق ───────────────────────────────────────
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0,   '#060610');
        bg.addColorStop(0.5, '#0a0a18');
        bg.addColorStop(1,   '#080812');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // ── 2. موجات أورورا ──────────────────────────────────────────
        bands.forEach((b) => {
            const cx = W * 0.5;
            const cy = H * (b.yf + Math.sin(t * b.freq + b.phase) * b.amp);
            const rx = W * b.r;
            const ry = H * 0.22;

            // ellipse radial gradient عبر transform
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(1, ry / rx);
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
            g.addColorStop(0,    `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${b.a})`);
            g.addColorStop(0.45, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${b.a * 0.35})`);
            g.addColorStop(1,    `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(-rx * 1.2, -rx * 1.2, rx * 2.4, rx * 2.4);
            ctx.restore();
        });

        // ── 3. نجوم تتلألأ ────────────────────────────────────────────
        stars.forEach(s => {
            s.twink += s.speed;
            const a = s.alpha * (0.5 + 0.5 * Math.sin(s.twink));
            ctx.beginPath();
            ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            ctx.fill();
        });

        // ── 4. جسيمات تطير للأعلى ───────────────────────────────────
        particles.forEach(p => {
            p.life += p.decay;
            if (p.life >= 1) {
                // إعادة ميلاد الجسيمة من الأسفل
                p.x     = Math.random();
                p.y     = 1.05;
                p.life  = 0;
                p.alpha = Math.random() * 0.45 + 0.08;
                p.r     = Math.random() * 1.8 + 0.3;
                p.vx    = (Math.random() - 0.5) * 0.18;
                p.vy    = -(Math.random() * 0.25 + 0.05);
                p.col   = COLORS[Math.floor(Math.random() * COLORS.length)];
                p.decay = Math.random() * 0.0008 + 0.0004;
            }

            // تلاشي: تظهر → تُضيء → تختفي
            const fade = p.life < 0.15
                ? p.life / 0.15
                : p.life > 0.75
                    ? 1 - (p.life - 0.75) / 0.25
                    : 1;

            const a = p.alpha * fade;
            if (a < 0.01) return;

            // glow
            const gx = p.x * W, gy = p.y * H;
            const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, p.r * 4);
            gr.addColorStop(0,   `rgba(${p.col[0]},${p.col[1]},${p.col[2]},${a})`);
            gr.addColorStop(0.4, `rgba(${p.col[0]},${p.col[1]},${p.col[2]},${a * 0.3})`);
            gr.addColorStop(1,   `rgba(${p.col[0]},${p.col[1]},${p.col[2]},0)`);
            ctx.fillStyle = gr;
            ctx.fillRect(gx - p.r * 4, gy - p.r * 4, p.r * 8, p.r * 8);

            // core dot
            ctx.beginPath();
            ctx.arc(gx, gy, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${p.col[0]},${p.col[1]},${p.col[2]},${Math.min(1, a * 1.8)})`;
            ctx.fill();

            p.x += p.vx / W * 2;
            p.y += p.vy / H * 2;
        });

        // ── 5. خط ضوء أفقي يمر (scan line) ──────────────────────────
        const scanY = ((t * 0.35) % (H + 120)) - 60;
        if (scanY > -60 && scanY < H + 60) {
            const sg = ctx.createLinearGradient(0, scanY - 50, 0, scanY + 50);
            sg.addColorStop(0,    'rgba(255,45,45,0)');
            sg.addColorStop(0.5,  'rgba(255,45,45,0.018)');
            sg.addColorStop(1,    'rgba(255,45,45,0)');
            ctx.fillStyle = sg;
            ctx.fillRect(0, scanY - 50, W, 100);
        }

        // ── 6. vignette ───────────────────────────────────────────────
        const vig = ctx.createRadialGradient(W/2, H/2, H * 0.2, W/2, H/2, H * 0.9);
        vig.addColorStop(0,   'rgba(0,0,0,0)');
        vig.addColorStop(1,   'rgba(0,0,0,0.55)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);

        requestAnimationFrame(draw);
    }
    draw();
})();