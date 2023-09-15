<?php 
use SolarSystemSvg\SolarSystemSvg;

require_once __DIR__ . '/vendor/autoload.php';

$system = new SolarSystemSvg(300, 300);

$system->addPlanet(10, 80, true);
// $system->addPlanet(5, 55, true);
// $system->addPlanet(3, 35, true);
// $system->addPlanet(5, 150, true);


?>

<div style="width:500px;border: 1px solid;">
    <?php echo $system->render(); ?>
</div>
