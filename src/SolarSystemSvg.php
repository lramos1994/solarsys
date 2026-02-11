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

    }

    public function addPlanet($size, $distance, $moon = false)
    {
        $style = (count($this->planets) % 5) + 1;
        $planet = new Planet($size, $distance, $moon, $this, $style);
        $this->planets[] = $planet;
    }

    public function getOrbitsPath()
    {
        $orbits = [];

        foreach ($this->planets as $planet) {
            $orbits[] = $planet->getOrbit();
        }

        return $orbits;
    }

    public function getPlanets()
    {
        $planets = [];

        foreach ($this->planets as $planet) {
            $planets[] = $planet->getPlanet();
        }

        return $planets;
    }

    public function getBackground()
    {
        $w = $this->system['width'] + 5;
        $h = $this->system['height'] + 5;

        $styles = [
            // 1. Deep purple nebula
            [
                [['#1a1a4e', '#1b1050', '#150a38', '#060318'], '30%', '40%'],
                [['#2a1060', '#1a0840', '#120630', '#060318'], '75%', '25%'],
                [['#180a40', '#250e55', '#100830', '#050215'], '20%', '70%'],
                [['#1a0a2e', '#2a1040', '#180828', '#080310'], '60%', '55%'],
                [['#120a35', '#1a1050', '#0e0828', '#040210'], '50%', '30%'],
            ],
            // 2. Ocean blue
            [
                [['#0a1a3e', '#0c2850', '#081838', '#020a18'], '40%', '60%'],
                [['#081a48', '#0a2858', '#061840', '#020815'], '70%', '30%'],
                [['#0c1e50', '#082248', '#061838', '#030a1a'], '25%', '45%'],
                [['#0a1640', '#0e2a5a', '#081a38', '#020810'], '55%', '70%'],
                [['#061438', '#0a2050', '#041230', '#020610'], '35%', '20%'],
            ],
            // 3. Crimson void
            [
                [['#2a1a1a', '#3a1020', '#280a18', '#100308'], '60%', '35%'],
                [['#301520', '#400e28', '#200818', '#0a0208'], '25%', '65%'],
                [['#281018', '#350c22', '#1e0a15', '#080205'], '70%', '40%'],
                [['#221215', '#2e0e1e', '#1a0812', '#060204'], '40%', '20%'],
                [['#2e181e', '#3c1228', '#220a16', '#0c0308'], '50%', '60%'],
            ],
            // 4. Emerald nebula
            [
                [['#0a2a2a', '#103830', '#082820', '#031510'], '35%', '55%'],
                [['#0c2e28', '#123a32', '#0a2a22', '#041810'], '65%', '30%'],
                [['#082420', '#0e3028', '#08221a', '#03120c'], '25%', '70%'],
                [['#0a2824', '#10342e', '#08261e', '#04160e'], '50%', '40%'],
                [['#062220', '#0c2e2a', '#062018', '#02100a'], '40%', '25%'],
            ],
            // 5. Violet cosmos
            [
                [['#1a0a2e', '#2a1040', '#180828', '#080310'], '70%', '30%'],
                [['#200e38', '#301448', '#1a0a30', '#0a0418'], '30%', '60%'],
                [['#180c30', '#24103c', '#140828', '#060310'], '55%', '45%'],
                [['#1e0a34', '#2c1244', '#16082c', '#080315'], '40%', '25%'],
                [['#140a28', '#200e38', '#120824', '#050210'], '65%', '65%'],
            ],
        ];

        $style = $styles[mt_rand(0, count($styles) - 1)];
        $spaceBg = '';
        foreach ($style as $i => $l) {
            $colors = $l[0];
            $cx = $l[1];
            $cy = $l[2];
            $spaceBg .= "<radialGradient id='space-bg-$i' cx='$cx' cy='$cy' r='80%'>
                    <stop offset='0%' stop-color='{$colors[0]}' stop-opacity='" . ($i === 0 ? '1' : '0.5') . "' />
                    <stop offset='35%' stop-color='{$colors[1]}' stop-opacity='" . ($i === 0 ? '1' : '0.4') . "' />
                    <stop offset='60%' stop-color='{$colors[2]}' stop-opacity='" . ($i === 0 ? '1' : '0.3') . "' />
                    <stop offset='100%' stop-color='{$colors[3]}' stop-opacity='" . ($i === 0 ? '1' : '0') . "' />
                </radialGradient>";
        }

        $starPoints = '1,0 0.346,0.2 0.5,0.866 0,0.4 -0.5,0.866 -0.346,0.2 -1,0 -0.346,-0.2 -0.5,-0.866 0,-0.4 0.5,-0.866 0.346,-0.2';
        $brightStarPoints = '2.5,0 0.26,0.15 1.25,2.165 0,0.3 -1.25,2.165 -0.26,0.15 -2.5,0 -0.26,-0.15 -1.25,-2.165 0,-0.3 1.25,-2.165 0.26,-0.15';
        $stars = "
            <defs>
                <polygon id='star' points='$starPoints' />
                <polygon id='bright-star' points='$brightStarPoints' />
                <radialGradient id='star-glow'>
                    <stop offset='0%' stop-color='white' stop-opacity='0.15' />
                    <stop offset='100%' stop-color='white' stop-opacity='0' />
                </radialGradient>
$spaceBg
            </defs>";
        $stars .= "<rect width='$w' height='$h' fill='url(#space-bg-0)' />";
        $stars .= "<rect width='$w' height='$h' fill='url(#space-bg-1)' />";
        $stars .= "<rect width='$w' height='$h' fill='url(#space-bg-2)' />";
        $stars .= "<rect width='$w' height='$h' fill='url(#space-bg-3)' />";
        $stars .= "<rect width='$w' height='$h' fill='url(#space-bg-4)' />";

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

        $brightCount = mt_rand(5, 10);
        $brightColors = ['#FFFFFF', '#E0E8FF', '#FFF8E0'];
        for ($i = 0; $i < $brightCount; $i++) {
            $bx = mt_rand(0, $w * 10) / 10;
            $by = mt_rand(0, $h * 10) / 10;
            $bScale = mt_rand(15, 25) / 10;
            $bColor = $brightColors[mt_rand(0, count($brightColors) - 1)];
            $bGlowR = round($bScale * 4, 2);
            $bRotate = mt_rand(0, 180);
            $stars .= "<circle cx='$bx' cy='$by' r='$bGlowR' fill='url(#star-glow)' />";
            $stars .= "<use xlink:href='#bright-star' fill='$bColor' opacity='1' transform='translate($bx $by) scale($bScale) rotate($bRotate)' />";
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
