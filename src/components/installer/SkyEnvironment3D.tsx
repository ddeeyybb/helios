import React from 'react';
import { Sky } from '@react-three/drei';

interface SkyEnvironment3DProps {
  season: 'DRY' | 'WET';
}

export const SkyEnvironment3D: React.FC<SkyEnvironment3DProps> = ({ season }) => {
  const isDry = season === 'DRY';

  // Dynamic atmospheric & lighting parameters
  // DRY Season: High sun angle, warm bright solar irradiance (5.1 PSH, 35.5°C)
  // WET Season: Moderate angle, softer diffuse daylight (4.1 PSH, 29.0°C)
  const sunPosition: [number, number, number] = isDry
    ? [25, 45, 20]
    : [15, 28, 15];

  const lightColor = isDry ? '#fff7ed' : '#e2e8f0';
  const lightIntensity = isDry ? 2.2 : 1.35;
  const ambientIntensity = isDry ? 0.75 : 0.95;
  const ambientColor = isDry ? '#fef3c7' : '#bae6fd';

  const skyParams = isDry
    ? { turbidity: 1.8, rayleigh: 0.6, mieCoefficient: 0.004, mieDirectionalG: 0.85 }
    : { turbidity: 7.5, rayleigh: 3.2, mieCoefficient: 0.025, mieDirectionalG: 0.92 };

  return (
    <>
      {/* R3F Sky Dome */}
      <Sky
        distance={450000}
        sunPosition={sunPosition}
        turbidity={skyParams.turbidity}
        rayleigh={skyParams.rayleigh}
        mieCoefficient={skyParams.mieCoefficient}
        mieDirectionalG={skyParams.mieDirectionalG}
      />

      {/* Atmospheric Ambient Fill Light */}
      <ambientLight intensity={ambientIntensity} color={ambientColor} />

      {/* Hemisphere fill light for realistic skylight ground bounce */}
      <hemisphereLight
        args={[isDry ? '#bfdbfe' : '#93c5fd', isDry ? '#334155' : '#1e293b', isDry ? 0.6 : 0.8]}
      />

      {/* Main Directional Sun Light with High-Resolution Shadow Map */}
      <directionalLight
        position={sunPosition}
        intensity={lightIntensity}
        color={lightColor}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00015}
        shadow-camera-near={0.5}
        shadow-camera-far={120}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
      />

      {/* Rim light for 3D depth separation */}
      <directionalLight position={[-15, 10, -20]} intensity={0.25} color="#94a3b8" />
    </>
  );
};

export default SkyEnvironment3D;
