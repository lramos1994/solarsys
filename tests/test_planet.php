<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\SolarSystemSvg;
use SolarSystemSvg\Planet;
use SolarSystemSvg\Theme;

$theme = new Theme(7);
$sys = new SolarSystemSvg(300, 300);
// Render every planet index against a fixed theme; assert flat markers and no warnings.
for ($i = 0; $i < 12; $i++) {
    foreach ([false, ['size' => 3, 'distance' => 15]] as $moon) {
        $p = new Planet(10, 100, $moon, $sys, $theme, $i);
        $svg = $p->getPlanet();
        t_contains($svg, 'terminator-', "planet $i has flat terminator");
        t_contains($svg, 'atmosphere-', "planet $i has atmosphere ring");
        t_ok(strpos($svg, "fill='url(#grad-") === false, "planet $i uses flat fill, not radial grad");
    }
}
echo "planet flat OK\n";
t_summary();
