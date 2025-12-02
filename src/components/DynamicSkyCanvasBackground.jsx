import React, { useRef, useEffect } from "react";

const DynamicSkyCanvasBackground = ({ lowSpecMode = false }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // 🌤 軽量モードのときは静止背景のみ描画（暗めにして見やすくする）
    if (lowSpecMode) {
      const w = canvas.width;
      const h = canvas.height;

      // ★暗い背景グラデーション
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, "#1a1a1a"); // 下：ほぼ黒
      grad.addColorStop(1, "#333333"); // 上：ダークグレー

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      return () => window.removeEventListener("resize", resize);
    }

    // 🌟 星データ
    const stars = Array.from({ length: 20 }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.7,
      r: Math.random() * 1.2 + 0.5,
      alpha: Math.random(),
      speed: Math.random() * 0.01 + 0.005,
    }));

    // ☁️ 雲データ
    const clouds = Array.from({ length: 2 }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.4,
      size: Math.random() * 80 + 80,
      speed: Math.random() * 0.2 + 0.1,
    }));

    let shootingStar = null;
    let shootingTimer = 0;
    let progress = 0;
    let animId = null;

    const draw = () => {
      progress += 0.0001;
      if (progress >= 1) progress = 0;

      const w = canvas.width;
      const h = canvas.height;
      const sunHeight = Math.cos(progress * 2 * Math.PI);
      const sunX = w * progress;
      const sunY = h * (0.6 - sunHeight * 0.4);
      const isDay = sunHeight > 0;

      const grad = ctx.createLinearGradient(0, h, 0, 0);
      if (sunHeight < -0.3) {
        grad.addColorStop(0, "#0D1B2A");
        grad.addColorStop(1, "#1A237E");
      } else if (sunHeight < 0) {
        grad.addColorStop(0, "#FFB347");
        grad.addColorStop(1, "#6A5ACD");
      } else if (sunHeight < 0.5) {
        grad.addColorStop(0, "#FFD194");
        grad.addColorStop(1, "#70E1F5");
      } else {
        grad.addColorStop(0, "#4FC3F7");
        grad.addColorStop(1, "#E0F7FA");
      }

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // ☁️ 昼の雲
      if (isDay) {
        clouds.forEach((c) => {
          c.x += c.speed;
          if (c.x - c.size > w) c.x = -c.size;
          const cloudGrad = ctx.createRadialGradient(
            c.x,
            c.y,
            10,
            c.x,
            c.y,
            c.size
          );
          cloudGrad.addColorStop(0, "rgba(255,255,255,0.8)");
          cloudGrad.addColorStop(1, "rgba(255,255,255,0)");
          ctx.beginPath();
          ctx.fillStyle = cloudGrad;
          ctx.arc(c.x, c.y, c.size, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // ⭐ 夜の星
      if (!isDay) {
        stars.forEach((s) => {
          s.alpha += s.speed * (Math.random() < 0.5 ? -1 : 1);
          s.alpha = Math.max(0.2, Math.min(1, s.alpha));
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
          ctx.fill();
        });

        // 🌠 流れ星
        shootingTimer++;
        if (!shootingStar && shootingTimer > 300 && Math.random() < 0.02) {
          shootingStar = {
            x: Math.random() * w * 0.5 + w * 0.25,
            y: Math.random() * h * 0.3,
            length: 100,
            speed: 20,
            alpha: 1,
          };
          shootingTimer = 0;
        }
        if (shootingStar) {
          const s = shootingStar;
          ctx.beginPath();
          const grad = ctx.createLinearGradient(
            s.x,
            s.y,
            s.x - s.length,
            s.y + s.length * 0.3
          );
          grad.addColorStop(0, `rgba(255,255,255,${s.alpha})`);
          grad.addColorStop(1, "rgba(255,255,255,0)");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2;
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x - s.length, s.y + s.length * 0.3);
          ctx.stroke();
          s.x += s.speed;
          s.y -= s.speed * 0.3;
          s.alpha -= 0.03;
          if (s.alpha <= 0) shootingStar = null;
        }
      }

      // ☀️ 太陽 or 🌙 月
      if (isDay) {
        const sunGradient = ctx.createRadialGradient(
          sunX,
          sunY,
          5,
          sunX,
          sunY,
          40
        );
        sunGradient.addColorStop(0, "#FFFDE7");
        sunGradient.addColorStop(1, "#FFB300");
        ctx.beginPath();
        ctx.fillStyle = sunGradient;
        ctx.arc(sunX, sunY, 40, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const moonX = w * ((progress + 0.5) % 1);
        const moonY = h * (0.6 + sunHeight * 0.4);
        const moonGradient = ctx.createRadialGradient(
          moonX,
          moonY,
          5,
          moonX,
          moonY,
          25
        );
        moonGradient.addColorStop(0, "#F5F5FF");
        moonGradient.addColorStop(1, "#B0B0FF");
        ctx.beginPath();
        ctx.fillStyle = moonGradient;
        ctx.arc(moonX, moonY, 30, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [lowSpecMode]); // 🔄 lowSpecMode変化で再描画制御

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-screen h-screen"
      style={{ zIndex: -50 }}
    />
  );
};

export default DynamicSkyCanvasBackground;
