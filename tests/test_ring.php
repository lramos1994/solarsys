<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\Ring;

$ring = new Ring(10, 'abc', ['bands' => ['#cccccc', '#888888'], 'gap' => '#333333'], 0.25);
$back = $ring->back();
$front = $ring->front();
t_contains($back, '<ellipse', 'back is an ellipse');
t_contains($front, '<path', 'front is a clipped path arc');
t_contains($front, 'clipPath', 'front uses a clip to occlude behind planet');
t_ok(strlen($back) > 0 && strlen($front) > 0, 'both halves render');
t_summary();
