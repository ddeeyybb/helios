import React, { useMemo, useState } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';

export type RoofStyle = 'gable' | 'flat' | 'hip' | 'mono';

export interface ManualPanel {
  id: string;
  side: 'left' | 'right' | 'main' | 'front' | 'back' | 'north' | 'south';
  slantY: number;
  z: number; // coordinate along the ridge axis (X-axis)
}

export interface GableMeshOptions {
  width: number;       // Meters along X-axis (building length along longitude)
  length: number;      // Meters along Z-axis (building width / depth across eaves)
  pitchDeg?: number;   // Pitch in degrees (e.g. 15°)
  elevation?: number;  // Floating elevation in meters (e.g. 3.8m)
  roofColor?: string;
  ridgeColor?: string;
}

/**
 * Procedural Three.js Gable Roof Geometry Generator
 * - Maps Length (distance P1 to P3 along Longitude) to X-axis
 * - Maps Width (distance P1 to P2 along Latitude) to Z-axis
 * - Centers ridge line along the longer axis (X-axis)
 * - Computes ridge rise: h = (length / 2) * tan(pitch) (e.g. (6.2/2)*tan(15°) = 0.83m)
 */
export function buildGableMesh({
  width,
  length,
  pitchDeg = 15,
  elevation = 3.8,
  roofColor = '#475569',
  ridgeColor = '#047857',
}: GableMeshOptions): THREE.Group {
  const group = new THREE.Group();
  if (width <= 0 || length <= 0) return group;

  const effectivePitch = Math.max(0, Math.min(45, pitchDeg));
  const pitchRad = (effectivePitch * Math.PI) / 180;
  const halfDepth = length / 2;
  const cosPitch = Math.max(0.0001, Math.cos(pitchRad));
  const roofRise = halfDepth * Math.tan(pitchRad);
  const slantHeight = halfDepth / cosPitch;

  const roofMat = new THREE.MeshStandardMaterial({
    color: roofColor,
    roughness: 0.35,
    metalness: 0.45,
  });

  const ridgeMat = new THREE.MeshStandardMaterial({
    color: ridgeColor,
    roughness: 0.3,
    metalness: 0.8,
  });

  // 1. North / Back Slope (slopes upward toward Z=0 ridge)
  const northGroup = new THREE.Group();
  northGroup.position.set(0, elevation, -halfDepth);
  northGroup.rotation.x = -pitchRad;

  const northMesh = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.2, 0.12, slantHeight),
    roofMat
  );
  northMesh.position.set(0, 0.06, slantHeight / 2);
  northMesh.castShadow = true;
  northMesh.receiveShadow = true;
  northGroup.add(northMesh);
  group.add(northGroup);

  // 2. South / Front Slope (slopes upward toward Z=0 ridge)
  const southGroup = new THREE.Group();
  southGroup.position.set(0, elevation, halfDepth);
  southGroup.rotation.x = pitchRad;

  const southMesh = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.2, 0.12, slantHeight),
    roofMat
  );
  southMesh.position.set(0, 0.06, -slantHeight / 2);
  southMesh.castShadow = true;
  southMesh.receiveShadow = true;
  southGroup.add(southMesh);
  group.add(southGroup);

  // 3. Center Ridge Apex Cap (runs parallel to X-axis)
  if (effectivePitch > 0) {
    const ridgeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.3, 0.08, 0.25),
      ridgeMat
    );
    ridgeMesh.position.set(0, elevation + roofRise + 0.04, 0);
    ridgeMesh.castShadow = true;
    group.add(ridgeMesh);
  }

  return group;
}

export interface House3DEngineProps {
  hasRoof: boolean;
  roofStyle?: RoofStyle;
  width?: number;        // Flat 2D base width in meters (Geographic length P1->P3 along Longitude, X-axis)
  depth?: number;        // Flat 2D base depth in meters (Geographic width P1->P2 along Latitude, Z-axis)
  elevation?: number;    // Anti-gravity floating height above ground/grid
  pitchDeg: number;      // Roof pitch angle theta (0° - 45°)
  layoutMode: 'auto' | 'manual';
  autoEnabled: boolean;
  rows: number;          // Panel rows (auto mode, along slope)
  cols: number;          // Panel columns (auto mode, along ridge length)
  manualPanels: ManualPanel[];
  onAddManualPanel: (panel: ManualPanel) => void;
  onRemoveManualPanel: (panelId: string) => void;
  isLandscape?: boolean;
  moduleLength?: number; // Real-world meter length (default 1.73m)
  moduleWidth?: number;  // Real-world meter width (default 1.12m)
  moduleWattage?: number;// Rated power in Watts (e.g. 430W)
  moduleLabel?: string;  // Brand & model label
}

export const House3DEngine: React.FC<House3DEngineProps> = ({
  hasRoof,
  roofStyle = 'gable',
  width = 47.6,
  depth = 6.2,
  elevation = 3.8,
  pitchDeg = 15,
  layoutMode,
  autoEnabled,
  rows = 2,
  cols = 4,
  manualPanels,
  onAddManualPanel,
  onRemoveManualPanel,
  isLandscape = false,
  moduleLength = 1.73,
  moduleWidth = 1.12,
  moduleWattage = 430,
  moduleLabel = 'REC Group Alpha Pure-R',
}) => {
  const [hoveredSide, setHoveredSide] = useState<'north' | 'south' | 'main' | null>(null);
  const [hoverCoord, setHoverCoord] = useState<{ slantY: number; x: number } | null>(null);

  // ---------------- 0. CRITICAL NON-ZERO SAFETY GUARDS (PREVENTS WHITE CANVAS BUG) ----------------
  if (
    !hasRoof ||
    width <= 0 ||
    depth <= 0 ||
    isNaN(width) ||
    isNaN(depth) ||
    !isFinite(width) ||
    !isFinite(depth)
  ) {
    return null;
  }

  // Non-zero safety clamping: minimum 0.5m dimension bounds
  const safeWidth = Math.max(0.5, Math.min(100.0, width));   // Three.js X-axis (building length along longitude)
  const safeDepth = Math.max(0.5, Math.min(100.0, depth));   // Three.js Z-axis (building depth across eaves)

  // ---------------- 1. THREE.JS 3D PROCEDURAL MESH ROUTER & TRIGONOMETRY ----------------
  const isFlat = roofStyle === 'flat';
  const isMono = roofStyle === 'mono';
  const isHip = roofStyle === 'hip';

  const effectivePitch = isFlat ? 0 : Math.max(0, Math.min(45, pitchDeg || 0));
  const pitchRad = (effectivePitch * Math.PI) / 180;
  const cosPitch = Math.cos(pitchRad);
  const safeCos = cosPitch > 0.0001 ? cosPitch : 1.0;

  const halfDepth = Math.max(0.25, safeDepth / 2);

  // Center Ridge Line UP (+) Height:
  // For Gable: ridge runs along X-axis at Z=0, rise is h = (depth / 2) * tan(theta)
  // e.g. for depth 6.2m and pitch 15°: (6.2 / 2) * tan(15°) = 0.8306m
  const roofRise = isMono
    ? safeDepth * Math.tan(pitchRad)
    : halfDepth * Math.tan(pitchRad);

  // Slant height based on roof procedural type across eaves (Z-axis span)
  const slantHeight = isMono
    ? safeDepth / safeCos
    : halfDepth / safeCos;

  // True sloped surface area calculation
  const trueSlopedArea = isMono || isFlat
    ? slantHeight * safeWidth
    : isHip
    ? 2 * (slantHeight * safeWidth) * 0.92 // 4-slope trapezoidal / triangular adjusted area
    : 2 * (slantHeight * safeWidth);

  if (slantHeight <= 0 || isNaN(slantHeight) || !isFinite(slantHeight)) {
    return null;
  }

  // Real-World 1:1 Meter Solar Module Dimensions
  const rawL = Math.max(0.2, moduleLength || 1.73);
  const rawW = Math.max(0.2, moduleWidth || 1.12);
  // In portrait: moduleL spans along slope (slantHeight), moduleW spans along building length (X-axis)
  const moduleL = isLandscape ? rawW : rawL;
  const moduleW = isLandscape ? rawL : rawW;

  // Aluminum Mounting Rail Dimensions
  const railHeight = 0.06;
  const railWidth = 0.05;

  // Compute Auto-Fill Grid along the X-axis ridge and Z slant
  const autoPanelGrid = useMemo(() => {
    if (!autoEnabled || rows <= 0 || cols <= 0) return [];

    const items: Array<{
      id: string;
      slantY: number;
      z: number; // coordinate along X-axis
      side: 'north' | 'south' | 'main';
    }> = [];

    const spacingX = Math.max(0.1, moduleW + 0.06);
    const spacingSlantY = Math.max(0.1, moduleL + 0.08);

    const startX = -((cols - 1) * spacingX) / 2;
    const startSlantY = (slantHeight - (rows * spacingSlantY)) / 2 + spacingSlantY / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const offsetX = startX + c * spacingX;
        const offsetSlantY = startSlantY + r * spacingSlantY;

        // Skip panels that exceed the physical roof boundary
        if (offsetSlantY > slantHeight - 0.05 || offsetSlantY < 0.05) continue;
        if (Math.abs(offsetX) > safeWidth / 2 - moduleW / 2) continue;

        if (isMono) {
          items.push({
            id: `auto-main-${r}-${c}`,
            slantY: offsetSlantY,
            z: offsetX,
            side: 'main',
          });
        } else {
          items.push({
            id: `auto-north-${r}-${c}`,
            slantY: offsetSlantY,
            z: offsetX,
            side: 'north',
          });

          items.push({
            id: `auto-south-${r}-${c}`,
            slantY: offsetSlantY,
            z: offsetX,
            side: 'south',
          });
        }
      }
    }
    return items;
  }, [autoEnabled, rows, cols, moduleW, moduleL, slantHeight, isMono, safeWidth]);

  // Compute rail positions under each panel row (running along X-axis)
  const railRows = useMemo(() => {
    if (rows <= 0) return [];
    const rails: Array<{ slantY: number }> = [];
    const spacingSlantY = Math.max(0.1, moduleL + 0.08);
    const startSlantY = (slantHeight - (rows * spacingSlantY)) / 2 + spacingSlantY / 2;

    for (let r = 0; r < rows; r++) {
      const rowCenter = startSlantY + r * spacingSlantY;
      rails.push({ slantY: rowCenter - moduleL * 0.25 });
      rails.push({ slantY: rowCenter + moduleL * 0.25 });
    }
    return rails;
  }, [rows, moduleL, slantHeight]);

  // Active panels list depending on layout mode
  const activePanels = layoutMode === 'auto' ? autoPanelGrid : manualPanels;

  // Handle Raycast click for Manual Placement (snaps along X-axis building length)
  const handleSlopeClick = (e: any, side: 'north' | 'south' | 'main') => {
    if (layoutMode !== 'manual') return;
    e.stopPropagation();

    const point = e.point;
    const snapGrid = 0.5;
    const rawX = Math.round(point.x / snapGrid) * snapGrid;
    const clampedX = Math.max(-safeWidth / 2 + moduleW / 2 + 0.05, Math.min(safeWidth / 2 - moduleW / 2 - 0.05, rawX));
    const defaultSlantY = Math.max(moduleL / 2 + 0.1, Math.min(slantHeight - moduleL / 2 - 0.1, slantHeight / 2));

    const newPanel: ManualPanel = {
      id: `manual-${side}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      side,
      slantY: defaultSlantY,
      z: clampedX,
    };

    onAddManualPanel(newPanel);
  };

  const handlePointerMove = (e: any, side: 'north' | 'south' | 'main') => {
    if (layoutMode !== 'manual') return;
    e.stopPropagation();
    const point = e.point;
    const snapGrid = 0.5;
    const rawX = Math.round(point.x / snapGrid) * snapGrid;
    const clampedX = Math.max(-safeWidth / 2 + moduleW / 2 + 0.05, Math.min(safeWidth / 2 - moduleW / 2 - 0.05, rawX));

    setHoveredSide(side);
    setHoverCoord({ slantY: slantHeight / 2, x: clampedX });
  };

  const handlePointerOut = () => {
    setHoveredSide(null);
    setHoverCoord(null);
  };

  // Hip roof ridge length along X-axis
  const hipRidgeLength = Math.max(0.5, safeWidth - safeDepth * 0.6);

  return (
    <group position={[0, 0, 0]}>
      {/* 
        ---------------- PROCEDURAL 3D MESH ROUTER: GABLE / FLAT / HIP / MONO ----------------
        Center Ridge Line: Runs parallel to X-Axis (length = safeWidth, e.g. 47.6m)
        Eaves Span: Slopes meet at Z = 0 (depth = safeDepth, e.g. 6.2m)
      */}

      {isMono ? (
        /* 1. MONO-SLOPE (SHED) ROOF - Single continuous slope spanning from -halfDepth to +halfDepth */
        <group position={[0, elevation, -halfDepth]} rotation={[-pitchRad, 0, 0]}>
          <mesh
            position={[0, 0.06, slantHeight / 2]}
            castShadow
            receiveShadow
            onClick={(e) => handleSlopeClick(e, 'main')}
            onPointerMove={(e) => handlePointerMove(e, 'main')}
            onPointerOut={handlePointerOut}
          >
            <boxGeometry args={[safeWidth + 0.2, 0.12, slantHeight]} />
            <meshStandardMaterial color="#475569" roughness={0.35} metalness={0.45} />
          </mesh>

          <lineSegments position={[0, 0.06, slantHeight / 2]}>
            <edgesGeometry args={[new THREE.BoxGeometry(safeWidth + 0.2, 0.12, slantHeight)]} />
            <lineBasicMaterial color="#10b981" linewidth={2} />
          </lineSegments>

          {/* Aluminum Mounting Rails running along X-axis */}
          {railRows.map((rail, idx) => (
            <mesh key={`main-rail-${idx}`} position={[0, 0.15, rail.slantY]} castShadow>
              <boxGeometry args={[safeWidth + 0.1, railHeight, railWidth]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.2} metalness={0.95} />
            </mesh>
          ))}

          {/* Solar Panels on Mono Slope */}
          {activePanels
            .filter((p) => p.side === 'main' || p.side === 'north' || p.side === 'left' || p.side === 'back')
            .map((p) => (
              <group
                key={p.id}
                position={[p.z, 0.18, p.slantY]}
                onClick={(e) => {
                  e.stopPropagation();
                  if (layoutMode === 'manual') onRemoveManualPanel(p.id);
                }}
              >
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[moduleW, 0.04, moduleL]} />
                  <meshStandardMaterial color="#090d16" roughness={0.15} metalness={0.9} />
                </mesh>
                <lineSegments>
                  <edgesGeometry args={[new THREE.BoxGeometry(moduleW, 0.04, moduleL)]} />
                  <lineBasicMaterial color="#10b981" linewidth={2} />
                </lineSegments>
                <mesh position={[0, 0.021, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[moduleW - 0.04, moduleL - 0.04]} />
                  <meshBasicMaterial color="#334155" wireframe />
                </mesh>
              </group>
            ))}

          {layoutMode === 'manual' && hoveredSide === 'main' && hoverCoord && (
            <group position={[hoverCoord.x, 0.18, hoverCoord.slantY]}>
              <mesh>
                <boxGeometry args={[moduleW, 0.04, moduleL]} />
                <meshBasicMaterial color="#10b981" transparent opacity={0.4} />
              </mesh>
            </group>
          )}
        </group>
      ) : (
        /* 2. DUAL-SLOPE GABLE, FLAT, & 4-SLOPE HIP ROOFS */
        <>
          {/* NORTH / BACK ROOF SLOPE (Facing -Z, Sloping Upward to Ridge at Z=0) */}
          <group position={[0, elevation, -halfDepth]} rotation={[-pitchRad, 0, 0]}>
            <mesh
              position={[0, 0.06, slantHeight / 2]}
              castShadow
              receiveShadow
              onClick={(e) => handleSlopeClick(e, 'north')}
              onPointerMove={(e) => handlePointerMove(e, 'north')}
              onPointerOut={handlePointerOut}
            >
              <boxGeometry args={[safeWidth + 0.2, 0.12, slantHeight]} />
              <meshStandardMaterial color="#475569" roughness={0.35} metalness={0.45} />
            </mesh>

            <lineSegments position={[0, 0.06, slantHeight / 2]}>
              <edgesGeometry args={[new THREE.BoxGeometry(safeWidth + 0.2, 0.12, slantHeight)]} />
              <lineBasicMaterial color="#10b981" linewidth={2} />
            </lineSegments>

            {/* Rails running along X-axis */}
            {railRows.map((rail, idx) => (
              <mesh key={`n-rail-${idx}`} position={[0, 0.15, rail.slantY]} castShadow>
                <boxGeometry args={[safeWidth + 0.1, railHeight, railWidth]} />
                <meshStandardMaterial color="#94a3b8" roughness={0.2} metalness={0.95} />
              </mesh>
            ))}

            {/* Solar Panels on North Slope */}
            {activePanels
              .filter((p) => p.side === 'north' || p.side === 'back' || p.side === 'left')
              .map((p) => (
                <group
                  key={p.id}
                  position={[p.z, 0.18, p.slantY]}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (layoutMode === 'manual') onRemoveManualPanel(p.id);
                  }}
                >
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[moduleW, 0.04, moduleL]} />
                    <meshStandardMaterial color="#090d16" roughness={0.15} metalness={0.9} />
                  </mesh>
                  <lineSegments>
                    <edgesGeometry args={[new THREE.BoxGeometry(moduleW, 0.04, moduleL)]} />
                    <lineBasicMaterial color="#10b981" linewidth={2} />
                  </lineSegments>
                  <mesh position={[0, 0.021, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[moduleW - 0.04, moduleL - 0.04]} />
                    <meshBasicMaterial color="#334155" wireframe />
                  </mesh>
                </group>
              ))}

            {layoutMode === 'manual' && hoveredSide === 'north' && hoverCoord && (
              <group position={[hoverCoord.x, 0.18, hoverCoord.slantY]}>
                <mesh>
                  <boxGeometry args={[moduleW, 0.04, moduleL]} />
                  <meshBasicMaterial color="#10b981" transparent opacity={0.4} />
                </mesh>
              </group>
            )}
          </group>

          {/* SOUTH / FRONT ROOF SLOPE (Facing +Z, Sloping Upward to Ridge at Z=0) */}
          <group position={[0, elevation, halfDepth]} rotation={[pitchRad, 0, 0]}>
            <mesh
              position={[0, 0.06, -slantHeight / 2]}
              castShadow
              receiveShadow
              onClick={(e) => handleSlopeClick(e, 'south')}
              onPointerMove={(e) => handlePointerMove(e, 'south')}
              onPointerOut={handlePointerOut}
            >
              <boxGeometry args={[safeWidth + 0.2, 0.12, slantHeight]} />
              <meshStandardMaterial color="#475569" roughness={0.35} metalness={0.45} />
            </mesh>

            <lineSegments position={[0, 0.06, -slantHeight / 2]}>
              <edgesGeometry args={[new THREE.BoxGeometry(safeWidth + 0.2, 0.12, slantHeight)]} />
              <lineBasicMaterial color="#10b981" linewidth={2} />
            </lineSegments>

            {/* Rails running along X-axis */}
            {railRows.map((rail, idx) => (
              <mesh key={`s-rail-${idx}`} position={[0, 0.15, -rail.slantY]} castShadow>
                <boxGeometry args={[safeWidth + 0.1, railHeight, railWidth]} />
                <meshStandardMaterial color="#94a3b8" roughness={0.2} metalness={0.95} />
              </mesh>
            ))}

            {/* Solar Panels on South Slope */}
            {activePanels
              .filter((p) => p.side === 'south' || p.side === 'front' || p.side === 'right')
              .map((p) => (
                <group
                  key={p.id}
                  position={[p.z, 0.18, -p.slantY]}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (layoutMode === 'manual') onRemoveManualPanel(p.id);
                  }}
                >
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[moduleW, 0.04, moduleL]} />
                    <meshStandardMaterial color="#090d16" roughness={0.15} metalness={0.9} />
                  </mesh>
                  <lineSegments>
                    <edgesGeometry args={[new THREE.BoxGeometry(moduleW, 0.04, moduleL)]} />
                    <lineBasicMaterial color="#10b981" linewidth={2} />
                  </lineSegments>
                  <mesh position={[0, 0.021, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[moduleW - 0.04, moduleL - 0.04]} />
                    <meshBasicMaterial color="#334155" wireframe />
                  </mesh>
                </group>
              ))}

            {layoutMode === 'manual' && hoveredSide === 'south' && hoverCoord && (
              <group position={[hoverCoord.x, 0.18, -hoverCoord.slantY]}>
                <mesh>
                  <boxGeometry args={[moduleW, 0.04, moduleL]} />
                  <meshBasicMaterial color="#10b981" transparent opacity={0.4} />
                </mesh>
              </group>
            )}
          </group>

          {/* HIP ROOF END CAPS (EAST & WEST TRIANGULAR HIP SLOPES) */}
          {isHip && !isFlat && (
            <>
              {/* East Hip End Facet */}
              <group position={[safeWidth / 2, elevation, 0]} rotation={[0, 0, -pitchRad]}>
                <mesh position={[-slantHeight / 4, 0.06, 0]} castShadow>
                  <coneGeometry args={[halfDepth * 1.1, slantHeight / 2, 4]} />
                  <meshStandardMaterial color="#334155" roughness={0.35} metalness={0.45} />
                </mesh>
              </group>

              {/* West Hip End Facet */}
              <group position={[-safeWidth / 2, elevation, 0]} rotation={[0, 0, pitchRad]}>
                <mesh position={[slantHeight / 4, 0.06, 0]} castShadow>
                  <coneGeometry args={[halfDepth * 1.1, slantHeight / 2, 4]} />
                  <meshStandardMaterial color="#334155" roughness={0.35} metalness={0.45} />
                </mesh>
              </group>
            </>
          )}

          {/* Center Ridge Peak Apex Cap (Runs parallel to X-axis along building length) */}
          {!isFlat && (
            <mesh
              position={[0, elevation + roofRise + 0.04, 0]}
              castShadow
            >
              <boxGeometry args={[isHip ? hipRidgeLength : safeWidth + 0.3, 0.08, 0.25]} />
              <meshStandardMaterial color="#047857" roughness={0.3} metalness={0.8} />
            </mesh>
          )}
        </>
      )}

      {/* Floating 3D Geometric Badge Pill */}
      <Html position={[0, elevation + roofRise + 1.1, 0]} center>
        <div className="bg-white/95 backdrop-blur-md border border-slate-100 text-slate-900 text-xs font-semibold px-4 py-2 rounded-full shadow-md pointer-events-none select-none flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-emerald-700 font-bold">
              {isFlat ? 'Flat Roof' : isHip ? `Hip Roof (${effectivePitch}°)` : isMono ? `Mono-Slope (${effectivePitch}°)` : `Gable Roof (${effectivePitch}°)`}
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-900 font-bold">Total Roof Size: {trueSlopedArea.toFixed(1)} m²</span>
          </div>
          <span className="text-slate-500 text-[10px] font-mono">
            {activePanels.length} Active {moduleWattage}W Modules ({moduleLabel})
          </span>
        </div>
      </Html>
    </group>
  );
};

export default House3DEngine;
