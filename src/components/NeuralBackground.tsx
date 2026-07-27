/**
 * Animated neural / follicle background for the "neural" theme.
 * Layers: photo base → vignette → swaying hair strands → particles → center AI glow.
 */
import neuralBgUrl from '../assets/themes/neural-bg.png';

export default function NeuralBackground() {
  return (
    <div className="neural-bg fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden>
      {/* Base artwork */}
      <div
        className="neural-bg__photo absolute inset-0"
        style={{
          backgroundImage: `url(${neuralBgUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* Soft drift of the photo for depth */}
      <div
        className="neural-bg__photo neural-bg__photo--drift absolute inset-[-4%]"
        style={{
          backgroundImage: `url(${neuralBgUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.35,
          mixBlendMode: 'screen',
        }}
      />

      {/* Readability vignette — darken center for UI */}
      <div className="neural-bg__vignette absolute inset-0" />

      {/* Teal pulse (left organic field) */}
      <div className="neural-bg__orb neural-bg__orb--teal absolute -left-[10%] top-[15%] w-[55vw] h-[55vw] max-w-[720px] max-h-[720px] rounded-full" />

      {/* Purple pulse (right follicle field) */}
      <div className="neural-bg__orb neural-bg__orb--purple absolute -right-[8%] bottom-[5%] w-[50vw] h-[50vw] max-w-[680px] max-h-[680px] rounded-full" />

      {/* Animated hair strands */}
      <svg
        className="neural-bg__strands absolute inset-0 w-full h-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="neuralStrandA" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#c026d3" stopOpacity="0" />
            <stop offset="35%" stopColor="#e879f9" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#f5d0fe" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="neuralStrandB" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0" />
            <stop offset="40%" stopColor="#a78bfa" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#ddd6fe" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id="neuralStrandC" x1="0%" y1="100%" x2="20%" y2="0%">
            <stop offset="0%" stopColor="#db2777" stopOpacity="0" />
            <stop offset="45%" stopColor="#f472b6" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#fce7f3" stopOpacity="0.12" />
          </linearGradient>
          <filter id="neuralGlow" x="-50%" y="-20%" width="200%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Right-side follicle strands */}
        <g filter="url(#neuralGlow)" className="neural-bg__strand-group">
          <path className="neural-strand neural-strand--1" d="M980 880 C990 720, 1010 520, 1000 280 C995 160, 1015 80, 1030 20" fill="none" stroke="url(#neuralStrandA)" strokeWidth="2.2" strokeLinecap="round" />
          <path className="neural-strand neural-strand--2" d="M1040 900 C1055 740, 1070 540, 1060 300 C1055 180, 1080 90, 1100 10" fill="none" stroke="url(#neuralStrandB)" strokeWidth="1.8" strokeLinecap="round" />
          <path className="neural-strand neural-strand--3" d="M1110 890 C1125 730, 1145 550, 1135 310 C1130 190, 1160 100, 1185 0" fill="none" stroke="url(#neuralStrandA)" strokeWidth="2.4" strokeLinecap="round" />
          <path className="neural-strand neural-strand--4" d="M1180 900 C1200 750, 1210 560, 1205 340 C1202 210, 1230 110, 1255 20" fill="none" stroke="url(#neuralStrandC)" strokeWidth="1.6" strokeLinecap="round" />
          <path className="neural-strand neural-strand--5" d="M1240 885 C1265 720, 1280 530, 1270 300 C1265 175, 1295 85, 1320 5" fill="none" stroke="url(#neuralStrandB)" strokeWidth="2" strokeLinecap="round" />
          <path className="neural-strand neural-strand--6" d="M1305 900 C1330 740, 1345 560, 1335 320 C1330 195, 1365 95, 1390 15" fill="none" stroke="url(#neuralStrandA)" strokeWidth="1.5" strokeLinecap="round" />
          <path className="neural-strand neural-strand--7" d="M1370 890 C1395 730, 1410 540, 1400 300 C1395 180, 1425 90, 1450 0" fill="none" stroke="url(#neuralStrandC)" strokeWidth="1.9" strokeLinecap="round" />
          <path className="neural-strand neural-strand--8" d="M1015 870 C1025 700, 1040 500, 1030 260 C1025 140, 1050 60, 1065 0" fill="none" stroke="url(#neuralStrandB)" strokeWidth="1.3" strokeLinecap="round" />
        </g>

        {/* Subtle teal neural filaments on the left */}
        <g filter="url(#neuralGlow)" opacity="0.55">
          <path className="neural-strand neural-strand--teal1" d="M120 780 C140 620, 90 420, 160 240 C190 150, 140 70, 110 0" fill="none" stroke="#2dd4bf" strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.55" />
          <path className="neural-strand neural-strand--teal2" d="M220 820 C200 650, 250 450, 210 260 C190 160, 240 70, 260 10" fill="none" stroke="#5eead4" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.45" />
          <path className="neural-strand neural-strand--teal3" d="M60 850 C80 680, 40 480, 100 280 C130 170, 70 80, 40 20" fill="none" stroke="#14b8a6" strokeWidth="1.1" strokeLinecap="round" strokeOpacity="0.4" />
        </g>
      </svg>

      {/* Floating particles */}
      <div className="neural-bg__particles absolute inset-0">
        {[
          { left: '18%', top: '72%', delay: '0s', color: '#5eead4' },
          { left: '28%', top: '48%', delay: '-2s', color: '#a78bfa' },
          { left: '42%', top: '62%', delay: '-4s', color: '#f0abfc' },
          { left: '55%', top: '38%', delay: '-1s', color: '#e879f9' },
          { left: '68%', top: '70%', delay: '-6s', color: '#c4b5fd' },
          { left: '78%', top: '45%', delay: '-3.5s', color: '#f5d0fe' },
          { left: '88%', top: '58%', delay: '-7s', color: '#e879f9' },
          { left: '12%', top: '35%', delay: '-5s', color: '#2dd4bf' },
          { left: '35%', top: '22%', delay: '-8s', color: '#99f6e4' },
          { left: '50%', top: '78%', delay: '-2.5s', color: '#ddd6fe' },
          { left: '62%', top: '18%', delay: '-9s', color: '#f0abfc' },
          { left: '74%', top: '28%', delay: '-1.5s', color: '#a78bfa' },
          { left: '92%', top: '40%', delay: '-10s', color: '#f5d0fe' },
          { left: '8%', top: '58%', delay: '-11s', color: '#5eead4' },
          { left: '22%', top: '85%', delay: '-4.5s', color: '#14b8a6' },
          { left: '48%', top: '12%', delay: '-12s', color: '#c4b5fd' },
          { left: '82%', top: '82%', delay: '-3s', color: '#e879f9' },
          { left: '95%', top: '22%', delay: '-13s', color: '#f0abfc' },
        ].map((p, i) => (
          <span
            key={i}
            className="neural-particle"
            style={{
              left: p.left,
              top: p.top,
              animationDelay: p.delay,
              background: p.color,
              boxShadow: `0 0 10px ${p.color}`,
            }}
          />
        ))}
      </div>

      {/* Center AI atmosphere */}
      <div className="neural-bg__center-glow absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[50vh] max-w-[900px]" />
    </div>
  );
}
