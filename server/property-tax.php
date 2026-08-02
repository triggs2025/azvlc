<?php
require_once __DIR__ . '/config.php';

header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $body['action'] ?? '';

function githubRequest($method, $path, $payload = null) {
    $ch = curl_init('https://api.github.com/repos/' . GH_OWNER . '/' . GH_REPO . $path);
    $headers = [
        'Authorization: token ' . GH_TOKEN,
        'User-Agent: azvlc-property-tax',
        'Accept: application/vnd.github+json',
        'Content-Type: application/json',
    ];
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 12]);
    if ($method !== 'GET') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    }
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$status, json_decode($raw, true) ?: []];
}

function incrementCalculatorCounter() {
    // This dedicated file is intentionally separate from analytics.json and all other site counters.
    for ($attempt = 0; $attempt < 3; $attempt++) {
        [$readStatus, $file] = githubRequest('GET', '/contents/data/property-tax-counter.json?ref=' . rawurlencode(GH_BRANCH) . '&t=' . time());
        if ($readStatus !== 200 || empty($file['content']) || empty($file['sha'])) return false;
        $counter = json_decode(base64_decode(str_replace("\n", '', $file['content'])), true) ?: [];
        $counter['calculatorSubmissions'] = max(0, (int)($counter['calculatorSubmissions'] ?? 0)) + 1;
        $counter['updatedAt'] = gmdate('c');
        [$writeStatus] = githubRequest('PUT', '/contents/data/property-tax-counter.json', [
            'message' => 'Increment anonymous property tax calculator counter',
            'content' => base64_encode(json_encode($counter, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n"),
            'sha' => $file['sha'],
            'branch' => GH_BRANCH,
        ]);
        if ($writeStatus === 200) return true;
        if ($writeStatus !== 409) return false;
        usleep(150000);
    }
    return false;
}

function lookupArizonaAddress($address) {
    $url = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?' . http_build_query([
        'address' => $address,
        'benchmark' => 'Public_AR_Current',
        'vintage' => 'Current_Current',
        'format' => 'json',
    ]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_USERAGENT => 'AZVLC property tax calculator (azvlc.org)',
    ]);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($status !== 200 || !$raw) return null;
    $data = json_decode($raw, true);
    $matches = $data['result']['addressMatches'] ?? [];
    if (!$matches) return null;
    $match = $matches[0];
    $counties = $match['geographies']['Counties'] ?? [];
    $county = $counties[0]['NAME'] ?? '';
    if (!$county || stripos($match['matchedAddress'] ?? '', ', AZ,') === false) return null;
    $lon = $match['coordinates']['x'] ?? null;
    $lat = $match['coordinates']['y'] ?? null;
    $result = ['matchedAddress' => $match['matchedAddress'], 'county' => $county];
    if ($lon && $lat) {
        $parcel = lookupCountyParcel($county, $lon, $lat);
        if ($parcel) {
            $result['apn']        = $parcel['apn'] ?? null;
            $result['parcelUrl']  = $parcel['parcelUrl'] ?? null;
            $result['assessorUrl']= $parcel['assessorUrl'] ?? null;
        }
    }
    return $result;
}

// ── County parcel lookup registry ──
function lookupCountyParcel($county, $lon, $lat) {
    $counties = [
        'Maricopa County' => [
            'endpoint'  => 'https://gis.maricopa.gov/arcgis/rest/services/IndividualService/Parcel/MapServer/1',
            'geocoder'  => 'https://gis.maricopa.gov/arcgis/rest/services/Geocode/MaricopaCountyGeocodeService/GeocodeServer/findAddressCandidates',
            'field'     => 'APN',
            'clean'     => 'digits',
            'parcelUrl' => 'https://treasurer.maricopa.gov/PropertyTaxInformation/?Parcel={APN}',
            'assessorUrl' => 'https://mcassessor.maricopa.gov/mcs.php?q={APN}',
        ],
        'Pima County' => [
            'endpoint' => 'https://gisdata.pima.gov/arcgis1/rest/services/GISOpenData/LandRecords/MapServer/17',
            'field'    => 'PARCELID',
            'clean'    => 'none',
            'parcelUrl'=> null,
            'assessorUrl' => 'https://www.asr.pima.gov/Parcel/Info/{APN}',
        ],
        'Pinal County' => [
            'endpoint' => 'https://gis.pinal.gov/mapping/rest/services/Parcels/MapServer/0',
            'field'    => 'APN',
            'clean'    => 'none',
            'parcelUrl'=> null,
            'assessorUrl' => 'https://www.pinalcountyaz.gov/Assessor/Pages/ParcelSearch.aspx',
        ],
        'Yavapai County' => [
            'endpoint' => 'https://gis.yavapaiaz.gov/arcgis/rest/services/Parcels/FeatureServer/0',
            'field'    => 'APN',
            'clean'    => 'none',
            'parcelUrl'=> null,
            'assessorUrl' => 'https://gis.yavapaiaz.gov/v4/search.aspx',
        ],
        'Mohave County' => [
            'endpoint' => 'https://mcgis2.mohavecounty.us/arcgis/rest/services/PARCELS/MapServer/0',
            'field'    => 'APN',
            'clean'    => 'none',
            'parcelUrl'=> null,
            'assessorUrl' => 'https://www.mohave.gov/departments/assessor/assessor-search/',
        ],
        'Coconino County' => [
            'endpoint' => 'https://webmaps.coconino.az.gov/arcgis/rest/services/ParcelOwnerInfo/FeatureServer/0',
            'field'    => 'APN',
            'clean'    => 'none',
            'parcelUrl'=> null,
            'assessorUrl' => 'https://maps.coconino.az.gov/Html5Viewer/index.html?viewer=CoconinoParcels',
        ],
        'Cochise County' => [
            'endpoint' => 'https://services6.arcgis.com/Yxem0VOcqSy8T6TE/ArcGIS/rest/services/Cad_Parcel_TaxInfo/FeatureServer/0',
            'field'    => 'APN',
            'clean'    => 'none',
            'parcelUrl'=> null,
            'assessorUrl' => 'https://asr.cochise.gov/',
        ],
        'Yuma County' => [
            'endpoint' => 'https://arcgis.yumacountyaz.gov/webgis/rest/services/YC_Parcels/MapServer/0',
            'field'    => 'APN',
            'clean'    => 'none',
            'parcelUrl'=> null,
            'assessorUrl' => 'https://yumacountyaz-assessor.tylerhost.net/assessor/web/',
        ],
        'Santa Cruz County' => [
            'endpoint' => 'https://mapservices.santacruzcountyaz.gov/wagis01/rest/services/ParcelSearch/Parcels/MapServer/0',
            'field'    => 'APN',
            'clean'    => 'none',
            'parcelUrl'=> 'https://parcelsearch.santacruzcountyaz.gov/santacruzwebpay/ParcelReport?taxid={APN}',
            'assessorUrl' => null,
        ],
        'Gila County' => [
            'endpoint' => 'https://gis.gilacountyaz.gov/arcgis/rest/services/ParcelService/ParcelViewerParcelLayer/MapServer/0',
            'field'    => 'APN',
            'clean'    => 'none',
            'parcelUrl'=> null,
            'assessorUrl' => 'https://assessor.gilacountyaz.gov/assessor/web/',
        ],
    ];

    if (!isset($counties[$county])) return null;
    $cfg = $counties[$county];

    // Maricopa: use county geocoder for address-point coords, then exact point query
    if ($county === 'Maricopa County' && !empty($cfg['geocoder'])) {
        $apn = maricopaGeocodeAndLookup($cfg, $lon, $lat);
    } else {
        $apn = arcgisPointQuery($cfg['endpoint'], $lon, $lat, $cfg['field']);
    }
    if (!$apn) return null;
    if ($cfg['clean'] === 'digits') $apn = preg_replace('/[^0-9]/', '', $apn);

    $parcelUrl  = $cfg['parcelUrl']   ? str_replace('{APN}', urlencode($apn), $cfg['parcelUrl'])   : null;
    $assessorUrl= $cfg['assessorUrl'] ? str_replace('{APN}', urlencode($apn), $cfg['assessorUrl']) : null;
    return ['apn' => $apn, 'parcelUrl' => $parcelUrl, 'assessorUrl' => $assessorUrl];
}

function wgs84ToWebMercator($lon, $lat) {
    $x = $lon * 20037508.34 / 180.0;
    $y = log(tan((90.0 + $lat) * M_PI / 360.0)) / (M_PI / 180.0) * 20037508.34 / 180.0;
    return [$x, $y];
}

function maricopaGeocodeAndLookup($cfg, $lon, $lat) {
    // Convert WGS84 to Web Mercator for Maricopa's native geocoder SR.
    // Census geocoder places coords on the street centerline; reverseGeocode
    // snaps back to the actual address point inside the parcel polygon.
    [$mx, $my] = wgs84ToWebMercator($lon, $lat);
    $base = str_replace('findAddressCandidates', 'reverseGeocode', $cfg['geocoder']);
    $geocodeUrl = $base . '?' . http_build_query([
        'location' => $mx . ',' . $my,
        'distance' => 50,
        'outSR'    => 102100,
        'f'        => 'json',
    ]);
    $ch = curl_init($geocodeUrl);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
        CURLOPT_USERAGENT => 'AZVLC property tax calculator (azvlc.org)']);
    $raw = curl_exec($ch); curl_close($ch);
    $data = json_decode($raw, true);
    $x = $data['location']['x'] ?? null;
    $y = $data['location']['y'] ?? null;
    if (!$x || !$y) return null;

    // Exact point query in native SR
    $url = rtrim($cfg['endpoint'], '/') . '/query?' . http_build_query([
        'geometry'       => $x . ',' . $y,
        'geometryType'   => 'esriGeometryPoint',
        'inSR'           => '102100',
        'spatialRel'     => 'esriSpatialRelWithin',
        'outFields'      => $cfg['field'],
        'returnGeometry' => 'false',
        'f'              => 'json',
    ]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
        CURLOPT_USERAGENT => 'AZVLC property tax calculator (azvlc.org)']);
    $raw = curl_exec($ch); curl_close($ch);
    $data = json_decode($raw, true);
    $features = $data['features'] ?? [];
    return $features ? ($features[0]['attributes'][$cfg['field']] ?? null) : null;
}

function arcgisPointQuery($endpoint, $lon, $lat, $field) {
    // Use a tiny envelope (~15m buffer) — point queries fail on some polygon layers
    $d = 0.00015;
    $url = rtrim($endpoint, '/') . '/query?' . http_build_query([
        'geometry'       => ($lon-$d) . ',' . ($lat-$d) . ',' . ($lon+$d) . ',' . ($lat+$d),
        'geometryType'   => 'esriGeometryEnvelope',
        'inSR'           => '4326',
        'spatialRel'     => 'esriSpatialRelIntersects',
        'outFields'      => $field,
        'returnGeometry' => 'false',
        'f'              => 'json',
    ]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_USERAGENT      => 'AZVLC property tax calculator (azvlc.org)',
    ]);
    $raw = curl_exec($ch);
    curl_close($ch);
    if (!$raw) return null;
    $data = json_decode($raw, true);
    $features = $data['features'] ?? [];
    if (!$features) return null;
    return $features[0]['attributes'][$field] ?? null;
}

if ($action === 'count') {
    $ok = incrementCalculatorCounter();
    echo json_encode(['success' => $ok]);
    exit;
}

if ($action === 'lookup') {
    $address = trim((string)($body['address'] ?? ''));
    if (strlen($address) < 8 || strlen($address) > 180) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Enter a complete Arizona property address.']);
        exit;
    }
    $result = lookupArizonaAddress($address);
    if (!$result) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'The address was not matched to an Arizona property.']);
        exit;
    }
    $out = ['success' => true, 'matchedAddress' => $result['matchedAddress'], 'county' => $result['county']];
    if (!empty($result['apn']))        $out['apn']        = $result['apn'];
    if (!empty($result['parcelUrl']))  $out['parcelUrl']  = $result['parcelUrl'];
    if (!empty($result['assessorUrl'])) $out['assessorUrl'] = $result['assessorUrl'];
    echo json_encode($out);
    exit;
}

http_response_code(400);
echo json_encode(['success' => false, 'error' => 'Unknown action']);
