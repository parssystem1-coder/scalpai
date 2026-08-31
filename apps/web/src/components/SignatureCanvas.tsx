import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";

export interface SignatureCanvasRef {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string | null;
}

interface SignatureCanvasProps {
  id?: string;
  width?: number;
  height?: number;
  strokeColor?: string;
  lineWidth?: number;
  onBegin?: () => void;
  onEnd?: () => void;
}

export const SignatureCanvas = forwardRef<SignatureCanvasRef, SignatureCanvasProps>(
  ({ id = "signature-canvas", strokeColor = "#1e293b", lineWidth = 2.5, onBegin, onEnd }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [hasDrawing, setHasDrawing] = useState(false);
    const isDrawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);

    const initCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
    };

    useEffect(() => {
      initCanvas();
      const handleResize = () => initCanvas();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, [strokeColor, lineWidth]);

    const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);

      isDrawingRef.current = true;
      const pt = getCanvasPoint(e);
      lastPointRef.current = pt;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
      }

      setHasDrawing(true);
      onBegin?.();
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const pt = getCanvasPoint(e);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      lastPointRef.current = pt;
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      if (canvas && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      isDrawingRef.current = false;
      lastPointRef.current = null;
      onEnd?.();
    };

    useImperativeHandle(ref, () => ({
      clear: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasDrawing(false);
      },
      isEmpty: () => !hasDrawing,
      toDataURL: () => {
        const canvas = canvasRef.current;
        if (!canvas || !hasDrawing) return null;
        return canvas.toDataURL("image/png");
      },
    }));

    return (
      <div className="relative w-full overflow-hidden rounded-xl border border-stone-300 bg-white/90 shadow-inner">
        <canvas
          id={id}
          ref={canvasRef}
          className="h-44 w-full cursor-crosshair touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        {!hasDrawing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-stone-400 select-none">
            محل لمس / امضای بیمار با انگشت یا قلم نوری
          </div>
        )}
      </div>
    );
  }
);

SignatureCanvas.displayName = "SignatureCanvas";
export default SignatureCanvas;
