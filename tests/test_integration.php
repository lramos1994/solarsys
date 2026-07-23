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
echo "integration OK\n";
t_summary();
