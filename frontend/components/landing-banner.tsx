"use client";

import { useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { motion } from "motion/react";
import { useLanding } from "@/hooks/useLanding";

export function LandingBanner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { setAuthModalOpen, setPlan } = useLanding();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight * 0.7);

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight * 0.7;
    };
    window.addEventListener("resize", resize);

    const pixelSize = 16;
    let cols = Math.floor(w / pixelSize);
    let rows = Math.floor(h / pixelSize);
    const pixels = Array.from({ length: cols * rows }, () => ({
      val: Math.random() * 0.5,
      target: Math.random(),
      speed: Math.random() * 0.05 + 0.01,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      const currentCols = Math.floor(w / pixelSize);
      const currentRows = Math.floor(h / pixelSize);

      for (let i = 0; i < currentCols; i++) {
        for (let j = 0; j < currentRows; j++) {
          const idx = i + j * currentCols;
          if (!pixels[idx]) {
            pixels[idx] = {
              val: Math.random() * 0.5,
              target: Math.random(),
              speed: Math.random() * 0.05 + 0.01,
            };
          }

          let p = pixels[idx];
          p.val += (p.target - p.val) * p.speed;

          if (Math.abs(p.target - p.val) < 0.05) {
            // New target to simulate fast recalculation
            p.target = Math.random() > 0.9 ? Math.random() : 0;
            p.speed = Math.random() * 0.1 + 0.05;
          }

          if (p.val > 0.1) {
            // using the blue primary theme
            ctx.fillStyle = `rgba(59, 130, 246, ${p.val * 0.8})`;
            ctx.fillRect(
              i * pixelSize + 1,
              j * pixelSize + 1,
              pixelSize - 2,
              pixelSize - 2,
            );
          }
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative w-full h-[70vh] min-h-[500px] flex items-center justify-center overflow-hidden bg-background border-b border-border">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-40 dark:opacity-20"
      />

      {/* Radial gradient mask to fade canvas smoothly at the edges */}
      <div className="absolute inset-0 bg-background [mask-image:radial-gradient(transparent_20%,black_100%)] pointer-events-none" />

      <div className="relative z-10 text-center px-4 md:px-6 w-full max-w-4xl mx-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="bg-primary/10 border border-primary/20 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-6 backdrop-blur-md inline-block shadow-sm"
        >
          Новая эра вашей приватности
        </motion.div>

        <motion.h1
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-tight"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <span className="text-primary bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-400">
            lowkey
          </span>{" "}
          — защищенное соединение и ускорение интернета
        </motion.h1>

        <motion.p
          className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-foreground mb-4 mt-6 leading-tight"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Первые 3 месяца —{" "}
          <span className="text-primary tracking-tight">99 рублей</span>
        </motion.p>

        <motion.p
          className="text-xs md:text-sm text-muted-foreground/40 mb-10 mx-auto font-medium whitespace-nowrap"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          * далее от 299 рублей в месяц (при оплате за год)
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Button
            size="lg"
            className="text-lg px-8 py-7 rounded-full shadow-[0_0_40px_-10px_rgba(59,130,246,0.6)] cursor-pointer hover:scale-105 transition-all outline-none font-bold group"
            onClick={() => {
              setPlan("advanced", "12");
              setAuthModalOpen(true);
            }}
          >
            Ускорить интернет
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
