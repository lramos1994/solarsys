<?php
namespace SolarSystemSvg;

class SolarSystemSvg
{

    public $sun;
    public $system;
    public $planets = [];
    public $debug = false;
    
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
        $style = (count($this->planets) % 5) + 1;
        $planet = new Planet($size, $distance, $moon, $this, $style);
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

    public function getEspecificCoordinateFromCenter($x, $y, $type, $axis)
    {
        $cordinates = explode(' ',$this->getCoordinateFromCenter($x, $y, $type));

        if ($axis == 'x') {
            return $cordinates[0];
        }

        if ($axis == 'y') {
            return $cordinates[1];
        }
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

    public function getBackground()
    {
        $w = $this->system['width'] + 5;
        $h = $this->system['height'] + 5;

        $starPoints = '1,0 0.2828,0.2828 0,1 -0.2828,0.2828 -1,0 -0.2828,-0.2828 0,-1 0.2828,-0.2828';
        $stars = "<defs><polygon id='star' points='$starPoints' /></defs>";
        $stars .= "<rect width='$w' height='$h' fill='#000' />";

        $colors = ['#FFFFFF', '#B0C4DE', '#FFFACD', '#FFE4B5', '#ADD8E6'];
        $count = intval($w * $h / 15);

        for ($i = 0; $i < $count; $i++) {
            $cx = mt_rand(0, $w * 10) / 10;
            $cy = mt_rand(0, $h * 10) / 10;
            $scale = mt_rand(1, 10) / 10;
            $opacity = mt_rand(3, 10) / 10;
            $color = $colors[mt_rand(0, count($colors) - 1)];
            $stars .= "<use xlink:href='#star' fill='$color' opacity='$opacity' transform='translate($cx $cy) scale($scale)' />";
        }

        return $stars;
    }

    public function render()
    {
        $orbits = $this->getOrbitsPath();
        $planets = $this->getPlanets();
        $background = $this->debug ? '' : $this->getBackground();

        $sunR = $this->sun['size'];
        $sunCx = $this->system['width'] / 2;
        $sunCy = $this->system['height'] / 2;
        $glowR = $sunR * 3;

        $sunDefs = '
            <defs>
                <radialGradient id="sun-grad" cx="40%" cy="40%" r="50%">
                    <stop offset="0%" stop-color="#fff" />
                    <stop offset="30%" stop-color="#ffee58" />
                    <stop offset="70%" stop-color="#ff9800" />
                    <stop offset="100%" stop-color="#e65100" />
                </radialGradient>
                <radialGradient id="sun-glow">
                    <stop offset="0%" stop-color="rgba(255,200,50,0.4)" />
                    <stop offset="50%" stop-color="rgba(255,150,0,0.15)" />
                    <stop offset="100%" stop-color="rgba(255,100,0,0)" />
                </radialGradient>
            </defs>';

        $bg = $this->debug ? '#fff' : '#000';

        return '
        <svg class="solarsys" style="background:'.$bg.'" viewBox="0 0 '.($this->system['width']+5).' '.($this->system['height']+5).'" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            '.$background.'
            <g transform="translate(2.5 2.5)">
                '.implode($orbits).'
                '.$sunDefs.'
                <circle cx="'.$sunCx.'" cy="'.$sunCy.'" r="'.$glowR.'" fill="url(#sun-glow)" />
                <circle cx="'.$sunCx.'" cy="'.$sunCy.'" r="'.$sunR.'" fill="url(#sun-grad)" class="sun" />
                '.implode($planets).'
            </g>
        </svg>';
    }
}
