import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function LuxurySilkCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || 580;
    let height = container.clientHeight || 580;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 7.2);

    // 2. Renderer with High-End Color & Tonemapping
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // 3. Studio Lighting (Champagne, Pearl, Rose-Gold & Rim Light)
    const ambientLight = new THREE.AmbientLight(0xfff5ea, 1.8);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff0dc, 3.2);
    keyLight.position.set(5, 6, 5);
    scene.add(keyLight);

    const fillGoldLight = new THREE.PointLight(0xd4af37, 4.5, 14);
    fillGoldLight.position.set(-4, -2, 4);
    scene.add(fillGoldLight);

    const roseGlowLight = new THREE.PointLight(0xf3b8a6, 3.8, 12);
    roseGlowLight.position.set(3, -4, 3);
    scene.add(roseGlowLight);

    const topRimLight = new THREE.PointLight(0xffffff, 2.5, 10);
    topRimLight.position.set(0, 5, -2);
    scene.add(topRimLight);

    // 4. Main Scene Group
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // 5. Silky Flowing Strands (Multiple procedural harmonic curves)
    const ribbonGroup = new THREE.Group();
    rootGroup.add(ribbonGroup);

    const RIBBON_COUNT = 36;
    const strandTubes: {
      mesh: THREE.Mesh;
      baseRadius: number;
      angleOffset: number;
      speed: number;
      waveFreq: number;
      phase: number;
    }[] = [];

    // Materials
    const goldMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xdfba52),
      emissive: new THREE.Color(0x4a370e),
      roughness: 0.12,
      metalness: 0.75,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      reflectivity: 0.9,
    });

    const pearlMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xfcf6ee),
      emissive: new THREE.Color(0x3d3028),
      roughness: 0.18,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transmission: 0.35,
      ior: 1.48,
      thickness: 0.8,
      transparent: true,
      opacity: 0.94,
    });

    const roseChampagneMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xf1d2c6),
      emissive: new THREE.Color(0x3a201a),
      roughness: 0.15,
      metalness: 0.4,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      transparent: true,
      opacity: 0.9,
    });

    // Helper to generate dynamic curve points
    const generateStrandPoints = (
      baseAngle: number,
      radius: number,
      time: number,
      waveFreq: number,
      phase: number
    ) => {
      const points: THREE.Vector3[] = [];
      const steps = 48;
      for (let j = 0; j <= steps; j++) {
        const t = j / steps; // 0 to 1
        const y = (t - 0.5) * 4.6;
        
        // Multi-frequency organic silk flow
        const wave1 = Math.sin(t * waveFreq * Math.PI + time * 1.5 + phase) * 0.45;
        const wave2 = Math.cos(t * (waveFreq + 2) + time * 1.2) * 0.25;
        const twistAngle = baseAngle + t * 2.8 + Math.sin(time * 0.8 + t * 4) * 0.35;
        
        const currentR = radius + (wave1 + wave2) * 0.4 + (1 - Math.abs(t - 0.5) * 2) * 0.3;
        const x = Math.cos(twistAngle) * currentR;
        const z = Math.sin(twistAngle) * currentR + Math.sin(t * 3 + time) * 0.3;

        points.push(new THREE.Vector3(x, y, z));
      }
      return points;
    };

    // Create initial strands
    for (let i = 0; i < RIBBON_COUNT; i++) {
      const u = i / RIBBON_COUNT;
      const angle = u * Math.PI * 2;
      const baseRadius = 1.15 + Math.sin(u * 12) * 0.3;
      const waveFreq = 2.5 + (i % 3) * 0.8;
      const phase = u * Math.PI * 4;
      const speed = 0.8 + (i % 5) * 0.15;

      const points = generateStrandPoints(angle, baseRadius, 0, waveFreq, phase);
      const curve = new THREE.CatmullRomCurve3(points);
      const tubeRadius = (i % 4 === 0) ? 0.038 : (i % 3 === 0) ? 0.026 : 0.018;
      const tubeGeo = new THREE.TubeGeometry(curve, 54, tubeRadius, 10, false);

      let material = pearlMat;
      if (i % 5 === 0) material = goldMat;
      else if (i % 3 === 0) material = roseChampagneMat;

      const mesh = new THREE.Mesh(tubeGeo, material);
      ribbonGroup.add(mesh);

      strandTubes.push({
        mesh,
        baseRadius,
        angleOffset: angle,
        speed,
        waveFreq,
        phase,
      });
    }

    // 6. Central Crystal Bioluminescent Hair Bulb / Follicle Sphere
    const centerFollicleGroup = new THREE.Group();
    rootGroup.add(centerFollicleGroup);

    // Outer Glass Shell
    const crystalGeo = new THREE.SphereGeometry(0.85, 64, 64);
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffffff),
      roughness: 0.02,
      metalness: 0.05,
      transmission: 0.92,
      ior: 1.52,
      thickness: 1.6,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      transparent: true,
      opacity: 0.9,
    });
    const crystalSphere = new THREE.Mesh(crystalGeo, crystalMat);
    centerFollicleGroup.add(crystalSphere);

    // Inner Glowing Core (Champagne Gold Energy)
    const coreGeo = new THREE.SphereGeometry(0.42, 36, 36);
    const coreMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xd4af37),
      emissive: new THREE.Color(0xe5b22b),
      emissiveIntensity: 2.4,
      roughness: 0.2,
      metalness: 0.5,
    });
    const innerCore = new THREE.Mesh(coreGeo, coreMat);
    centerFollicleGroup.add(innerCore);

    // Light Aura Rings
    const ringMatGold = new THREE.MeshBasicMaterial({
      color: 0xd4af37,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const ringGeo1 = new THREE.TorusGeometry(1.5, 0.012, 16, 120);
    const ring1 = new THREE.Mesh(ringGeo1, ringMatGold);
    ring1.rotation.x = Math.PI / 3;
    centerFollicleGroup.add(ring1);

    const ringMatRose = new THREE.MeshBasicMaterial({
      color: 0xe59a84,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    const ringGeo2 = new THREE.TorusGeometry(1.85, 0.008, 16, 120);
    const ring2 = new THREE.Mesh(ringGeo2, ringMatRose);
    ring2.rotation.y = Math.PI / 2.6;
    centerFollicleGroup.add(ring2);

    // 7. Ambient Micro-Dust Sparkles (Floating Stardust Particles)
    const particleCount = 260;
    const particleGeo = new THREE.BufferGeometry();
    const particleCoords = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      particleCoords[i * 3] = (Math.random() - 0.5) * 8.5;
      particleCoords[i * 3 + 1] = (Math.random() - 0.5) * 7.5;
      particleCoords[i * 3 + 2] = (Math.random() - 0.5) * 5.5;
    }

    particleGeo.setAttribute("position", new THREE.BufferAttribute(particleCoords, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0xd4af37,
      size: 0.065,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    rootGroup.add(particles);

    // 8. Smooth Pointer Interaction with Elastic Parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      targetMouseX = nx * 2.2;
      targetMouseY = ny * 1.8;
    };

    container.addEventListener("pointermove", handlePointerMove);

    // 9. Resize Handling
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      if (nw === 0 || nh === 0) return;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    resizeObserver.observe(container);

    // 10. Animation Loop
    let animationId: number;
    const clock = new THREE.Clock();
    let frameCount = 0;

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      frameCount++;

      // Lerp mouse
      mouseX += (targetMouseX - mouseX) * 0.045;
      mouseY += (targetMouseY - mouseY) * 0.045;

      // Group rotation
      rootGroup.rotation.y = elapsed * 0.18 + mouseX * 0.6;
      rootGroup.rotation.x = Math.sin(elapsed * 0.12) * 0.08 + mouseY * 0.4;

      // Center sphere gentle floating pulse
      const pulse = 1.0 + Math.sin(elapsed * 2.2) * 0.06;
      innerCore.scale.set(pulse, pulse, pulse);
      centerFollicleGroup.position.y = Math.sin(elapsed * 1.2) * 0.12;

      // Rings spin
      ring1.rotation.z = elapsed * 0.3;
      ring2.rotation.z = -elapsed * 0.22;

      // Particle subtle swirl
      particles.rotation.y = elapsed * 0.04;
      particles.rotation.x = Math.cos(elapsed * 0.03) * 0.03;

      // Dynamic Re-computation of Strands (every 2 frames for smooth performance)
      if (frameCount % 2 === 0) {
        for (let i = 0; i < strandTubes.length; i++) {
          const item = strandTubes[i];
          const newPts = generateStrandPoints(
            item.angleOffset,
            item.baseRadius,
            elapsed * item.speed * 0.4,
            item.waveFreq,
            item.phase
          );
          const newCurve = new THREE.CatmullRomCurve3(newPts);
          const tubeRadius = (i % 4 === 0) ? 0.036 : (i % 3 === 0) ? 0.024 : 0.016;
          
          item.mesh.geometry.dispose();
          item.mesh.geometry = new THREE.TubeGeometry(newCurve, 40, tubeRadius, 8, false);
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      container.removeEventListener("pointermove", handlePointerMove);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      goldMat.dispose();
      pearlMat.dispose();
      roseChampagneMat.dispose();
      crystalMat.dispose();
      coreMat.dispose();
      particleMat.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "500px",
        cursor: "grab",
        position: "relative",
      }}
    />
  );
}
