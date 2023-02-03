/*
MIT License

Copyright (c) 2019 John Wiseman

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/


"use strict";

var map;

// RegionInfo looks like this:
// {
//   "region": "3A-2",
//   "name": "North-Western Europe (2)",
//   "enabled": true
// }
//
// This is an array of RegionInfos.
let allRegionInfos;

// StationInfo looks like this:
//
// {
//   name: '146csbr',
//   lat: 37.75,
//   lon: -122.45,
//   region: "3A-2",
//   marker: <Leaflet Marker>
//   peers: <peer info>
// }
//
// This is an object whose keys are station keys, which are strings
// with the format "<region ID>:<station ID>", and whose values are
// StationInfos.
const allStationInfos = {};


// Create a unique key for a station from its region and ID.

function stationKey(regionId, stationId) {
  return `${regionId}:${stationId}`;
}


// Station markers get a different color for each region.

const regionMarkerColors = {
  "1A": "#8dd3c7",
  "1B": "#1f78b4",
  "1C": "#ff7f00",
  "2A": "#9fdc6a",
  "2B": "#33a02c",
  "2C": "#dddddd",
  "3A": "#fb9a99",
  "3B": "#33a02c",
  "3C": "#e31a1c",
  "4A": "#ff7f00",
  "4B": "#cab2d6",
  "4C": "#1f78b4",
  "5A": "#6a3d9a",
  "5B": "#1e3f5a",
  "5C": "#fdbf6f",
};

function regionMarkerColor(region) {
  const color = regionMarkerColors[region];
  return color || "#000000";
}

function toRad(x) {
  return x * Math.PI / 180;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const x1 = lat2 - lat1;
  const dLat = toRad(x1);
  const x2 = lon2 - lon1;
  const dLon = toRad(x2);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return d;
}

function stationDistanceKm(s1, s2) {
  return distanceKm(s1.lat, s1.lon, s2.lat, s2.lon);
}


// Fetches the JSON that lists all regions. The metadata is an
// object whose keys are unknown ("0", "10", "20", etc.) but whose values
// are objects with region, name, and enabled properties.
//
// Returns a promise for the JSON.

function getRegionsMetadata() {
  return new Promise((resolve, reject) => {
    $('#progressbar').progressbar({ max: 50 });
    $('#progresslabel').text('Loading regions...');
    const url = 'mirror_regions.json';
    console.log('Loading regions metadata from', url);
    $.getJSON(url, data => {
      $('#progressbar').progressbar("value", 1);
      let regionInfos = Object.values(data);
      console.log(`Got metadata for ${regionInfos.length} regions: ` +
        regionInfos.map(r => r.region).join(','));
      regionInfos = regionInfos.filter(r => r.enabled);
      console.log(`${regionInfos.length} regions are enabled: ` + regionInfos.map(r => r.region).join(','));
      // 3 units of progress for each region: stations, peers, then adding to
      // map.
      $('#progressbar').progressbar('option', 'max', regionInfos.length * 3);
      resolve(regionInfos);
    })
      .fail((jqxhr, textStatus, error) => {
        $('#progresslabel').text('Error loading region metadata').addClass('error');
      });
  });
}


// Fetches the stations and peers for a given region.
//
// Returns a promise for the data.

function getStationsForRegion(regionInfo) {
  return new Promise((resolve, reject) => {
    const stations = {};
    var dataUrl = `sync/${regionInfo.region}/sync.json`;
    console.log('Loading region data from', dataUrl);
    $.getJSON(dataUrl, data => {
      const region = regionInfo.region;
      Object.keys(data).forEach(stationId => {
        const station = data[stationId];
        station.name = stationId;
        station.region = region;
      });
      data = xformObject(
        data,
        k => stationKey(region, k),
        v => { v.peers = xformObject(v.peers, k => stationKey(region, k)); return v; });
      const stationIds = Object.keys(data);
      console.log(`Loaded ${stationIds.length} stations`);
      const pb = $('#progressbar');
      pb.progressbar('value', pb.progressbar('value') + 1);
      stationIds.forEach(stationId => {
        stations[stationId] = data[stationId];
      });

      addStationsToMap(map, stations);
      pb.progressbar('value', pb.progressbar('value') + 1);
      Object.keys(stations).forEach(stationKey => {
        allStationInfos[stationKey] = stations[stationKey];
      });
      $('#progresslabel').text(`${Object.keys(allStationInfos).length} feeders loaded.`);

      resolve(stations);
    });
  });
}


function xformObject(obj, xformKey, xformValue) {
  const identity = (x) => x;
  xformKey = xformKey || identity;
  xformValue = xformValue || identity;
  const newObj = {};
  Object.keys(obj).forEach(k => {
    newObj[xformKey(k)] = xformValue(obj[k]);
  });
  return newObj;
}


function stationSearchHandler() {
  var input, filter, ul, li, a, i, txtValue;
  input = document.getElementById('search-input');
  filter = input.value.toUpperCase();
  ul = document.getElementById('stations');
  li = ul.getElementsByTagName('li');

  // Loop through all list items, and hide those who don't match the search
  // query
  for (i = 0; i < li.length; i++) {
    txtValue = li[i].textContent || li[i].innerText;
    if (txtValue.toUpperCase().indexOf(filter) > -1) {
      li[i].style.display = '';
    } else {
      li[i].style.display = 'none';
    }
  }
}


// Creates a line between two stations.

function lineBetweenStations(s1, s2, options) {
  var s1m = s1.marker;
  var s2m = s2.marker;
  if (s1m && s2m) {
    var latlngs = [s1m.getLatLng(), s2m.getLatLng()];
    var line = L.polyline(latlngs, options).addTo(map);
    return line;
  } else {
    return null;
  }
}


// Chooses a peer line color based on sync stats.

function colorForSyncStats(stats) {
  const peer_sync_count = stats[0];
  const peer_sync_err = stats[1];
  const peer_ppm_offset = stats[2];
  const peer_score = stats[3];
  let quality = 2;
  if (peer_sync_count <= 10) {
    quality = Math.min(quality, 1);
  }
  if (peer_sync_err > 2 && peer_sync_err <= 4) {
    quality = Math.min(quality, 1);
  } else if (peer_sync_err > 4) {
    quality = Math.min(quality, 0);
  }
  const colors = ['red', 'yellow', 'green'];
  return colors[quality];
}


var peerLines = [];
var ephemeralPeerLines = [];
var mouseOveredStation = null;

// Draws lines from a station to its peers. There can be two sets of
// lines shown at a given time: ephemeral, and non-ephemeral.

function drawLinesToPeers(stationInfo, isEphemeral) {
  if (isEphemeral) {
    if (!stationInfo) {
      // Removing lines.
      mouseOveredStation = null;
    } else if (stationInfo.name === mouseOveredStation) {
      // Lines are already drawn.
      return;
    } else {
      // New lines.
      mouseOveredStation = stationInfo.name;
    }
  }

  var lines;
  if (isEphemeral) {
    lines = ephemeralPeerLines;
  } else {
    lines = peerLines;
  }
  if (lines) {
    lines.forEach(pl => map.removeLayer(pl));
    lines = [];
  }

  if (stationInfo && stationInfo.peers) {
    Object.keys(stationInfo.peers).forEach(peerId => {
      const peer = allStationInfos[peerId];
      // only draw a line if neither peer is timed out (bad timing/sync)
      if (peer
        && (peer.bad_syncs == null || peer.bad_syncs == 0)
        && (stationInfo.bad_syncs == null || stationInfo.bad_syncs == 0)) {
          var options;
          const color = colorForSyncStats(stationInfo.peers[peerId]);
          if (isEphemeral) {
            options = { color: color, opacity: 0.3 };
          } else {
            options = { color: color, opacity: 0.5 };
          }
          const line = lineBetweenStations(stationInfo, peer, options);
          if (line) {
            lines.push(line);
          }
        }
    });
    map.removeLayer(stationInfo.marker);
    stationInfo.marker.addTo(map);
  }

  if (isEphemeral) {
    ephemeralPeerLines = lines;
  } else {
    peerLines = lines;
  }
}


var selectedStationName = null;

// Selecting a station draws bold peer lines and displays station info
// in the sidebar.

function selectStation(stationInfo) {
  if (!stationInfo) {
    // Deselecting station.
    selectedStationName = null;
    $('#station-info').hide();
    drawLinesToPeers(null);
    return;
  } else if (stationInfo.name === selectedStationName) {
    // Station is already selected, so don't do anything.
    return;
  }
  selectedStationName = stationInfo.name;
  $('#si-name').text(stationInfo.name);
  const region = stationInfo.region;
  let regionInfo = region ? allRegionInfos.find(ri => ri.region === region) : null;
  if (regionInfo) {
    $('#si-region').text(`${regionInfo.name} (${region})`);
    const euc = encodeURIComponent;
    const syncUrl = new URL(`/sync/feeder.html?${euc(region)}&${euc(stationInfo.name)}`, 'https://map.adsbexchange.com/').toString();
    $('#si-sync-stats-link').attr('href', syncUrl).attr('target', '_blank');
  } else {
    $('#si-region').text('Unknown');
  }

  if (stationInfo.bad_syncs != null && stationInfo.bad_syncs > 0) {
    $('#si-num-label').text('Bad sync, check coordinates and power supply!');
    $('#si-num-peers').text('');
    $('#si-closest-peer-dist').text('-');
    $('#si-farthest-peer-dist').text('-');
  } else if (stationInfo.peers) {
    $('#si-num-label').text('# synced peers:');
    $('#si-num-peers').text(Object.keys(stationInfo.peers).length);
    const peerDistances = Object.keys(stationInfo.peers)
      .filter(p => allStationInfos[p] && allStationInfos[p].lat)
      .map(p => stationDistanceKm(stationInfo, allStationInfos[p]))
      .sort((a, b) => a - b);
    if (peerDistances.length > 0) {
      const kmToMiles = (x) => x * 0.621371;
      const closestKm = peerDistances[0];
      const farthestKm = peerDistances[peerDistances.length - 1];
      $('#si-closest-peer-dist').text(`${closestKm.toFixed(1)} km (${kmToMiles(closestKm).toFixed(1)} miles)`);
      $('#si-farthest-peer-dist').text(`${farthestKm.toFixed(1)} km (${kmToMiles(farthestKm).toFixed(1)} miles)`);
    } else {
      $('#si-closest-peer-dist').text('');
      $('#si-farthest-peer-dist').text('');
    }
  } else {
    $('#si-num-peers').text('Unknown');
  }
  $('#station-info').show();

  if (stationInfo.lat == null || stationInfo.lon == null) {
    $('#si-closest-peer-dist').text('private');
    $('#si-farthest-peer-dist').text('private');
    $('#si-peer-loc').text('private');
    return;
  } else {
    $('#si-peer-loc').text(stationInfo.lat.toFixed(2) + ', ' + stationInfo.lon.toFixed(2));
  }

  drawLinesToPeers(stationInfo);
  map.panInside(stationInfo.marker.getLatLng(), { padding: [300, 300] });
  stationInfo.marker.bindPopup(escape(stationInfo.name)).openPopup();
}


// Adds the specified stations to the map and sets up event handlers.

function addStationsToMap(map, stationInfos) {
  Object.keys(stationInfos).forEach(stationId => {
    const s = stationInfos[stationId];
    if (s.lat !== null && s.lon !== null) {
      // marker jitter is just to separate markers that would otherwise be
      // overlapping
      const jitter = () => Math.random() * 0.001 - 0.0005;
      const marker = L.circleMarker([s.lat + jitter(), s.lon + jitter()],
        {
          color: regionMarkerColor(s.region),
          radius: 8
        }).addTo(map).bindTooltip(s.name);
      s.marker = marker;
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        selectStation(s);
      });
      marker.on('mouseover', () => drawLinesToPeers(s, true));
      marker.on('mouseout', () => drawLinesToPeers(null, true));
    }
  });
}

// Loads region and station info, and manages the loading progress
// bar.

async function loadAllStations(map) {
  allRegionInfos = await getRegionsMetadata();
  const pb = $('#progressbar');

  for (const ri of allRegionInfos) {
    ri.promise = getStationsForRegion(ri);
  }
  for (const ri of allRegionInfos) {
    //$('#progresslabel').text(`Loading region ${ri.region} / ${ri.name}`);
    const stations = await ri.promise;
  }
  $('#progresslabel').text(`${Object.keys(allStationInfos).length} feeders in the network.`);
  // Remove the remnants of the progressbar (but leave the label).
  pb.removeClass();
  $('#progresslabel').removeClass();
  $('#progressbar > div').remove();
  return;
}


async function initialize() {
  // Create map.
  map = L.map('map-canvas');
  L.control.scale({ maxWidth: 100 }).addTo(map);
  var osm = L.tileLayer('https://map.adsbexchange.com/mapproxy/tiles/1.0.0/osm/osm_grid/{z}/{x}/{y}.png', {
    attribution: '&#169 <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>  contributors.',
    minZoom: 2,
    maxZoom: 17,
    opacity: 0.75,
  });
  // Add the OSM layer to the map
  map.addLayer(osm);
  map.fitWorld();
  map.on('click', () => selectStation(null));

  // Load stations.
  await loadAllStations(map);

  // Build station list.
  Object.keys(allStationInfos)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .forEach(k => {
      const station = allStationInfos[k];
      $('<li><a href="#">' + k + '</a></li>').attr('id', 'li-' + k).click(() => selectStation(station)).appendTo($('#stations'));
    });
}
