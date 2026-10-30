<script setup lang="ts">
import { ref } from 'vue'

useHead({
  title: 'Installer Engineering Help Guide | HELIOS-LOAD'
})

const activeSection = ref('getting-started')

const sections = [
  { id: 'clients-projects', title: '1. Clients & Projects Workflow' },
  { id: 'property-selection', title: '2. Property Selection & Google Maps' },
  { id: 'roof-assessment', title: '3. Manual Roof Drawing & Solar Sizing' },
  { id: 'roof-verification', title: '4. Roof Verification & Field Corrections' },
  { id: 'geometry-obstacles', title: '5. Roof Geometry & Obstacle Mapping' },
  { id: '3d-roof-babylon', title: '6. Babylon.js Roof-Only 3D Reconstruction' },
  { id: 'panel-layout', title: '7. Solar Panel Placement & In-Plane Layout' },
  { id: 'solar-analysis', title: '8. Solar Yield & Shading Analysis (ECharts)' },
  { id: 'load-analysis', title: '9. Monthly & Diurnal Load Profiling' },
  { id: 'equipment-sizing', title: '10. Equipment Catalog & System Sizing' },
  { id: 'feasibility', title: '11. Engineering Feasibility & Compatibility' },
  { id: 'reports', title: '12. Engineering Reports & Data Provenance' },
  { id: 'accuracy-limitations', title: '13. Accuracy Limitations & Legal Notice' }
]
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Installer Engineering Field Manual</h1>
          <span class="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
            HELIOS-LOAD Documentation
          </span>
        </div>
        <p class="text-sm text-slate-500 mt-1">
          Operational instructions and engineering procedures for rooftop solar site assessment, 3D modeling, and system design.
        </p>
      </div>

      <NuxtLink
        to="/site-assessment"
        class="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm self-start"
      >
        Open Site Assessment →
      </NuxtLink>
    </div>

    <!-- Navigation & Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- Table of Contents Sidebar -->
      <div class="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-1 sticky top-6">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-3 py-2">Guide Topics</h3>
        <button
          v-for="sec in sections"
          :key="sec.id"
          type="button"
          @click="activeSection = sec.id"
          :class="[
            'w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between',
            activeSection === sec.id
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
          ]"
        >
          <span>{{ sec.title }}</span>
          <span v-if="activeSection === sec.id" class="text-white text-xs">→</span>
        </button>
      </div>

      <!-- Main Topic Content -->
      <div class="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-8 text-slate-800 text-sm leading-relaxed">
        <!-- 1. Clients & Projects -->
        <section v-if="activeSection === 'clients-projects'" class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-xs rounded">Section 1</span>
            <h2 class="text-xl font-bold text-slate-900">How to Create Clients & Manage Projects</h2>
          </div>
          <p>
            HELIOS-LOAD is an installer-only platform designed for managing commercial and residential solar projects with complete data persistence.
          </p>
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <h4 class="font-bold text-xs text-slate-900 uppercase">Workflow Steps:</h4>
            <ol class="list-decimal list-inside text-xs space-y-1.5 text-slate-600">
              <li>Navigate to <strong>Clients</strong> in the sidebar. Click <strong>+ New Client</strong> to enter customer legal name, sector (Residential, Commercial, Industrial), address, and direct phone/email.</li>
              <li>Navigate to <strong>Projects</strong>. Click <strong>+ Create Project</strong>, assign the client, and name the proposed solar installation.</li>
              <li>Selecting any project marks it as the <strong>Active Project</strong> across the top banner and throughout all 10 stages of the workflow stepper.</li>
            </ol>
          </div>
        </section>

        <!-- 2. Property Selection -->
        <section v-if="activeSection === 'property-selection'" class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-xs rounded">Section 2</span>
            <h2 class="text-xl font-bold text-slate-900">Property Selection & Google Maps Navigation</h2>
          </div>
          <p>
            The Site Assessment interface features a real Google Maps satellite workspace powered by the Google Maps JavaScript API (loaded dynamically with SSR safety).
          </p>
          <ul class="list-disc list-inside text-xs space-y-2 text-slate-600">
            <li><strong>Map Views:</strong> Switch seamlessly between <em>Hybrid</em> (satellite + street overlays), pure <em>Satellite</em>, <em>Roadmap</em>, and <em>Terrain</em>.</li>
            <li><strong>Pin Placement:</strong> Click on any building rooftop in the satellite view. The system performs reverse geocoding via Google Geocoding API and locks the WGS-84 coordinates.</li>
            <li><strong>Property Search:</strong> Use the search bar to query addresses, business landmarks, or precise GPS coordinates (e.g., <code>6.7497, 125.3572</code>).</li>
          </ul>
        </section>

        <!-- 3. Manual Roof Drawing & Solar Sizing -->
        <section v-if="activeSection === 'roof-assessment'" class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-xs rounded">Section 3</span>
            <h2 class="text-xl font-bold text-slate-900">Manual Roof Drawing & Solar Sizing Engine</h2>
          </div>
          <p>
            When you click <strong>DRAW ROOF</strong>, the application enters interactive polygon drawing mode directly on high-resolution Google Satellite imagery without requiring paid Google Solar API subscriptions or Cloud Billing.
          </p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <span class="font-bold text-blue-900 block mb-1">Spherical Roof Area Calculation</span>
              <p class="text-blue-700">Calculates precise gross and usable roof area in m² using Google Maps spherical geometry formulas based directly on installer-placed perimeter vertices.</p>
            </div>
            <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span class="font-bold text-emerald-900 block mb-1">Transparent Solar Yield Modeling</span>
              <p class="text-emerald-700">Derives system capacity (kWp) and annual generation (kWh/yr) using transparent regional insolation: Capacity × PSH × 365 × Performance Ratio.</p>
            </div>
          </div>
          <p class="text-xs text-slate-500 italic">
            Note: All calculations are derived dynamically from installer measurements and local Digos City insolation parameters.
          </p>
        </section>

        <!-- 4. Roof Verification -->
        <section v-if="activeSection === 'roof-verification'" class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-xs rounded">Section 4</span>
            <h2 class="text-xl font-bold text-slate-900">Roof Verification & Field Corrections</h2>
          </div>
          <p>
            Automated satellite estimates must always be verified by an installer before structural procurement.
          </p>
          <div class="space-y-2 text-xs">
            <p><strong>Separation of Google vs. Verified Values:</strong></p>
            <p>The system stores both <code>googleValue</code> and <code>verifiedValue</code> independently. Overriding pitch, area, or roof type never erases Google's raw telemetry. Every value displays a provenance badge:</p>
            <div class="flex items-center gap-2 flex-wrap pt-1">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">GOOGLE ESTIMATE</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">INSTALLER VERIFIED</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-50 text-cyan-800 border border-cyan-200">CALCULATED</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">USER ENTERED</span>
            </div>
          </div>
        </section>

        <!-- 5. Geometry & Obstacles -->
        <section v-if="activeSection === 'geometry-obstacles'" class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-xs rounded">Section 5</span>
            <h2 class="text-xl font-bold text-slate-900">Roof Geometry Editor & Obstacle Mapping</h2>
          </div>
          <p>
            Installers can add obstacles and no-panel setback buffers:
          </p>
          <ul class="list-disc list-inside text-xs space-y-1.5 text-slate-600">
            <li><strong>Obstacle Types:</strong> Chimneys, HVAC units, plumbing vents, skylights, water tanks, antennas, and tree shading envelopes.</li>
            <li><strong>Safety Setbacks:</strong> Configurable boundary offsets (e.g. 0.5m ridge setback, 0.45m eave setback, 0.3m obstacle buffer).</li>
            <li><strong>Usable vs. Gross Area:</strong> Usable solar area is mathematically calculated by subtracting setbacks and obstacle exclusion zones from gross roof plane area.</li>
          </ul>
        </section>

        <!-- 6. 3D Roof Babylon -->
        <section v-if="activeSection === '3d-roof-babylon'" class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-xs rounded">Section 6</span>
            <h2 class="text-xl font-bold text-slate-900">Babylon.js Roof-Only 3D Reconstruction</h2>
          </div>
          <p>
            HELIOS-LOAD avoids heavy, slow full-house CAD models. Instead, it reconstructs an engineering-accurate <strong>ROOF-ONLY 3D model</strong> using Babylon.js:
          </p>
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2 text-slate-600">
            <p><strong>Viewport Controls:</strong> Left-click drag to rotate azimuth/elevation. Right-click drag to pan. Scroll wheel to zoom.</p>
            <p><strong>Orientation Presets:</strong> Click Top, North, South, East, West, or Perspective camera buttons for standardized inspection angles.</p>
            <p><strong>Visual Layers:</strong> Toggle Roof Planes, Ridge Line, Obstacle Boxes, and PV Panels in real-time.</p>
          </div>
        </section>

        <!-- 7. Panel Layout -->
        <section v-if="activeSection === 'panel-layout'" class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-xs rounded">Section 7</span>
            <h2 class="text-xl font-bold text-slate-900">Solar Panel Placement & In-Plane Layout</h2>
          </div>
          <p>
            Layout modules automatically or manually based on plane pitch, azimuth, setbacks, and selected PV module dimensions (e.g., 2.1m × 1.05m).
          </p>
          <p class="text-xs text-slate-600">
            Panels will never be placed outside roof boundaries or intersecting obstacle exclusion zones. Google suggested panel layouts from Building Insights can be inspected and accepted or customized.
          </p>
        </section>

        <!-- 8. Solar Analysis -->
        <section v-if="activeSection === 'solar-analysis'" class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-xs rounded">Section 8</span>
            <h2 class="text-xl font-bold text-slate-900">Solar Yield & Shading Analysis (Apache ECharts)</h2>
          </div>
          <p>
            Interactive Apache ECharts visualize monthly generation curves and multi-segment insolation comparisons.
          </p>
          <p class="text-xs text-slate-600">
            If Google Solar provides annual flux or hourly shade layers, diurnal shade animations allow previewing shadow movement across morning, midday, afternoon, and evening.
          </p>
        </section>

        <!-- 9. Load Analysis -->
        <section v-if="activeSection === 'load-analysis'" class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-xs rounded">Section 9</span>
            <h2 class="text-xl font-bold text-slate-900">Monthly & Diurnal Load Profiling</h2>
          </div>
          <p>
            Enter 12-month utility consumption (kWh) or electricity bills ($ / ₱).
          </p>
          <p class="text-xs text-slate-600">
            The platform models 24-hour facility diurnal load shapes (commercial daytime peak or residential dual-peak) and overlays the solar generation bell curve to calculate exact self-consumption %, solar offset %, and grid export.
          </p>
        </section>

        <!-- 10. Equipment Sizing -->
        <section v-if="activeSection === 'equipment-sizing'" class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-xs rounded">Section 10</span>
            <h2 class="text-xl font-bold text-slate-900">Equipment Catalog & System Sizing</h2>
          </div>
          <p>
            Includes a comprehensive database of Tier-1 PV modules (Canadian Solar, LONGi, Jinko), Inverters (SolarEdge, SMA, Huawei, Fronius), and Battery Storage (Tesla Powerwall 2, BYD Battery-Box, Enphase IQ Battery).
          </p>
          <p class="text-xs text-slate-600">
            The system sizing engine validates the DC/AC ratio (recommending 1.15 to 1.30) and calculates required battery kWh based on critical load and desired backup hours.
          </p>
        </section>

        <!-- 11. Feasibility -->
        <section v-if="activeSection === 'feasibility'" class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-xs rounded">Section 11</span>
            <h2 class="text-xl font-bold text-slate-900">Engineering Feasibility & Compatibility</h2>
          </div>
          <p>
            Automated feasibility matrix evaluating 6 core engineering criteria:
          </p>
          <ol class="list-decimal list-inside text-xs space-y-1.5 text-slate-600">
            <li><strong>Roof Structure & Pitch:</strong> Verifies pitch is within structural envelope (4° to 45°).</li>
            <li><strong>Solar Resource Window:</strong> Validates annual sunshine hours or peak sun hours.</li>
            <li><strong>Inverter DC/AC Ratio:</strong> Checks inverter power limit and string compatibility.</li>
            <li><strong>Load Offset Matching:</strong> Ensures system is not over-producing beyond interconnection limits.</li>
            <li><strong>Energy Storage Sizing:</strong> Verifies battery autonomy and depth of discharge.</li>
            <li><strong>Installer Sign-off:</strong> Formal certification requiring installer name and license verification.</li>
          </ol>
        </section>

        <!-- 12. Reports -->
        <section v-if="activeSection === 'reports'" class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-xs rounded">Section 12</span>
            <h2 class="text-xl font-bold text-slate-900">Installer Engineering Submittal Reports</h2>
          </div>
          <p>
            Generates a printable, standardized engineering submittal report with 7 structured sections:
          </p>
          <p class="text-xs text-slate-600">
            Includes Project Information, Client Metadata, Rooftop Geometry & Obstacles, Solar Production Estimates, Electrical System Sizing, Feasibility Checklist, and formal installer sign-off signatures.
          </p>
        </section>

        <!-- 13. Accuracy Limitations -->
        <section v-if="activeSection === 'accuracy-limitations'" class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-rose-100 text-rose-800 font-bold text-xs rounded">Section 13</span>
            <h2 class="text-xl font-bold text-slate-900">Accuracy Limitations & Engineering Notice</h2>
          </div>
          <div class="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2 text-amber-900">
            <p class="font-bold">MANDATORY NOTICE:</p>
            <p class="leading-relaxed">
              "Automated rooftop measurements are estimates derived from available geospatial and solar datasets and must be verified by the installer before engineering, procurement, or construction."
            </p>
          </div>
          <p class="text-xs text-slate-600 leading-relaxed">
            Satellite imagery resolution, vegetation encroachment, and seasonal sun angles can introduce variances in estimated roof pitch, area, and azimuth. Never use remote satellite measurements as an unverified structural survey.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
