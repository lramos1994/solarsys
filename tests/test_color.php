<?php
require __DIR__ . '/lib.php';
require __DIR__ . '/../vendor/autoload.php';
use SolarSystemSvg\Color;

t_eq(Color::parse('#ffffff'), [255,255,255], 'parse white');
t_eq(Color::parse('#000'), [0,0,0], 'parse short black');
t_eq(Color::toHex(255,255,255), '#ffffff', 'toHex white');
t_eq(Color::toHex(-10, 300, 128), '#00ff80', 'toHex clamps');
t_eq(Color::tint('#000000', 0.5), '#808080', 'tint 50% of black');
t_eq(Color::shade('#ffffff', 0.5), '#808080', 'shade 50% of white');
t_eq(Color::mix('#000000', '#ffffff', 0.5), '#808080', 'mix midpoint');
t_match(Color::rgba('#3366cc', 0.4), '/^rgba\(51,102,204,0\.4\)$/', 'rgba format');
// hueShift by 360deg is identity (allow rounding within the same hex)
t_eq(Color::hueShift('#3366cc', 360), '#3366cc', 'hueShift 360 identity');
t_summary();
