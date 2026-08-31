import React, { useRef, useState } from "react";

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  maxTilt?: number;
}

export default function LuxuryTiltCard({
  children,
  className = "",
  style = {},
  maxTilt = 6,
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const tiltX = ((y - centerY) / centerY) * -maxTilt;
    const tiltY = ((x - centerX) / centerX) * maxTilt;

    setTilt({ x: tiltX, y: tiltY });
    setGlare({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.55,
    });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    setGlare((prev) => ({ ...prev, opacity: 0 }));
  };

  return (
    <div
      style={{
        perspective: "1200px",
        width: "100%",
      }}
    >
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={`glass-card-3d ${className}`}
        style={{
          ...style,
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(0)`,
          transformStyle: "preserve-3d",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Specular Liquid Glare Reflection Overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: `radial-gradient(circle 350px at ${glare.x}% ${glare.y}%, rgba(255, 255, 255, ${glare.opacity}) 0%, rgba(255, 240, 245, ${glare.opacity * 0.4}) 30%, transparent 70%)`,
            transition: glare.opacity === 0 ? "opacity 0.5s ease" : "none",
            mixBlendMode: "overlay",
            zIndex: 1,
          }}
        />

        {/* Content */}
        <div style={{ position: "relative", zIndex: 2 }}>{children}</div>
      </div>
    </div>
  );
}
