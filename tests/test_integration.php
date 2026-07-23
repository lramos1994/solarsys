<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\SolarSystemSvg;

// Force each of the 6 themes by seeding, render a full scene, assert invariants.
for ($seed = 0; $seed < 30; $seed++) {
    mt_srand($seed);
    $s = new SolarSystemSvg(300, 300);
    $s->addPlanet(10, [150, 60, 150, 60], ['size' => 3, 'distance' => 25]);
    $s->addPlanet(6, 55, ['size' => 2, 'distance' => 10]);
    $s->addPlanet(4, 35, false);
    $s->addPlanet(8, 150, ['size' => 3, 'distance' => 8]);
    $out = $s->render();

    t_eq(substr_count($out, '<svg'), 1, "seed $seed: exactly one <svg>");
    t_eq(substr_count($out, '<g'), substr_count($out, '</g>'), "seed $seed: balanced <g>");
    t_contains($out, 'ast-a', "seed $seed: asteroid belt present");
    t_contains($out, 'comet-tail-', "seed $seed: comet present");
    t_contains($out, 'terminator-', "seed $seed: flat planets present");
    t_contains($out, 'vignette', "seed $seed: vignette present");
    t_ok(strlen($out) < 320000, "seed $seed: under weight budget (" . strlen($out) . ")");
}
// Scene-level structural invariants (cross-task): well-formed, unique ids, refs resolve.
for ($seed = 100; $seed < 105; $seed++) {
    mt_srand($seed);
    $s = new SolarSystemSvg(300, 300);
    $s->addPlanet(10, [150, 60, 150, 60], ['size' => 3, 'distance' => 25]);
    $s->addPlanet(8, 90, ['size' => 3, 'distance' => 12]);
    $s->addPlanet(6, 55, false);
    $out = $s->render();
    $svg = substr($out, strpos($out, '<svg'));

    $prev = libxml_use_internal_errors(true);
    $doc = new DOMDocument();
    $ok = $doc->loadXML($svg);
    libxml_use_internal_errors($prev);
    t_ok($ok !== false, "seed $seed: SVG is well-formed XML");

    preg_match_all('/\bid=\'([^\']+)\'/', $svg, $idm);
    $ids = $idm[1];
    t_eq(count($ids), count(array_unique($ids)), "seed $seed: no duplicate ids");

    preg_match_all('/url\(#([^)]+)\)|href=\'#([^\']+)\'/', $svg, $refm, PREG_SET_ORDER);
    $idset = array_flip($ids);
    $missing = [];
    foreach ($refm as $r) {
        $ref = ($r[1] !== '') ? $r[1] : ($r[2] ?? '');
        if ($ref !== '' && !isset($idset[$ref])) { $missing[] = $ref; }
    }
    t_ok(count($missing) === 0, "seed $seed: all local refs resolve" . ($missing ? ' (missing: ' . implode(',', array_slice($missing, 0, 3)) . ')' : ''));
}
echo "integration OK\n";
t_summary();
