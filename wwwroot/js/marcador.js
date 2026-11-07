// Petites ajudes de navegador per al marcador.
(() => {
    let wakeLock = null;

    // Manté la pantalla encesa mentre l'app és visible (si el navegador ho permet).
    async function keepAwake() {
        try {
            if ("wakeLock" in navigator && document.visibilityState === "visible" && !wakeLock) {
                wakeLock = await navigator.wakeLock.request("screen");
                wakeLock.addEventListener("release", () => { wakeLock = null; });
            }
        } catch { /* no suportat o denegat */ }
    }

    document.addEventListener("visibilitychange", keepAwake);
    document.addEventListener("pointerdown", keepAwake, { passive: true });
    keepAwake();

    const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

    // Escriu text reduint la mida fins que hi cap.
    function fitText(ctx, text, x, y, maxWidth, size, weight, color, spacing = 0) {
        let s = size;
        do {
            ctx.font = `${weight} ${s}px ${FONT}`;
            if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing * s}px`;
            s -= 2;
        } while (ctx.measureText(text).width > maxWidth && s > 10);
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
        if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // Dibuixa la imatge del marcador (1200×800) i la retorna com a canvas.
    function drawScore(d) {
        const W = 1200, H = 800;
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        const ctx = c.getContext("2d");

        ctx.fillStyle = "#07090d";
        ctx.fillRect(0, 0, W, H);

        const teams = [d.home, d.away];
        const colW = 520, gap = 40, top = 140, cardH = 480;
        teams.forEach((t, i) => {
            const x = (W - colW * 2 - gap) / 2 + i * (colW + gap);
            const cx = x + colW / 2;

            // Targeta amb resplendor del color de l'equip
            ctx.save();
            roundRect(ctx, x, top, colW, cardH, 40);
            ctx.fillStyle = "#11141b";
            ctx.fill();
            ctx.clip();
            const g = ctx.createRadialGradient(cx, top, 0, cx, top, cardH * 0.95);
            g.addColorStop(0, t.color + "44");
            g.addColorStop(1, t.color + "00");
            ctx.fillStyle = g;
            ctx.fillRect(x, top, colW, cardH);
            ctx.restore();

            ctx.fillStyle = t.color;
            roundRect(ctx, cx - 120, top, 240, 6, 3);
            ctx.fill();

            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            fitText(ctx, t.name.toUpperCase(), cx, top + 90, colW - 60, 46, 800, t.color, 0.12);

            ctx.save();
            ctx.shadowColor = t.color + "88";
            ctx.shadowBlur = 60;
            fitText(ctx, String(t.score), cx, top + 390, colW - 40, 280, 800, "#ffffff", -0.03);
            ctx.restore();
        });

        ctx.textAlign = "center";
        fitText(ctx, "MARCADOR BÀSQUET", W / 2, 95, 900, 30, 800, "#8b93a7", 0.2);

        // Període i data
        const pill = d.period;
        ctx.font = `800 40px ${FONT}`;
        const pw = ctx.measureText(pill).width + 70;
        roundRect(ctx, (W - pw) / 2, top + cardH + 30, pw, 66, 33);
        ctx.fillStyle = "#181c25";
        ctx.fill();
        fitText(ctx, pill, W / 2, top + cardH + 77, pw, 40, 800, "#f2f4f8");

        const date = new Date().toLocaleDateString("ca-ES", { day: "numeric", month: "long", year: "numeric" });
        fitText(ctx, date, W / 2, H - 30, 900, 26, 600, "#8b93a7");
        return c;
    }

    function canvasToFile(canvas, name) {
        // Conversió síncrona per no perdre el "gest de l'usuari" que exigeix navigator.share.
        const bin = atob(canvas.toDataURL("image/png").split(",")[1]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new File([bytes], name, { type: "image/png" });
    }

    // ---------- Actualitzacions de l'app ----------

    function showUpdateBanner(worker) {
        if (document.getElementById("update-banner")) return;
        const bar = document.createElement("div");
        bar.id = "update-banner";
        bar.className = "update-banner";
        bar.setAttribute("role", "status");
        bar.innerHTML = '<span>Nova versió disponible</span><button type="button">Actualitza</button>';
        bar.querySelector("button").addEventListener("click", () => {
            bar.querySelector("button").disabled = true;
            worker.postMessage("skipWaiting");
        });
        document.body.appendChild(bar);
    }

    function watchForUpdates(reg) {
        // Una versió nova ja descarregada i esperant (p. ex. d'una obertura anterior)
        if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);

        reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            worker?.addEventListener("statechange", () => {
                // "installed" amb un controlador actiu = hi ha una versió anterior funcionant
                if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner(worker);
            });
        });

        // A l'iPhone l'app torna del segon pla sense recarregar-se: en tornar-hi, comprova si n'hi ha de nova.
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") reg.update().catch(() => { });
        });
    }

    function registerServiceWorker() {
        if (!("serviceWorker" in navigator)) return;

        let reloading = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            // La versió nova ha pres el control: recarreguem una sola vegada.
            if (reloading) return;
            reloading = true;
            location.reload();
        });

        navigator.serviceWorker.register("service-worker.js", { updateViaCache: "none" })
            .then(watchForUpdates)
            .catch(() => { });
    }

    window.marcador = {
        registerServiceWorker,

        vibrate(ms) {
            try { navigator.vibrate?.(ms); } catch { }
        },

        // Comparteix la imatge del marcador (WhatsApp, etc.). Retorna "shared", "cancelled" o "downloaded".
        async shareScore(d) {
            const canvas = drawScore(d);
            const file = canvasToFile(canvas, "marcador.png");
            const text = `🏀 ${d.home.name} ${d.home.score} – ${d.away.score} ${d.away.name} (${d.period})`;

            if (navigator.canShare?.({ files: [file] })) {
                try {
                    await navigator.share({ files: [file], text });
                    return "shared";
                } catch (e) {
                    if (e?.name === "AbortError") return "cancelled";
                    // Si falla, continuem amb la descàrrega.
                }
            }

            const a = document.createElement("a");
            a.href = URL.createObjectURL(file);
            a.download = "marcador.png";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            return "downloaded";
        }
    };
})();
