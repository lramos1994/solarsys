<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\Theme;

$hex = '/^#[0-9a-f]{6}$/';

// Determinism: same seed -> same theme name and same derived planet color.
$a = new Theme(123); $b = new Theme(123);
t_eq($a->name(), $b->name(), 'same seed -> same theme name');
t_eq($a->planet(0)['base'], $b->planet(0)['base'], 'same seed -> same planet base');

$t = new Theme(1);
t_match($t->planet(0)['base'], $hex, 'planet base is hex');
t_match($t->planet(0)['light'], $hex, 'planet light is hex');
t_match($t->planet(0)['dark'], $hex, 'planet dark is hex');
t_eq(count($t->planet(0)['stains']), 3, 'planet has 3 stains');
t_contains($t->planet(0)['atmosphere'], 'rgba(', 'atmosphere is rgba');
// Index wraps around planetHues without undefined index.
t_match($t->planet(99)['base'], $hex, 'planet index wraps');
t_match($t->sun()['bands'][0], $hex, 'sun band hex');
t_contains($t->sun()['glow'], 'rgba(', 'sun glow rgba');
t_eq(count($t->background()['layers']) >= 1, true, 'background has layers');
t_match($t->background()['vignette'], $hex, 'vignette hex');
t_match($t->ring()['bands'][0], $hex, 'ring band hex');
t_match($t->star(), $hex, 'star hex');
t_match($t->asteroid()['fill'], $hex, 'asteroid fill hex');
t_match($t->comet()['tail'], $hex, 'comet tail hex');
t_summary();
