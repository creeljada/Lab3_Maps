// create maps
      // choropleth map
var choroplethMap = L.map('choropleth').setView([37, -111], 6);

        // proportional symbol map
var proportionalMap = L.map('proportional').setView([37, -111], 6);


// base map tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy;<a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(choroplethMap);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy;<a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(proportionalMap);

// function for choropleth colors
function getColor(density) {
    return density > 50 ? '#800026' :
           density > 40 ? '#BD0026' :
           density > 30 ? '#E31A1C' :
           density > 20 ? '#FC4E2A' :
           density > 10 ? '#FD8D3C' :
           density > 5  ? '#FEB24C' :
           density > 0  ? '#FED976' :
                          '#FFEDA0';
}

// function for proportional symbol radius
function getRadius(value) {
    value = Number(value) || 0;
    // ensure a minimum visible radius
    return Math.max(4, Math.sqrt(value) * 2);
}

// add data layers
let statesData, damsData, riverBasinsData;

Promise.all([
    fetch('BasinStates.geojson').then(response => response.json()),
    fetch('ColoradoRiverDams.geojson').then(response => response.json()),
    fetch('RiverBasins.geojson').then(response => response.json())
]).then(([states, dams, riverBasins]) => {
    // assign loaded data to outer scope variables
    BasinStates.json = states;
    ColoradoRiverDams.json = dams;
    RiverBasins.json = riverBasins;

    // add states to both maps (simple boundary with popup)
    L.geoJSON(statesData, {
        onEachFeature: function(feature, layer) {
            layer.bindPopup(feature.properties.name || feature.properties.NAME || 'State');
        },
        style: {
            fillColor: 'none',
            weight: 1,
            opacity: 0.7,
            color: '#444',
            fillOpacity: 0
        }
    }).addTo(choroplethMap);

    L.geoJSON(statesData, {
        onEachFeature: function(feature, layer) {
            layer.bindPopup(feature.properties.name || feature.properties.NAME || 'State');
        },
        style: {
            fillColor: 'none',
            weight: 1,
            opacity: 0.5,
            color: '#999',
            fillOpacity: 0
        }
    }).addTo(proportionalMap);

    // add basins to both maps
    L.geoJSON(riverBasinsData, {
        style: {
            fillColor: 'none',
            weight: 3,
            opacity: 1,
            color: '#0066cc',
            dashArray: '5, 5',
            fillOpacity: 0
        }
    }).addTo(choroplethMap);

    L.geoJSON(riverBasinsData, {
        style: {
            fillColor: 'none',
            weight: 3,
            opacity: 1,
            color: '#0066cc',
            dashArray: '5, 5',
            fillOpacity: 0
        }
    }).addTo(proportionalMap);

    // calculate dam counts per state (uses turf.booleanPointInPolygon if available)
    calculateDamDensity(statesData, damsData);
    
    // CHOROPLETH MAP - States colored by dam density
    L.geoJSON(statesData, {
        style: function(feature) {
            return {
                fillColor: getColor(feature.properties.damDensity || 0),
                weight: 2,
                opacity: 1,
                color: 'white',
                fillOpacity: 0.7
            };
        },
        onEachFeature: function(feature, layer) {
            layer.bindPopup(
                `<strong>${feature.properties.name || feature.properties.NAME || 'State'}</strong><br>` +
                `Dams: ${feature.properties.damCount || 0}<br>` +
                `Density: ${(feature.properties.damDensity || 0).toFixed(2)} per 1000 km²`
            );
        }
    }).addTo(choroplethMap);
    
    // PROPORTIONAL SYMBOL MAP - Dams as circles
    L.geoJSON(damsData, {
        pointToLayer: function(feature, latlng) {
            // Use a property like storage capacity, height, or just fixed size
            let value = feature.properties.storage || feature.properties.height || 10;
            return L.circleMarker(latlng, {
                radius: getRadius(value),
                fillColor: '#0066cc',
                color: '#000',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.6
            });
        },
        onEachFeature: function(feature, layer) {
            layer.bindPopup(
                `<strong>${feature.properties.name || 'Unnamed Dam'}</strong><br>` +
                `Storage: ${feature.properties.storage || 'N/A'}<br>` +
                `Height: ${feature.properties.height || 'N/A'}`
            );
        }
    }).addTo(proportionalMap);
    
    // Add state boundaries to proportional map (already added above, but ensure visibility)
    // (no-op duplicate safe)
    
    // Add legends
    addChoroplethLegend();
    addProportionalLegend();

}).catch(err => {
    console.error('Failed to load GeoJSON files:', err);
});

// Calculate dam density for each state
function calculateDamDensity(states, dams) {
    const hasTurf = (typeof turf !== 'undefined') && (typeof turf.booleanPointInPolygon === 'function');

    if (!hasTurf) {
        console.warn('turf.booleanPointInPolygon not available; dam spatial checks will be skipped and counts set to 0.');
        states.features.forEach(state => {
            state.properties.damCount = 0;
            state.properties.damDensity = 0;
        });
        return;
    }

    states.features.forEach(state => {
        let damCount = 0;

        dams.features.forEach(dam => {
            try {
                const damPoint = turf.point(dam.geometry.coordinates);

                // state can be Polygon or MultiPolygon; turf.booleanPointInPolygon accepts a feature or geometry
                const stateFeature = state; // GeoJSON feature

                if (turf.booleanPointInPolygon(damPoint, stateFeature)) {
                    damCount++;
                }
            } catch (e) {
                // skip this dam if any geometry error occurs
                console.warn('Error testing dam in state:', e);
            }
        });

        // Calculate density (adjust based on your area units)
        // Prefer an area property in km² if available; otherwise fallback to 1000
        let area = Number(state.properties.area) || 1000; // Use actual area if available
        state.properties.damCount = damCount;
        state.properties.damDensity = area > 0 ? (damCount / area) * 1000 : 0; // per 1000 km²
    });
}

// Add legend for choropleth map
function addChoroplethLegend() {
    let legend = L.control({position: 'bottomright'});
    
    legend.onAdd = function(map) {
        let div = L.DomUtil.create('div', 'info legend');
        let grades = [0, 5, 10, 20, 30, 40, 50];
        
        div.innerHTML = '<strong>Dam Density</strong><br>(per 1000 km²)<br>';
        
        for (let i = 0; i < grades.length; i++) {
            div.innerHTML +=
                '<i style="background:' + getColor(grades[i] + 1) + '; width: 18px; height: 18px; display: inline-block; margin-right: 5px;"></i> ' +
                grades[i] + (grades[i + 1] ? '&ndash;' + grades[i + 1] + '<br>' : '+');
        }
        
        return div;
    };
    
    legend.addTo(choroplethMap);
}

// Add legend for proportional symbol map
function addProportionalLegend() {
    let legend = L.control({position: 'bottomright'});
    
    legend.onAdd = function(map) {
        let div = L.DomUtil.create('div', 'info legend');
        let values = [10, 50, 100]; // Adjust based on your data
        
        div.innerHTML = '<strong>Dam Size</strong><br>(storage/height)<br>';
        
        values.forEach(val => {
            let radius = getRadius(val);
            div.innerHTML +=
                `<svg width="40" height="40">
                    <circle cx="20" cy="20" r="${radius}" 
                        fill="#0066cc" fill-opacity="0.6" 
                        stroke="#000" stroke-width="1"/>
                </svg> ${val}<br>`;
        });
        
        return div;
    };
    
    legend.addTo(proportionalMap);
}



