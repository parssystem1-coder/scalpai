import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export type VisualMode = "silk" | "follicle" | "scan";

interface DiagnosticMarker {
  id: string;
  title: string;
  value: string;
  status: "optimal" | "good" | "analyzing";
  position: [number, number, number];
}

const MARKERS: DiagnosticMarker[] = [
  { id: "density", title: "تراکم موضعی", value: "۱۴۸ تار/cm²", status: "optimal", position: [-1.4, 0.8, 0.4] },
  { id: "diameter", title: "قطر میانگین تار", value: "۸۴ میکرون (عالی)", status: "optimal", position: [1.2, 0.4, 0.6] },
  { id: "sebum", title: "تراز چربی اپیدرم", value: "متعادل (۲۱٪)", status: "good", position: [-0.9, -0.9, 0.5] },
  { id: "anagen", title: "فاز رشد فعال (Anagen)", value: "۸۹٪ فولیکول‌ها", status: "optimal", position: [1.3, -0.7, 0.3] },
];

export default function LuxuryScalp3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeMode, setActiveMode] = useState<VisualMode>("silk");
  const [selectedMarker, setSelectedMarker] = useState<DiagnosticMarker | null>(MARKERS[0]);
  const [_isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 550;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    // 2. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // 3. Lighting (Warm Champagne & Soft Studio Glow)
    const ambientLight = new THREE.AmbientLight(0xfff8f0, 1.4);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffebd2, 2.2);
    mainLight.position.set(4, 5, 4);
    scene.add(mainLight);

    const goldLight = new THREE.PointLight(0xd4af37, 3.5, 12);
    goldLight.position.set(-3, -2, 3);
    scene.add(goldLight);

    const roseLight = new THREE.PointLight(0xe8b4a2, 2.5, 10);
    roseLight.position.set(3, -3, 2);
    scene.add(roseLight);

    // 4. Object Groups
    const masterGroup = new THREE.Group();
    scene.add(masterGroup);

    // Silk Wave Curves
    const silkCurvesGroup = new THREE.Group();
    masterGroup.add(silkCurvesGroup);

    const STRAND_COUNT = 28;
    const strandMeshes: THREE.Mesh[] = [];

    for (let i = 0; i < STRAND_COUNT; i++) {
      const u = i / STRAND_COUNT;
      const angle = u * Math.PI * 2;
      const radius = 1.2 + Math.sin(u * 8) * 0.35;

      const points: THREE.Vector3[] = [];
      const segmentCount = 40;
      for (let j = 0; j <= segmentCount; j++) {
        const v = j / segmentCount;
        const y = (v - 0.5) * 3.8;
        const wave = Math.sin(v * 6 + u * Math.PI * 2) * 0.55;
        const x = Math.cos(angle + v * 2) * (radius + wave * 0.3);
        const z = Math.sin(angle + v * 2) * (radius + wave * 0.3) + Math.cos(v * 4) * 0.2;
        points.push(new THREE.Vector3(x, y, z));
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.024 + (i % 3) * 0.012, 10, false);

      const isGoldAccent = i % 4 === 0;
      const strandMat = new THREE.MeshPhysicalMaterial({
        color: isGoldAccent ? new THREE.Color(0xd4af37) : new THREE.Color(0xf6e5d8),
        emissive: isGoldAccent ? new THREE.Color(0x735518) : new THREE.Color(0x38281d),
        metalness: isGoldAccent ? 0.65 : 0.2,
        roughness: 0.15,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        transmission: 0.25,
        opacity: 0.92,
        transparent: true,
      });

      const strandMesh = new THREE.Mesh(tubeGeo, strandMat);
      strandMeshes.push(strandMesh);
      silkCurvesGroup.add(strandMesh);
    }

    // Core Crystal Follicle / Hair Bulb (Translucent core)
    const follicleGroup = new THREE.Group();
    masterGroup.add(follicleGroup);

    const bulbGeo = new THREE.SphereGeometry(0.75, 48, 48);
    const bulbMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xfffdfa),
      metalness: 0.1,
      roughness: 0.05,
      transmission: 0.85,
      ior: 1.45,
      thickness: 1.2,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.88,
    });
    const bulbMesh = new THREE.Mesh(bulbGeo, bulbMat);
    follicleGroup.add(bulbMesh);

    // Inner glowing core
    const innerCoreGeo = new THREE.SphereGeometry(0.35, 32, 32);
    const innerCoreMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xd4af37),
      emissive: new THREE.Color(0xc59b27),
      emissiveIntensity: 1.8,
      roughness: 0.2,
    });
    const innerCoreMesh = new THREE.Mesh(innerCoreGeo, innerCoreMat);
    follicleGroup.add(innerCoreMesh);

    // Outer Diagnostic Rings / Torus
    const ringGeo1 = new THREE.TorusGeometry(1.6, 0.012, 16, 100);
    const ringMat1 = new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.6 });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    ring1.rotation.x = Math.PI / 2.8;
    masterGroup.add(ring1);

    const ringGeo2 = new THREE.TorusGeometry(1.9, 0.008, 16, 100);
    const ringMat2 = new THREE.MeshBasicMaterial({ color: 0xe0a899, transparent: true, opacity: 0.45 });
    const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    ring2.rotation.y = Math.PI / 3.5;
    masterGroup.add(ring2);

    // Sparkle Particle Field (Golden & Pearl Micro-dust)
    const particleCount = 180;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    const particleScales = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      particlePos[i * 3] = (Math.random() - 0.5) * 6.5;
      particlePos[i * 3 + 1] = (Math.random() - 0.5) * 5.5;
      particlePos[i * 3 + 2] = (Math.random() - 0.5) * 4.0;
      particleScales[i] = Math.random() * 0.04 + 0.015;
    }

    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xd4af37,
      size: 0.06,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const particleField = new THREE.Points(particleGeo, particleMat);
    masterGroup.add(particleField);

    // 5. Interactive Mouse Parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetX = x * 1.8;
      targetY = y * 1.4;
    };

    container.addEventListener("pointermove", handlePointerMove);

    // 6. Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      if (newWidth === 0 || newHeight === 0) return;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    });
    resizeObserver.observe(container);

    // 7. Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Smooth mouse interpolation
      mouseX += (targetX - mouseX) * 0.05;
      mouseY += (targetY - mouseY) * 0.05;

      masterGroup.rotation.y = elapsedTime * 0.22 + mouseX * 0.8;
      masterGroup.rotation.x = Math.sin(elapsedTime * 0.15) * 0.1 + mouseY * 0.5;

      ring1.rotation.z = elapsedTime * 0.35;
      ring2.rotation.z = -elapsedTime * 0.25;

      // Gentle pulsing of the inner follicle core
      const pulse = 1 + Math.sin(elapsedTime * 2.5) * 0.08;
      innerCoreMesh.scale.set(pulse, pulse, pulse);

      // Micro-wave in particle system
      particleField.rotation.y = elapsedTime * 0.06;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      container.removeEventListener("pointermove", handlePointerMove);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div
      id="luxury-3d-stage"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "520px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderRadius: "24px",
        background: "radial-gradient(circle at 50% 45%, rgba(254, 249, 238, 0.9) 0%, rgba(247, 240, 227, 0.5) 55%, rgba(253, 251, 247, 0) 80%)",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Three.js Container */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
          cursor: "grab",
        }}
      />

      {/* Floating 3D Diagnostic Node Markers */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {MARKERS.map((m, idx) => {
          const isSelected = selectedMarker?.id === m.id;
          // Calculate stylized 2D positions aligned with the 3D space
          const positions = [
            { top: "18%", right: "8%" },
            { top: "24%", left: "10%" },
            { bottom: "22%", right: "12%" },
            { bottom: "16%", left: "14%" },
          ];
          const pos = positions[idx] || { top: "50%", left: "50%" };

          return (
            <div
              key={m.id}
              onClick={() => setSelectedMarker(m)}
              style={{
                position: "absolute",
                ...pos,
                pointerEvents: "auto",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                transform: isSelected ? "scale(1.05)" : "scale(1)",
                zIndex: isSelected ? 30 : 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 12px",
                  borderRadius: "20px",
                  background: isSelected
                    ? "linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(254, 243, 199, 0.9))"
                    : "rgba(255, 255, 255, 0.75)",
                  backdropFilter: "blur(12px)",
                  border: isSelected
                    ? "1px solid rgba(212, 175, 55, 0.6)"
                    : "1px solid rgba(226, 232, 240, 0.8)",
                  boxShadow: isSelected
                    ? "0 10px 25px -5px rgba(212, 175, 55, 0.25), 0 0 0 1px rgba(212, 175, 55, 0.2)"
                    : "0 4px 15px rgba(0, 0, 0, 0.04)",
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: "#d4af37",
                    boxShadow: "0 0 8px #d4af37",
                  }}
                />
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.72rem", color: "#78716c", fontWeight: 500 }}>{m.title}</div>
                  <div style={{ fontSize: "0.82rem", color: "#1c1917", fontWeight: 700 }}>{m.value}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Mode Switcher on Bottom of 3D Scene */}
      <div
        style={{
          position: "absolute",
          bottom: "16px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "5px",
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(16px)",
          borderRadius: "30px",
          border: "1px solid rgba(212, 175, 55, 0.25)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
          zIndex: 25,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveMode("silk")}
          style={{
            border: "none",
            background: activeMode === "silk" ? "linear-gradient(135deg, #d4af37, #b88e1e)" : "transparent",
            color: activeMode === "silk" ? "#ffffff" : "#78716c",
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "0.75rem",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow: activeMode === "silk" ? "0 4px 12px rgba(212, 175, 55, 0.3)" : "none",
          }}
        >
          ✨ نمای ابریشمی موج‌دار
        </button>
        <button
          type="button"
          onClick={() => setActiveMode("follicle")}
          style={{
            border: "none",
            background: activeMode === "follicle" ? "linear-gradient(135deg, #d4af37, #b88e1e)" : "transparent",
            color: activeMode === "follicle" ? "#ffffff" : "#78716c",
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "0.75rem",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow: activeMode === "follicle" ? "0 4px 12px rgba(212, 175, 55, 0.3)" : "none",
          }}
        >
          🔬 کریستال فولیکول
        </button>
        <button
          type="button"
          onClick={() => setActiveMode("scan")}
          style={{
            border: "none",
            background: activeMode === "scan" ? "linear-gradient(135deg, #d4af37, #b88e1e)" : "transparent",
            color: activeMode === "scan" ? "#ffffff" : "#78716c",
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "0.75rem",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow: activeMode === "scan" ? "0 4px 12px rgba(212, 175, 55, 0.3)" : "none",
          }}
        >
          🌐 اسکن رادیال AI
        </button>
      </div>

      {/* Subtle interaction tip */}
      <div
        style={{
          position: "absolute",
          top: "14px",
          background: "rgba(255, 255, 255, 0.7)",
          backdropFilter: "blur(8px)",
          padding: "3px 10px",
          borderRadius: "12px",
          fontSize: "0.7rem",
          color: "#a8a29e",
          border: "1px solid rgba(226, 232, 240, 0.6)",
          pointerEvents: "none",
        }}
      >
        ماوس را حرکت دهید یا روی نودها کلیک کنید
      </div>
    </div>
  );
}
