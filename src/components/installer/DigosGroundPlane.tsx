import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Line, Html } from '@react-three/drei';

export interface PerimeterPoint {
  x: number;
  z: number;
}

interface DigosGroundPlaneProps {
  isPerimeterMode: boolean;
  perimeterPoints: PerimeterPoint[];
  onAddPoint: (point: PerimeterPoint) => void;
  onClearPoints: () => void;
}

export const DigosGroundPlane: React.FC<DigosGroundPlaneProps> = ({
  isPerimeterMode,
  perimeterPoints,
  onAddPoint,
  onClearPoints,
}) => {
  // Click handler for raycast on ground plane
  const handleGroundClick = (e: any) => {
    e.stopPropagation();
    if (!isPerimeterMode) return;

    // Get 3D intersection point on the ground plane
    const point = e.point;
    const roundedX = Math.round(point.x * 100) / 100;
    const roundedZ = Math.round(point.z * 100) / 100;
    onAddPoint({ x: roundedX, z: roundedZ });
  };

  // Build 3D vector points for closed line loop connecting perimeter nodes
  const linePoints = useMemo(() => {
    if (perimeterPoints.length < 2) return [];
    const pts = perimeterPoints.map((p) => new THREE.Vector3(p.x, 0.08, p.z));
    if (perimeterPoints.length >= 3) {
      pts.push(new THREE.Vector3(perimeterPoints[0].x, 0.08, perimeterPoints[0].z)); // close perimeter loop
    }
    return pts;
  }, [perimeterPoints]);

  return (
    <group>
      {/* Ground Mesh */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow
        onClick={handleGroundClick}
      >
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial
          color="#e2e8f0"
          roughness={0.9}
          metalness={0.05}
        />
      </mesh>

      {/* Coordinate Grid */}
      <gridHelper
        args={[100, 50, '#10b981', '#cbd5e1']}
        position={[0, 0.01, 0]}
      />

      {/* Interactive Perimeter Node Spheres */}
      {perimeterPoints.map((pt, idx) => (
        <group key={`p-node-${idx}`} position={[pt.x, 0.1, pt.z]}>
          <mesh castShadow>
            <sphereGeometry args={[0.22, 16, 16]} />
            <meshStandardMaterial
              color="#10b981"
              roughness={0.2}
            />
          </mesh>
          <Html position={[0, 0.4, 0]} center>
            <div className="bg-white border border-emerald-500 text-emerald-700 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shadow-sm select-none">
              P{idx + 1}
            </div>
          </Html>
        </group>
      ))}

      {/* 3D Perimeter Boundary Line Loop */}
      {linePoints.length >= 2 && (
        <Line
          points={linePoints}
          color="#059669"
          lineWidth={3.5}
          dashed={false}
        />
      )}

      {/* Tap Guidance Badge when Perimeter Tapping is Active */}
      {isPerimeterMode && (
        <Html position={[0, 0.5, 0]} center>
          <div className="bg-slate-900 text-white text-xs font-medium px-4 py-2 rounded-full shadow-xl border border-slate-700 select-none flex items-center gap-2">
            <span>✏ Tap ground to mark roof perimeter nodes ({perimeterPoints.length} set)</span>
            {perimeterPoints.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClearPoints();
                }}
                className="ml-2 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full transition cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </Html>
      )}
    </group>
  );
};

export default DigosGroundPlane;
