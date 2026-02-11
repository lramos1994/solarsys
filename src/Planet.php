<?php
namespace SolarSystemSvg;

class Planet
{
    public $id;
    public $size;
    public $distance;
    public $moon = false;
    public $system;
    public $style;

    private static $styles = [
        1 => ['light' => '#e8734a', 'dark' => '#7a2a08', 'stains' => ['#7a2a08', '#a03510', '#5c1f06']],
        2 => ['light' => '#e8b76a', 'dark' => '#8a5d20', 'stains' => ['#a07030', '#8a5d20', '#c88040']],
        3 => ['light' => '#7b9cef', 'dark' => '#2a4a9a', 'stains' => ['#3a5cb0', '#6088e0', '#2a4a9a']],
        4 => ['light' => '#5dba7a', 'dark' => '#1a5c30', 'stains' => ['#1a6b8a', '#3d7a50', '#2a6040']],
        5 => ['light' => '#f0c848', 'dark' => '#8a6a10', 'stains' => ['#8b0000', '#4a0000', '#a02020']],
    ];

    private static $moonStyles = [
        1 => ['light' => '#d0d0d0', 'dark' => '#6a6a6a', 'stains' => ['#555555', '#4a4a4a', '#707070']],
        2 => ['light' => '#c8ddf0', 'dark' => '#5a7a9a', 'stains' => ['#4a6a8a', '#6088a0', '#506878']],
        3 => ['light' => '#f0e8c8', 'dark' => '#9a8a5a', 'stains' => ['#8a7a4a', '#a09060', '#706030']],
        4 => ['light' => '#d0a090', 'dark' => '#7a4a3a', 'stains' => ['#6a3a2a', '#8a5a4a', '#5a3020']],
        5 => ['light' => '#a0a0a8', 'dark' => '#404048', 'stains' => ['#353540', '#505058', '#2a2a30']],
    ];

    public function __construct($size, $distance, $moon, $system, $style = 1)
    {
        $this->size = $size;
        $this->distance = is_array($distance) ? $distance : [$distance, $distance, $distance, $distance];
        $this->moon = $moon;
        $this->system = $system;
        $this->style = $style;
        $this->id = uniqid(rand(), true);
    }

    public function getOrbit()
    {
        $cx = $this->system->system['width'] / 2;
        $cy = $this->system->system['height'] / 2;

        [$left, $top, $right, $bottom] = $this->distance;
        $kLeft   = $left   * 0.5522847498;
        $kTop    = $top    * 0.5522847498;
        $kRight  = $right  * 0.5522847498;
        $kBottom = $bottom * 0.5522847498;

        $path = "M " . ($cx - $left) . " $cy"
            . " C " . ($cx - $left) . " " . ($cy - $kTop) . ", " . ($cx - $kLeft) . " " . ($cy - $top) . ", $cx " . ($cy - $top)
            . " C " . ($cx + $kRight) . " " . ($cy - $top) . ", " . ($cx + $right) . " " . ($cy - $kTop) . ", " . ($cx + $right) . " $cy"
            . " C " . ($cx + $right) . " " . ($cy + $kBottom) . ", " . ($cx + $kRight) . " " . ($cy + $bottom) . ", $cx " . ($cy + $bottom)
            . " C " . ($cx - $kLeft) . " " . ($cy + $bottom) . ", " . ($cx - $left) . " " . ($cy + $kBottom) . ", " . ($cx - $left) . " $cy"
            . " Z";

        $stroke = $this->system->debug ? "stroke='lightgrey' stroke-width='0.1'" : "stroke='none'";

        return "<path fill='none' $stroke id='orbit-$this->id' d='$path' />";
    }

    public function getPlanet()
    {
        $r = $this->size;
        $id = $this->id;
        $style = self::$styles[$this->style];

        $shadowR = round($r * 1.5, 2);

        $defs = "
            <defs>
                <clipPath id='clip-$id'>
                    <circle cx='0' cy='0' r='$r' />
                </clipPath>
                <radialGradient id='grad-$id' cx='35%' cy='35%' r='60%'>
                    <stop offset='0%' stop-color='{$style['light']}' />
                    <stop offset='100%' stop-color='{$style['dark']}' />
                </radialGradient>
                <radialGradient id='shadow-$id'>
                    <stop offset='0%' stop-color='black' stop-opacity='0.6' />
                    <stop offset='60%' stop-color='black' stop-opacity='0.3' />
                    <stop offset='100%' stop-color='black' stop-opacity='0' />
                </radialGradient>";

        $stains = '';
        $numStains = mt_rand(3, 5);
        for ($i = 0; $i < $numStains; $i++) {
            $angle = mt_rand(0, 360) * M_PI / 180;
            $dist = mt_rand(0, intval($r * 7)) / 10;
            $sx = round(cos($angle) * $dist, 2);
            $sy = round(sin($angle) * $dist, 2);
            $sr = round($r * mt_rand(15, 40) / 100, 2);
            $stainColor = $style['stains'][mt_rand(0, count($style['stains']) - 1)];
            $stains .= "<circle cx='$sx' cy='$sy' r='$sr' fill='$stainColor' opacity='0.6' />";
        }

        $moon = '';

        if ($this->moon) {
            $moon_size = $this->moon['size'];
            $moon_distance = $this->moon['distance'];
            $ms = self::$moonStyles[$this->style];
            $mid = "moon-$id";

            $md = $moon_distance;
            $mk = $md * 0.5522847498;
            $moon_orbit = "M -$md 0 C -$md -$mk, -$mk -$md, 0 -$md S $md -$mk, $md 0 S $mk $md, 0 $md S -$md $mk, -$md 0 Z";

            $moonShadowR = round($moon_size * 1.5, 2);

            $defs .= "
                <clipPath id='clip-$mid'>
                    <circle cx='0' cy='0' r='$moon_size' />
                </clipPath>
                <radialGradient id='grad-$mid' cx='35%' cy='35%' r='60%'>
                    <stop offset='0%' stop-color='{$ms['light']}' />
                    <stop offset='100%' stop-color='{$ms['dark']}' />
                </radialGradient>
                <radialGradient id='shadow-$mid'>
                    <stop offset='0%' stop-color='black' stop-opacity='0.6' />
                    <stop offset='60%' stop-color='black' stop-opacity='0.3' />
                    <stop offset='100%' stop-color='black' stop-opacity='0' />
                </radialGradient>";

            $moonStains = '';
            $numMoonStains = mt_rand(2, 4);
            for ($j = 0; $j < $numMoonStains; $j++) {
                $ma = mt_rand(0, 360) * M_PI / 180;
                $mdist = mt_rand(0, intval($moon_size * 7)) / 10;
                $msx = round(cos($ma) * $mdist, 2);
                $msy = round(sin($ma) * $mdist, 2);
                $msr = round($moon_size * mt_rand(15, 40) / 100, 2);
                $msColor = $ms['stains'][mt_rand(0, count($ms['stains']) - 1)];
                $moonStains .= "<circle cx='$msx' cy='$msy' r='$msr' fill='$msColor' opacity='0.6' />";
            }

            $moonOffset = round(15 * mt_rand(0, 100) / 100, 2);

            $moonStroke = $this->system->debug ? "stroke='lightgrey' stroke-width='0.5'" : "stroke='none'";

            $moon = "
            <path fill='none' $moonStroke d='$moon_orbit' id='planet-$this->id'></path>
            <g>
                <circle cx='0.5' cy='0.5' r='$moonShadowR' fill='url(#shadow-$mid)' />
                <g clip-path='url(#clip-$mid)'>
                    <circle cx='0' cy='0' r='$moon_size' fill='url(#grad-$mid)'></circle>
                    $moonStains
                </g>
                <animateMotion keyPoints='1;0' keyTimes='0;1' dur='15s' begin='-{$moonOffset}s' repeatCount='indefinite'>
                    <mpath xlink:href='#planet-$this->id' />
                </animateMotion>
            </g>";
        }

        $defs .= "</defs>";

        $dur = rand(20, 60);
        $planetOffset = round($dur * mt_rand(0, 100) / 100, 2);

        return "<g>
            $defs
            <circle cx='1' cy='1' r='$shadowR' fill='url(#shadow-$id)' />
            <g clip-path='url(#clip-$id)'>
                <circle cx='0' cy='0' r='$r' fill='url(#grad-$id)'></circle>
                $stains
            </g>
            $moon
            <animateMotion dur='{$dur}s' begin='-{$planetOffset}s' repeatCount='indefinite'>
                <mpath xlink:href='#orbit-$this->id' />
            </animateMotion>
        </g>";
    }
}
