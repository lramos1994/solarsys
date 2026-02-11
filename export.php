<?php 
use SolarSystemSvg\SolarSystemSvg;                                                  
                                                                                      
require_once __DIR__ . '/vendor/autoload.php';                                      
                                                                                    
$system = new SolarSystemSvg(300, 300);                                             
$system->addPlanet(10, [150, 50, 150, 50], ['size' => 3, 'distance' => 15]);        
                                                                                    
file_put_contents('solarsystem.svg', $system->render());