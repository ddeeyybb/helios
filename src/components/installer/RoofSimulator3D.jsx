import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Bounds, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { MousePointer2, Move3D, Trash2 } from 'lucide-react';

function RoofScene({ baseA, baseLength, pitchTheta, activeSpecs, placedPanels, setPlacedPanels, interactionMode, isNight, isHomeownerView, sunAzimuth, sunAltitude }) {
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

    const handlePointerMove = (e) => {
        if (isHomeownerView) return;
        if (interactionMode !== 'SELECT_PLACE') return;
        e.stopPropagation();

        // Convert world hit point to local coordinate system of the roof plane
        const localPoint = e.object.worldToLocal(e.point.clone());

        // Snap to grid (0.05m increments for smooth snapping)
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
            setPlacedPanels(prev => [...prev, hoverPos]);
        }
    };

    // To prevent hover showing when pointer leaves roof
    const handlePointerOut = () => {
        setHoverPos(null);
    };

    // A group rotated to simulate the roof pitch
    return (
        <group>
            {/* Auto-framing bounds wraps the geometry so the camera centers nicely */}
            <Bounds fit clip observe margin={1.2}>
                <group rotation={[-pitchTheta * (Math.PI / 180), 0, 0]}>

                    {/* The Roof Plane (Rotated to lie horizontally before pitch applies) */}
                    <mesh
                        onPointerMove={handlePointerMove}
                        onPointerOut={handlePointerOut}
                        onClick={handleClick}
                        rotation={[-Math.PI / 2, 0, 0]}
                    >
                        <planeGeometry args={[baseA, hypotenuseLength]} />
                        <meshStandardMaterial color="#1e293b" side={THREE.DoubleSide} />

                        {/* High Contrast Roof Perimeter Trace */}
                        <lineSegments>
                            <edgesGeometry args={[new THREE.PlaneGeometry(baseA, hypotenuseLength)]} />
                            <lineBasicMaterial color="#38bdf8" />
                        </lineSegments>

                        {/* Brighter Grid overlay */}
                        <Grid
                            position={[0, 0, 0.01]} // slightly above the plane in local Z
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
                            const mesh = (
                                <mesh key={idx} position={[pos.x, pos.y, 0.02]} onClick={(e) => {
                                    e.stopPropagation();
                                    if (isHomeownerView) {
                                        setSelectedPanelIdx(idx);
                                    } else if (interactionMode === 'SELECT_PLACE') {
                                        // Remove panel on click
                                        setPlacedPanels(prev => prev.filter((_, i) => i !== idx));
                                        setHoverPos(null);
                                    }
                                }}>
                                    <planeGeometry args={[activeSpecs.width, activeSpecs.height]} />
                                    <meshStandardMaterial color="#020617" roughness={0.1} metalness={0.8} />
                                    {/* Bright cyan outline */}
                                    <lineSegments>
                                        <edgesGeometry args={[new THREE.PlaneGeometry(activeSpecs.width, activeSpecs.height)]} />
                                        <lineBasicMaterial color={(isHomeownerView && selectedPanelIdx === idx) ? "#f59e0b" : "#38bdf8"} linewidth={2} />
                                    </lineSegments>
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
                                                setPlacedPanels(prev => {
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

            {/* Lighting - Natural Sun simulation + ambient fill */}
            <ambientLight intensity={isNight ? 0.3 : 1.2} color="#e2e8f0" />
            {!isNight ? (
                <directionalLight
                    position={
                        typeof sunAzimuth === 'number' && typeof sunAltitude === 'number'
                            ? [Math.sin(sunAzimuth) * 50, Math.max(5, Math.sin(sunAltitude) * 50), Math.cos(sunAzimuth) * 50]
                            : [10, 20, 15]
                    }
                    intensity={1.5}
                    castShadow
                    color="#f8fafc"
                />
            ) : (
                <directionalLight
                    position={[5, 10, -5]}
                    intensity={0.5}
                    color="#475569"
                />
            )}
        </group>
    );
}

export default function RoofSimulator3D({ baseA, baseLength, pitchTheta, activeSpecs, placedPanels, setPlacedPanels, isNight, interactionMode, isHomeownerView, sunAzimuth, sunAltitude }) {
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
                />

                {/* 
                    Mouse button configuration dynamically driven by mode:
                    If SELECT_PLACE, disable LEFT click dragging so user clicks map.
                    Middle=DOLLY, Right=PAN, Left=ROTATE
                */}
                <OrbitControls
                    makeDefault
                    mouseButtons={{
                        LEFT: interactionMode === 'ORBIT_VIEW' ? THREE.MOUSE.ROTATE : null,
                        MIDDLE: THREE.MOUSE.DOLLY,
                        RIGHT: THREE.MOUSE.PAN
                    }}
                    maxPolarAngle={Math.PI / 2 - 0.05} // Prevent camera from going under the ground entirely
                    minDistance={2}
                    maxDistance={100}
                />
            </Canvas>
        </div>
    );
}
