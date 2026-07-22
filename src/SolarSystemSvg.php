<?php
namespace SolarSystemSvg;

class SolarSystemSvg
{

    public $sun;
    public $system;
    public $planets = [];
    public $debug = false;
    public Theme $theme;
    public $planetIndex = 0;

    public function __construct($width = 100, $height = 100)
    {
        $this->sun = [
            'size' => (($width+$height)/2.5)*0.05,
        ];

        $this->system = [
            'width' => $width,
            'height' => $height,
        ];

        $this->theme = new Theme();
    }

    public function addPlanet($size, $distance, $moon = false)
    {
        $planet = new Planet($size, $distance, $moon, $this, $this->theme, $this->planetIndex++);
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
        $bg = $this->theme->background();

        $defs = "<defs>
            <symbol id='star-s' viewBox='-1 -1 2 2'><circle cx='0' cy='0' r='1' /></symbol>
            <radialGradient id='star-glow'>
                <stop offset='0%' stop-color='white' stop-opacity='0.18' />
                <stop offset='100%' stop-color='white' stop-opacity='0' />
            </radialGradient>
            <radialGradient id='vignette' cx='50%' cy='50%' r='75%'>
                <stop offset='55%' stop-color='" . Color::rgba($bg['vignette'], 0) . "' />
                <stop offset='100%' stop-color='" . Color::rgba(Color::shade($bg['vignette'], 0.4), 0.85) . "' />
            </radialGradient>";
        foreach ($bg['layers'] as $i => $l) {
            $c = $l['colors'];
            $op = $i === 0 ? '1' : '0.5';
            $defs .= "<radialGradient id='space-bg-$i' cx='{$l['cx']}' cy='{$l['cy']}' r='80%'>
                <stop offset='0%' stop-color='{$c[0]}' stop-opacity='$op' />
                <stop offset='45%' stop-color='{$c[1]}' stop-opacity='" . ($i === 0 ? '1' : '0.35') . "' />
                <stop offset='100%' stop-color='{$c[3]}' stop-opacity='" . ($i === 0 ? '1' : '0') . "' />
            </radialGradient>";
        }
        $defs .= "</defs>";

        $out = $defs;
        foreach ($bg['layers'] as $i => $l) {
            $out .= "<rect width='$w' height='$h' fill='url(#space-bg-$i)' />";
        }

        // Optimized stars: 3 size tiers, reduced counts, via <use>.
        $tiers = [[intval($w * $h / 90), 0.35, 0.5], [intval($w * $h / 220), 0.7, 0.8], [intval($w * $h / 900), 1.2, 1.0]];
        foreach ($tiers as $tier) {
            [$count, $scale, $op] = $tier;
            for ($i = 0; $i < $count; $i++) {
                $x = mt_rand(0, $w * 10) / 10;
                $y = mt_rand(0, $h * 10) / 10;
                $s = round($scale * mt_rand(70, 130) / 100, 2);
                $out .= "<use href='#star-s' x='0' y='0' fill='" . $this->theme->star() . "' opacity='$op' transform='translate($x $y) scale($s)' />";
            }
        }
        // A few bright accent stars with glow.
        $bright = mt_rand(4, 7);
        for ($i = 0; $i < $bright; $i++) {
            $x = mt_rand(0, $w * 10) / 10; $y = mt_rand(0, $h * 10) / 10;
            $out .= "<circle cx='$x' cy='$y' r='" . mt_rand(15, 30) / 10 . "' fill='url(#star-glow)' />";
            $out .= "<use href='#star-s' fill='#ffffff' transform='translate($x $y) scale(0.6)' />";
        }

        $out .= "<rect width='$w' height='$h' fill='url(#vignette)' />";
        return $out;
    }

    public function render()
    {
        $orbits = $this->getOrbitsPath();
        $planets = $this->getPlanets();
        $background = $this->debug ? '' : $this->getBackground();

        $sunR = $this->sun['size'];
        $sunCx = $this->system['width'] / 2;
        $sunCy = $this->system['height'] / 2;
        $sunT = $this->theme->sun();
        $glowR = $sunR * 3;

        // Flat banded sun: glow halo + corona ring + 3 tonal bands (no gradients).
        $sun = "
            <circle cx='$sunCx' cy='$sunCy' r='$glowR' fill='" . $sunT['glow'] . "' />
            <circle cx='$sunCx' cy='$sunCy' r='" . round($sunR * 1.35, 2) . "' fill='none' stroke='{$sunT['corona']}' stroke-width='" . round($sunR * 0.12, 2) . "' opacity='0.5' />
            <circle cx='$sunCx' cy='$sunCy' r='$sunR' fill='{$sunT['bands'][2]}' />
            <circle cx='$sunCx' cy='$sunCy' r='" . round($sunR * 0.8, 2) . "' fill='{$sunT['bands'][1]}' />
            <circle cx='" . round($sunCx - $sunR * 0.25, 2) . "' cy='" . round($sunCy - $sunR * 0.25, 2) . "' r='" . round($sunR * 0.5, 2) . "' fill='{$sunT['bands'][0]}' />";

        $bg = $this->debug ? '#fff' : '#000';

        return '
        <svg class="solarsys" style="background:'.$bg.'" viewBox="0 0 '.($this->system['width']+5).' '.($this->system['height']+5).'" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            '.$background.'
            <g transform="translate(2.5 2.5)">
                '.implode($orbits).'
                '.$sun.'
                '.implode($planets).'
            </g>
        </svg>';
    }
}
