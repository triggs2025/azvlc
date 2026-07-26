<?php
require_once __DIR__ . '/config.php';

// ── CORS ──
header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// ── Parse body ──
$body = json_decode(file_get_contents('php://input'), true);
if (!$body || !isset($body['type'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing type']);
    exit;
}

$type = $body['type'];

// ── Rate limiting (simple: 5 submissions per IP per hour) ──
$rateFile = sys_get_temp_dir() . '/azvlc_rate_' . md5($_SERVER['REMOTE_ADDR'] . '_' . $type) . '.json';
$now = time();
$hits = [];
if (file_exists($rateFile)) {
    $hits = json_decode(file_get_contents($rateFile), true) ?: [];
}
$hits = array_filter($hits, function($t) use ($now) { return $now - $t < 3600; });
if (count($hits) >= 20) {
    http_response_code(429);
    echo json_encode(['error' => 'Too many submissions. Please wait and try again.']);
    exit;
}
$hits[] = $now;
file_put_contents($rateFile, json_encode(array_values($hits)));

// ── Helpers ──
function esc($s) {
    return htmlspecialchars(strip_tags(trim((string)$s)), ENT_QUOTES, 'UTF-8');
}

function ghGet($path) {
    $ch = curl_init('https://api.github.com/repos/' . GH_OWNER . '/' . GH_REPO . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: token ' . GH_TOKEN,
            'User-Agent: azvlc-proxy',
            'Accept: application/vnd.github+json',
        ],
    ]);
    $result = curl_exec($ch);
    curl_close($ch);
    return json_decode($result, true);
}

function ghPut($path, $payload) {
    $ch = curl_init('https://api.github.com/repos/' . GH_OWNER . '/' . GH_REPO . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => 'PUT',
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER => [
            'Authorization: token ' . GH_TOKEN,
            'User-Agent: azvlc-proxy',
            'Accept: application/vnd.github+json',
            'Content-Type: application/json',
        ],
    ]);
    $result = curl_exec($ch);
    curl_close($ch);
    return json_decode($result, true);
}

function ghPost($path, $payload) {
    $ch = curl_init('https://api.github.com/repos/' . GH_OWNER . '/' . GH_REPO . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER => [
            'Authorization: token ' . GH_TOKEN,
            'User-Agent: azvlc-proxy',
            'Accept: application/vnd.github+json',
            'Content-Type: application/json',
        ],
    ]);
    $result = curl_exec($ch);
    curl_close($ch);
    return json_decode($result, true);
}

function readDataFile($file) {
    $result = ghGet('/contents/data/' . $file . '?ref=' . GH_BRANCH);
    if (!isset($result['content'])) return [null, null];
    $data = json_decode(base64_decode(str_replace("\n", '', $result['content'])), true);
    return [$data, $result['sha']];
}

function writeDataFile($file, $data, $sha, $message) {
    $content = base64_encode(json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n");
    return ghPut('/contents/data/' . $file, [
        'message' => $message,
        'content' => $content,
        'sha'     => $sha,
        'branch'  => GH_BRANCH,
    ]);
}

// ── Handlers ──

function handleVOBSubmission($body) {
    $name  = esc($body['businessName'] ?? '');
    $cat   = esc($body['category'] ?? '');
    $desc  = esc($body['description'] ?? '');
    $email = filter_var(trim($body['ownerEmail'] ?? ''), FILTER_SANITIZE_EMAIL);
    $phone = esc($body['ownerPhone'] ?? '');

    if (!$name || !$cat) return ['error' => 'Missing required fields'];
    if (!$email && !$phone) return ['error' => 'At least one contact method required'];

    $submission = [
        'id'          => time() * 1000,
        'businessName'=> $name,
        'category'    => $cat,
        'description' => $desc,
        'website'     => filter_var(trim($body['website'] ?? ''), FILTER_SANITIZE_URL),
        'address'     => esc($body['address'] ?? ''),
        'zip'         => preg_replace('/[^0-9]/', '', $body['zip'] ?? ''),
        'phone'       => esc($body['bizPhone'] ?? ''),
        'hours'       => esc($body['hours'] ?? ''),
        'discount'    => esc($body['discount'] ?? ''),
        'ownerName'   => esc($body['ownerName'] ?? ''),
        'ownerEmail'  => $email,
        'ownerPhone'  => $phone,
        'submittedAt' => date('c'),
    ];

    [$submissions, $sha] = readDataFile('vob-submissions.json');
    if ($submissions === null) return ['error' => 'Could not read submissions file'];
    $submissions[] = $submission;
    $result = writeDataFile('vob-submissions.json', $submissions, $sha, 'VOB submission: ' . $name);
    if (!isset($result['content'])) return ['error' => 'Save failed'];

    return ['success' => true, 'message' => 'Your business has been submitted for review. Thank you!'];
}

function handlePolicySuggestion($body) {
    $name  = esc($body['policyName'] ?? '');
    $desc  = esc($body['description'] ?? '');
    $email = filter_var(trim($body['email'] ?? ''), FILTER_SANITIZE_EMAIL);

    if (!$name || !$desc) return ['error' => 'Missing required fields'];

    $submission = [
        'id'          => time() * 1000,
        'policyName'  => $name,
        'description' => $desc,
        'submitterName'  => esc($body['submitterName'] ?? ''),
        'submitterEmail' => $email,
        'submitterZip'   => preg_replace('/[^0-9]/', '', $body['zip'] ?? ''),
        'submittedAt' => date('c'),
    ];

    [$submissions, $sha] = readDataFile('policy-submissions.json');
    if ($submissions === null) return ['error' => 'Could not read submissions file'];
    $submissions[] = $submission;
    $result = writeDataFile('policy-submissions.json', $submissions, $sha, 'Policy suggestion: ' . $name);
    if (!isset($result['content'])) return ['error' => 'Save failed'];

    return ['success' => true, 'message' => 'Your policy suggestion has been submitted. Thank you!'];
}

function handleRating($body) {
    $polName  = esc($body['politicianName'] ?? '');
    $grade    = preg_replace('/[^ABCDF]/', '', strtoupper($body['grade'] ?? ''));
    $reason   = esc($body['reason'] ?? '');
    $zip      = preg_replace('/[^0-9]/', '', $body['zip'] ?? '');
    $email    = filter_var(trim($body['email'] ?? ''), FILTER_SANITIZE_EMAIL);
    $raterName= esc($body['raterName'] ?? '');
    $anon     = !empty($body['anonymous']);

    if (!$polName || !$grade) return ['error' => 'Missing required fields'];

    $rating = [
        'id'              => time() * 1000,
        'politicianName'  => $polName,
        'politicianId'    => intval($body['politicianId'] ?? 0),
        'grade'           => $grade,
        'reason'          => $reason,
        'raterName'       => $anon ? 'Anonymous' : $raterName,
        'raterEmail'      => $anon ? '' : $email,
        'raterZip'        => $zip,
        'anonymous'       => $anon,
        'submittedAt'     => date('c'),
    ];

    [$ratings, $sha] = readDataFile('ratings.json');
    if ($ratings === null) $ratings = [];
    // ratings.json may not exist yet — handle missing sha
    if ($sha === null) {
        // create file
        $content = base64_encode(json_encode([$rating], JSON_PRETTY_PRINT) . "\n");
        $result = ghPut('/contents/data/ratings.json', [
            'message' => 'New rating for ' . $polName,
            'content' => $content,
            'branch'  => GH_BRANCH,
        ]);
    } else {
        $ratings[] = $rating;
        $result = writeDataFile('ratings.json', $ratings, $sha, 'New rating for ' . $polName);
    }

    return ['success' => true, 'message' => 'Your rating has been submitted. Thank you!'];
}

function handleCorrection($body) {
    $correction = [
        'id'          => time() * 1000,
        'type'        => esc($body['correctionType'] ?? ''),
        'description' => esc($body['description'] ?? ''),
        'submitterName'  => esc($body['submitterName'] ?? ''),
        'submitterEmail' => filter_var(trim($body['submitterEmail'] ?? ''), FILTER_SANITIZE_EMAIL),
        'submittedAt' => date('c'),
    ];

    [$corrections, $sha] = readDataFile('corrections.json');
    if ($corrections === null) return ['error' => 'Could not read corrections file'];
    $corrections[] = $correction;
    $result = writeDataFile('corrections.json', $corrections, $sha, 'Correction submitted');
    if (!isset($result['content'])) return ['error' => 'Save failed'];

    return ['success' => true];
}

function handleDonate($body) {
    $entry = [
        'id'    => time() * 1000,
        'name'  => esc($body['name'] ?? ''),
        'email' => filter_var(trim($body['email'] ?? ''), FILTER_SANITIZE_EMAIL),
        'phone' => esc($body['phone'] ?? ''),
        'submittedAt' => date('c'),
    ];

    [$list, $sha] = readDataFile('donate-interest.json');
    if ($list === null) { $list = []; $sha = null; }

    $list[] = $entry;

    if ($sha === null) {
        $content = base64_encode(json_encode($list, JSON_PRETTY_PRINT) . "\n");
        ghPut('/contents/data/donate-interest.json', [
            'message' => 'Donate interest',
            'content' => $content,
            'branch'  => GH_BRANCH,
        ]);
    } else {
        writeDataFile('donate-interest.json', $list, $sha, 'Donate interest');
    }

    return ['success' => true];
}

// ── Route ──
switch ($type) {
    case 'vob':       echo json_encode(handleVOBSubmission($body));  break;
    case 'policy':    echo json_encode(handlePolicySuggestion($body)); break;
    case 'rating':    echo json_encode(handleRating($body));         break;
    case 'correction':echo json_encode(handleCorrection($body));     break;
    case 'donate':    echo json_encode(handleDonate($body));         break;
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown type: ' . esc($type)]);
}
