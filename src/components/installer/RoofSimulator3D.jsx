import React, { useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Bounds, TransformControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { MousePointer2, Move3D, Trash2, AlertTriangle } from 'lucide-react';
import {
  createProceduralTreeMesh,
  buildNeighborContextMesh,
  calculateDigosSunPosition,
  evaluatePanelObstructions,
} from '../../services/SolarShadowEngine';

function RoofScene({
  baseA,
  baseLength,
  pitchTheta,
  activeSpecs,
  placedPanels,
  setPlacedPanels,
  interactionMode,
  isNight,
  isHomeownerView,
  sunAzimuth,
  sunAltitude,
  trees = [],
  contextRoofs = [],
  hourOfDay = 11.0,
}) {
  const [hoverPos, setHoverPos] = useState(null);
  const [selectedPanelIdx, setSelectedPanelIdx] = useState(null);

  if (!baseA || !baseLength || baseA <= 0 || baseLength <= 0 || isNaN(baseA) || isNaN(baseLength)) {
    return null;
  }

  // Math for true hypotenuse length (3D plane length)
  const pitchRad = ((pitchTheta || 0) * Math.PI) / 180;
  const cosVal = Math.cos(pitchRad);
  const safeCos = cosVal > 0.0001 ? cosVal : 1.0;
  const hypotenuseLength = pitchTheta >= 90 ? baseLength : baseLength / safeCos;

  // Digos Solar Positioning
  const digosSun = useMemo(() => {
    return calculateDigosSunPosition(hourOfDay, 80, 50.0);
  }, [hourOfDay]);

  const activeSunPos = useMemo(() => {
    if (typeof sunAzimuth === 'number' && typeof sunAltitude === 'number') {
      const azRad = (sunAzimuth * Math.PI) / 180;
      const altRad = (sunAltitude * Math.PI) / 180;
      return new THREE.Vector3(
        50 * Math.cos(altRad) * Math.sin(azRad),
        Math.max(3, 50 * Math.sin(altRad)),
        -50 * Math.cos(altRad) * Math.cos(azRad)
      );
    }
    return digosSun.sunPositionVector;
  }, [sunAzimuth, sunAltitude, digosSun]);

  // Procedural 3D Tree Mesh Instances (castShadow = true)
  const treeMeshes = useMemo(() => {
    return trees.map((t) => createProceduralTreeMesh(t));
  }, [trees]);

  // Neighbor Context Roofs (Semi-transparent Grey)
  const neighborMeshes = useMemo(() => {
    return contextRoofs.map((nr) => buildNeighborContextMesh(nr, 3.5));
  }, [contextRoofs]);

  // Real-time Panel Obstruction & Canopy Intersection Checks
  const obstructionMap = useMemo(() => {
    if (!treeMeshes || treeMeshes.length === 0 || !placedPanels || placedPanels.length === 0) {
      return new Map();
    }

    const checkList = placedPanels.map((pos, idx) => {
      // Local to World projection considering roof pitch rotation
      const localVec = new THREE.Vector3(pos.x, pos.y, 0.05);
      const rotEuler = new THREE.Euler(-pitchTheta * (Math.PI / 180), 0, 0);
      const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(rotEuler);
      const worldVec = localVec.applyMatrix4(rotMatrix);

      return {
        id: `panel-${idx}`,
        worldPosition: worldVec,
        dimensions: { width: activeSpecs?.width || 1.12, length: activeSpecs?.height || 1.73 },
      };
    });

    return evaluatePanelObstructions(checkList, treeMeshes, activeSunPos);
  }, [placedPanels, treeMeshes, activeSunPos, pitchTheta, activeSpecs]);

  const handlePointerMove = (e) => {
    if (isHomeownerView) return;
    if (interactionMode !== 'SELECT_PLACE') return;
    e.stopPropagation();

    const localPoint = e.object.worldToLocal(e.point.clone());
    const snap = 0.05;
    const x = Math.round(localPoint.x / snap) * snap;
    const y = Math.round(localPoint.y / snap) * snap;

    setHoverPos({ x, y });
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (isHomeownerView) {
      setSelectedPanelIdx(null);
      return;
    }
    if (interactionMode !== 'SELECT_PLACE') return;
    if (hoverPos) {
      setPlacedPanels((prev) => [...prev, hoverPos]);
    }
  };

  const handlePointerOut = () => {
    setHoverPos(null);
  };

  return (
    <group>
      {/* Procedural Tree Meshes */}
      {treeMeshes.map((tg, idx) => (
        <primitive key={`tree-${idx}`} object={tg} />
      ))}

      {/* Neighbor Context Roofs */}
      {neighborMeshes.map((nm, idx) => (
        <primitive key={`context-${idx}`} object={nm} />
      ))}

      {/* Auto-framing bounds wraps the geometry so camera centers nicely */}
      <Bounds fit clip observe margin={1.2}>
        <group rotation={[-pitchTheta * (Math.PI / 180), 0, 0]}>
          {/* The Target Roof Plane */}
          <mesh
            onPointerMove={handlePointerMove}
            onPointerOut={handlePointerOut}
            onClick={handleClick}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
            castShadow
          >
            <planeGeometry args={[baseA, hypotenuseLength]} />
            <meshStandardMaterial color="#1e293b" side={THREE.DoubleSide} roughness={0.4} metalness={0.3} />

            {/* High Contrast Roof Perimeter Trace */}
            <lineSegments>
              <edgesGeometry args={[new THREE.PlaneGeometry(baseA, hypotenuseLength)]} />
              <lineBasicMaterial color="#38bdf8" />
            </lineSegments>

            {/* Brighter Grid overlay */}
            <Grid
              position={[0, 0, 0.01]}
              rotation={[Math.PI / 2, 0, 0]}
              args={[baseA, hypotenuseLength]}
              cellColor="#e2e8f0"
              sectionColor="#38bdf8"
              cellThickness={0.8}
              sectionSize={1.0}
              cellSize={0.25}
              fadeDistance={100}
            />

            {/* Placed Panels */}
            {placedPanels.map((pos, idx) => {
              const obs = obstructionMap.get(`panel-${idx}`);
              const isObstructed = obs?.isObstructed;

              const mesh = (
                <mesh
                  key={idx}
                  position={[pos.x, pos.y, 0.02]}
                  castShadow
                  receiveShadow
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isHomeownerView) {
                      setSelectedPanelIdx(idx);
                    } else if (interactionMode === 'SELECT_PLACE') {
                      setPlacedPanels((prev) => prev.filter((_, i) => i !== idx));
                      setHoverPos(null);
                    }
                  }}
                >
                  <planeGeometry args={[activeSpecs.width, activeSpecs.height]} />
                  <meshStandardMaterial
                    color={isObstructed ? '#ef4444' : '#020617'}
                    roughness={isObstructed ? 0.35 : 0.1}
                    metalness={isObstructed ? 0.1 : 0.8}
                    transparent={isObstructed}
                    opacity={isObstructed ? 0.85 : 1.0}
                  />
                  {/* Outline */}
                  <lineSegments>
                    <edgesGeometry args={[new THREE.PlaneGeometry(activeSpecs.width, activeSpecs.height)]} />
                    <lineBasicMaterial
                      color={
                        isObstructed
                          ? '#f43f5e'
                          : isHomeownerView && selectedPanelIdx === idx
                          ? '#f59e0b'
                          : '#38bdf8'
                      }
                      linewidth={2}
                    />
                  </lineSegments>

                  {isObstructed && (
                    <Html position={[0, 0, 0.08]} center distanceFactor={14}>
                      <div className="bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg border border-rose-300 select-none whitespace-nowrap animate-pulse">
                        ⚠️ SHADED
                      </div>
                    </Html>
                  )}
                </mesh>
              );

              if (isHomeownerView && selectedPanelIdx === idx) {
                return (
                  <TransformControls
                    key={`tc-${idx}`}
                    mode="translate"
                    showZ={false}
                    space="local"
                    onDraggingChanged={(e) => {
                      if (!e.value && e.target && e.target.object) {
                        const newX = e.target.object.position.x;
                        const newY = e.target.object.position.y;
                        setPlacedPanels((prev) => {
                          const next = [...prev];
                          next[idx] = { x: newX, y: newY };
                          return next;
                        });
                      }
                    }}
                  >
                    {mesh}
                  </TransformControls>
                );
              }
              return mesh;
            })}

            {/* Hover Footprint Highlight */}
            {!isHomeownerView && interactionMode === 'SELECT_PLACE' && hoverPos && (
              <mesh position={[hoverPos.x, hoverPos.y, 0.03]} pointerEvents="none">
                <planeGeometry args={[activeSpecs.width, activeSpecs.height]} />
                <meshBasicMaterial color="#38bdf8" transparent opacity={0.4} />
              </mesh>
            )}
          </mesh>
        </group>
      </Bounds>

      {/* Lighting - Digos Sun simulation + ambient fill */}
      <ambientLight intensity={isNight ? 0.3 : 1.1} color="#e2e8f0" />
      {!isNight ? (
        <directionalLight
          position={activeSunPos}
          intensity={1.8}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.0001}
          shadow-camera-near={0.5}
          shadow-camera-far={120}
          shadow-camera-left={-25}
          shadow-camera-right={25}
          shadow-camera-top={25}
          shadow-camera-bottom={-25}
          color="#f8fafc"
        />
      ) : (
        <directionalLight position={[5, 10, -5]} intensity={0.5} color="#475569" />
      )}
    </group>
  );
}

export default function RoofSimulator3D({
  baseA,
  baseLength,
  pitchTheta,
  activeSpecs,
  placedPanels,
  setPlacedPanels,
  isNight,
  interactionMode,
  isHomeownerView,
  sunAzimuth,
  sunAltitude,
  trees = [],
  contextRoofs = [],
  hourOfDay = 11.0,
}) {
  return (
    <div className="w-full h-full relative bg-[#09090b]">
      <Canvas shadows camera={{ position: [0, 15, 20], fov: 45 }} className="w-full h-full cursor-crosshair">
        <RoofScene
          baseA={baseA}
          baseLength={baseLength}
          pitchTheta={pitchTheta}
          activeSpecs={activeSpecs}
          placedPanels={placedPanels}
          setPlacedPanels={setPlacedPanels}
          interactionMode={isHomeownerView ? 'ORBIT_VIEW' : interactionMode}
          isNight={isNight}
          isHomeownerView={isHomeownerView}
          sunAzimuth={sunAzimuth}
          sunAltitude={sunAltitude}
          trees={trees}
          contextRoofs={contextRoofs}
          hourOfDay={hourOfDay}
        />

        <OrbitControls
          makeDefault
          mouseButtons={{
            LEFT: interactionMode === 'ORBIT_VIEW' ? THREE.MOUSE.ROTATE : null,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={2}
          maxDistance={100}
        />
      </Canvas>
    </div>
  );
}
