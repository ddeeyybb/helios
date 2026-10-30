# HELIOS-LOAD — Solar Installer & Site Assessment Platform

HELIOS-LOAD Site Assessment is built for **Digos City, Davao del Sur, Philippines** (`125.3572° E, 6.7497° N`). It features Google Maps JavaScript API (Satellite, Hybrid, Roadmap, Terrain) paired with interactive manual roof boundary drawing, spherical geometry calculations, solar sizing models, and Babylon.js 3D rooftop simulation without requiring paid Google Solar API subscriptions or Cloud Billing.

---

## 1. Architectural Overview

```
Google Maps JavaScript API (Hybrid / Satellite Imagery)
                           ↓
               Selected Property / Coordinate
                           ↓
               Interactive Manual Roof Drawing
                           ↓
     Roof Geometry & Spherical Area Calculation (m²)
                           ↓
        Solar Sizing & Transparent Energy Modeling
                           ↓
       Babylon.js 3D Rooftop Simulation & Array Layout
                           ↓
              Solar & Load Engineering Reports
```

---

## 2. Core Capabilities

### 2.1 Google Maps JavaScript API
- **Location**: Focused strictly on Digos City, Davao del Sur (`6.7497° N, 125.3572° E`, default zoom 17–18).
- **Map Types**: High-resolution Hybrid (default), Satellite, Roadmap, and Terrain tiles.
- **Interactive Pin Placement**: Click anywhere within Digos City to place a survey pin, automatically reverse-geocoding the address.
- **Location Search**: Search by address, barangay, landmark, or coordinates with automatic bounding restrictions to Digos City.

### 2.2 Custom Manual Roof Drawing & Sizing Engine
- **Manual Polygon Drawing**: Draw exact building roof boundaries directly on live Google satellite imagery with draggable corner vertices.
- **Spherical Roof Area**: Computes exact roof area in m² using Google Maps spherical geometry formulas based on drawn coordinates.
- **Configurable Usable Area**: Configurable usable roof percentage (default 80%, options: 70%, 75%, 80%, 85%, 90%).
- **Transparent Solar Calculations**:
  - Panel Count derived from usable roof area and module dimensions.
  - System Capacity (kWp) = Panel Count × Panel Wattage.
  - Estimated Annual Generation (kWh/yr) = System Capacity × Peak Sun Hours × 365 × Performance Ratio.

### 2.3 Babylon.js 3D Rooftop Simulation
- **Mesh Generation**: Translates manually drawn roof polygons into local 3D Cartesian coordinates with accurate pitch and azimuth.
- **Preliminary Solar Layout**: Renders individual solar panels on the 3D roof plane with racking standoff.
- **Interactive Controls**: Full 360-degree orbit, pan, and tilt controls to inspect roof planes and array placement.
- **Solar Potential Integration**: Direct hand-off to Solar Analysis, System Sizing, and Load Calculation modules.
