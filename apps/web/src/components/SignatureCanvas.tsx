import { useCallback, useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { useTranslation } from "react-i18next";

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

/**
 * WEAKNESSES M10 - the resize DECISION, as a pure function.
 *
 * The bug: `initCanvas` ran on every window resize and assigned
 * `canvas.width = rect.width * dpr`. Assigning either dimension of a canvas
 * CLEARS its backing store. So rotating a tablet, opening the on-screen
 * keyboard, or any browser-chrome reflow silently erased a signature the patient
 * had already given - and the consent modal happily submitted the blank result.
 *
 * Two things follow from that:
 *   - a resize must snapshot the bitmap and redraw it at the new scale;
 *   - a resize that does not actually change the backing store must be a NO-OP,
 *     because the cheapest way to not lose a drawing is to not touch the canvas.
 *
 * The decision lives here so it can be tested without a canvas implementation.
 */
export interface CanvasResizePlan {
  changed: boolean;
  nextWidth: number;
  nextHeight: number;
  /** Whether the existing bitmap must be preserved across the resize. */
  snapshot: boolean;
}

export function planCanvasResize(input: {
  currentWidth: number;
  currentHeight: number;
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  hasDrawing: boolean;
}): CanvasResizePlan {
  const dpr = input.dpr > 0 ? input.dpr : 1;
  const nextWidth = Math.max(1, Math.round(input.cssWidth * dpr));
  const nextHeight = Math.max(1, Math.round(input.cssHeight * dpr));
  const changed = nextWidth !== input.currentWidth || nextHeight !== input.currentHeight;
  return {
    changed,
    nextWidth,
    nextHeight,
    snapshot: changed && input.hasDrawing && input.currentWidth > 0 && input.currentHeight > 0,
  };
}

export const SignatureCanvas = forwardRef<SignatureCanvasRef, SignatureCanvasProps>(
  ({ id = "signature-canvas", strokeColor = "#1e293b", lineWidth = 2.5, onBegin, onEnd }, ref) => {
    const { t } = useTranslation();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [hasDrawing, setHasDrawing] = useState(false);
    // A ref as well as state: the resize handler runs outside React's render
    // cycle and must not read a stale closure to decide whether to snapshot.
    const hasDrawingRef = useRef(false);
    const isDrawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);

    const markDrawn = useCallback((drawn: boolean) => {
      hasDrawingRef.current = drawn;
      setHasDrawing(drawn);
    }, []);

    const applyStrokeStyle = useCallback(
      (ctx: CanvasRenderingContext2D, dpr: number) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
      },
      [strokeColor, lineWidth],
    );

    /** Resize the backing store WITHOUT losing what is already drawn (M10). */
    const syncCanvasSize = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const plan = planCanvasResize({
        currentWidth: canvas.width,
        currentHeight: canvas.height,
        cssWidth: rect.width,
        cssHeight: rect.height,
        dpr,
        hasDrawing: hasDrawingRef.current,
      });

      if (!plan.changed) {
        // Same backing store: only the stroke style may need re-applying.
        applyStrokeStyle(ctx, dpr);
        return;
      }

      let snapshot: HTMLCanvasElement | null = null;
      if (plan.snapshot) {
        snapshot = document.createElement("canvas");
        snapshot.width = canvas.width;
        snapshot.height = canvas.height;
        snapshot.getContext("2d")?.drawImage(canvas, 0, 0);
      }

      // Assigning width/height clears the bitmap AND resets the transform.
      canvas.width = plan.nextWidth;
      canvas.height = plan.nextHeight;
      applyStrokeStyle(ctx, dpr);

      if (snapshot) {
        ctx.save();
        // Draw in DEVICE pixels so the restored stroke scales with the canvas
        // instead of being re-scaled a second time by the dpr transform.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(
          snapshot,
          0,
          0,
          snapshot.width,
          snapshot.height,
          0,
          0,
          plan.nextWidth,
          plan.nextHeight,
        );
        ctx.restore();
        applyStrokeStyle(ctx, dpr);
      }
    }, [applyStrokeStyle]);

    useEffect(() => {
      syncCanvasSize();
      const handleResize = () => syncCanvasSize();
      window.addEventListener("resize", handleResize);
      window.addEventListener("orientationchange", handleResize);

      // A modal that animates open changes the pad's box without a window
      // resize event, which is the other way the signature used to vanish.
      let observer: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined" && canvasRef.current) {
        observer = new ResizeObserver(handleResize);
        observer.observe(canvasRef.current);
      }

      return () => {
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("orientationchange", handleResize);
        observer?.disconnect();
      };
    }, [syncCanvasSize]);

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

      markDrawn(true);
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
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        markDrawn(false);
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
            {t("dashboard.signatureCanvas.placeholder")}
          </div>
        )}
      </div>
    );
  }
);

SignatureCanvas.displayName = "SignatureCanvas";
export default SignatureCanvas;
