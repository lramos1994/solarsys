<?php 
use SolarSystemSvg\SolarSystemSvg;

require_once __DIR__ . '/vendor/autoload.php';

$system = new SolarSystemSvg(300, 300);

$system->addPlanet(10, [150, 60, 150, 60], ['size' => 3, 'distance' => 25]);
$system->addPlanet(5, 55, ['size' => 2, 'distance' => 10]);
$system->addPlanet(3, 35, false);
$system->addPlanet(5, 150, ['size' => 3, 'distance' => 8]);
?>

<div style="width:750px;border: 1px solid;background: #000;">
    <?php echo $system->render(); ?>
</div>

<link rel="stylesheet" href="/dist/styles/main.css">