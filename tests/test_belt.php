<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\AsteroidBelt;

$belt = new AsteroidBelt(150, 150, 120, 120, ['fill' => '#888', 'stroke' => '#444'], 60);
$defs = $belt->defs();
$svg = $belt->render();
t_contains($defs, "<polygon id='ast-a'", 'defs define asteroid polygon(s)');
$uses = substr_count($svg, '<use');
t_ok($uses === 60, "renders exactly 60 asteroids (got $uses)");
t_contains($svg, 'animateTransform', 'belt drifts');
t_summary();
