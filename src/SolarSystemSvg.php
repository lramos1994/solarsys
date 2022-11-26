<?php
namespace SolarSystemSvg;

class SolarSystemSvg
{

    public $sun;
    public $system;
    public $planets = [];
    
    public function __construct($width = 100, $height = 100)
    {   
        $this->sun = [
            'size' => (($width+$height)/2.5)*0.05,
        ];

        $this->system = [
            'width' => $width,
            'height' => $height,
        ];

        return $this;
    }

    public function addPlanet($size, $distance, $moon = false)
    {
        $planet = new Planet($size, $distance, $moon, $this);
        $this->planets[] = $planet;
    }

    public function getCoordinateFromCenter($x, $y, $type)
    {
        $types = [
            '-' => (($this->system['width']/2)-$x).' '.(($this->system['height']/2)-$y),
            '+' => (($this->system['width']/2)+$x).' '.(($this->system['height']/2)+$y),
        ];
        return $types[$type];
    }

    public function getOrbitsPath()
    {
        $orbits = [];

        foreach ($this->planets as $key => $planet) {
            $orbits[] = $planet->getOrbit();
        }

        return $orbits;
    }

    public function getPlanets()
    {
        $planets = [];

        foreach ($this->planets as $key => $planet) {
            $planets[] = $planet->getPlanet();
        }

        return $planets;
    }

    public function render()
    {
        $orbits = $this->getOrbitsPath();
        $planets = $this->getPlanets();
        
        return '
        <svg viewBox="0 0 '.($this->system['width']+5).' '.($this->system['height']+5).'" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(2.5 2.5)">
                '.implode($orbits).'
                <circle cx="'.($this->system['width']/2).'" cy="'.($this->system['height']/2).'" r="'.($this->sun['size']).'" fill="yellow"></circle>
                '.implode($planets).'
            </g>
        </svg>';
    }
}
