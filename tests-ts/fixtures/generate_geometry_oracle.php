<?php
/**
 * Regenerates the committed TypeScript migration geometry oracle from the
 * legacy PHP renderer. The fixture stores `Planet::getOrbit()`'s real `d`
 * attribute, not a reimplementation of its geometry.
 *
 * Usage: php tests-ts/fixtures/generate_geometry_oracle.php [output-path]
 */

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use SolarSystemSvg\SolarSystemSvg;

$outputPath = $argv[1] ?? __DIR__ . '/geometry-oracle.json';

/** @var list<array{name: string, width: int, height: int, distance: int|list<int>}> $cases */
$cases = [
    [
        'name' => 'small-square-scalar',
        'width' => 100,
        'height' => 100,
        'distance' => 20,
    ],
    [
        'name' => 'landscape-scalar',
        'width' => 300,
        'height' => 180,
        'distance' => 55,
    ],
    [
        'name' => 'portrait-scalar',
        'width' => 180,
        'height' => 300,
        'distance' => 75,
    ],
    [
        'name' => 'baseline-asymmetric',
        'width' => 300,
        'height' => 300,
        'distance' => [150, 60, 150, 60],
    ],
    [
        'name' => 'landscape-asymmetric',
        'width' => 640,
        'height' => 360,
        'distance' => [35, 65, 140, 90],
    ],
    [
        'name' => 'portrait-asymmetric',
        'width' => 360,
        'height' => 640,
        'distance' => [120, 45, 80, 175],
    ],
];

$orbits = [];
foreach ($cases as $case) {
    // Planet construction consumes legacy random values for ids/rings. The
    // geometry does not depend on them, but seed them anyway so regeneration
    // has no hidden non-deterministic input.
    mt_srand(0);
    $system = new SolarSystemSvg($case['width'], $case['height']);
    $system->addPlanet(10, $case['distance']);
    $orbit = $system->getOrbitsPath()[0];

    if (preg_match("/\\sd='([^']+)'/", $orbit, $match) !== 1) {
        throw new RuntimeException("Could not extract the orbit path for {$case['name']}");
    }

    $orbits[] = [
        'name' => $case['name'],
        'canvas' => ['width' => $case['width'], 'height' => $case['height']],
        'distance' => $case['distance'],
        'path' => $match[1],
    ];
}

$fixture = [
    'source' => 'legacy PHP Planet::getOrbit()',
    'bezierConstant' => 0.5522847498,
    'orbits' => $orbits,
];

$json = json_encode(
    $fixture,
    JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
) . "\n";

if (file_put_contents($outputPath, $json) === false) {
    throw new RuntimeException("Could not write $outputPath");
}
