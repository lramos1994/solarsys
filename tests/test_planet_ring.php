<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\SolarSystemSvg;
use SolarSystemSvg\Planet;
use SolarSystemSvg\Theme;

$theme = new Theme(3);
$sys = new SolarSystemSvg(300, 300);
$found = false;
for ($i = 0; $i < 60; $i++) {
    $p = new Planet(10, 100, false, $sys, $theme, $i); // size 10 -> eligible for rings
    $svg = $p->getPlanet();
    if (strpos($svg, 'ring-clip-') !== false) {
        $found = true;
        t_contains($svg, '<ellipse', 'ringed planet draws back ellipse');
        $pBack = strpos($svg, '<ellipse');
        $pBody = strpos($svg, "id='clip-");
        $pFront = strpos($svg, "id='ring-clip-");
        t_ok($pBack !== false && $pBody !== false && $pFront !== false && $pBack < $pBody && $pBody < $pFront,
            'occlusion order: ring back (ellipse) before disc clip, front ring after');
    }
}
t_ok($found, 'at least one of 60 size-10 planets has a ring');
t_summary();
