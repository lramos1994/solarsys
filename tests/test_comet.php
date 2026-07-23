<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\Comet;

$c = new Comet(300, 300, ['head' => '#fff', 'tail' => '#7ef0d0'], 0);
$defs = $c->defs();
$svg = $c->render();
t_contains($defs, 'linearGradient', 'tail uses a gradient in defs');
t_contains($svg, '<animateMotion', 'comet moves via animateMotion');
t_contains($svg, 'repeatCount=\'indefinite\'', 'comet loops');
t_summary();
