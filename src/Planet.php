<?php
namespace SolarSystemSvg;

class Planet
{
    public $id;
    public $size;
    public $distance;
    public $moon = false;
    public $system;
    public Theme $theme;
    public int $index;
    public bool $hasRing;

    public function __construct($size, $distance, $moon, $system, Theme $theme, int $index)
    {
        $this->size = $size;
        $this->distance = is_array($distance) ? $distance : [$distance, $distance, $distance, $distance];
        $this->moon = $moon;
        $this->system = $system;
        $this->theme = $theme;
        $this->index = $index;
        $this->id = uniqid((string) mt_rand(), true);
        // Rings assigned procedurally: larger planets are likelier to have one.
        $this->hasRing = ($size >= 6) && (mt_rand(0, 100) < 45);
    }

    // Clean, low-count continent blobs in a harmonized stain color.
    private function blobs(float $r, array $stains): string
    {
        $out = '';
        $count = mt_rand(3, 5);
        for ($c = 0; $c < $count; $c++) {
            $angle = mt_rand(0, 360) * M_PI / 180;
            $dist = mt_rand(0, intval($r * 6)) / 10;
            $cx = round(cos($angle) * $dist, 2);
            $cy = round(sin($angle) * $dist, 2);
            $size = $r * mt_rand(22, 42) / 100;
            $pts = mt_rand(6, 9);
            $coords = [];
            for ($i = 0; $i < $pts; $i++) {
                $a = ($i / $pts) * 2 * M_PI;
                $rad = $size * mt_rand(70, 115) / 100;
                $coords[] = [round($cx + cos($a) * $rad, 2), round($cy + sin($a) * $rad, 2)];
            }
            $n = count($coords);
            $sx = round(($coords[0][0] + $coords[1][0]) / 2, 2);
            $sy = round(($coords[0][1] + $coords[1][1]) / 2, 2);
            $path = "M $sx $sy";
            for ($i = 1; $i <= $n; $i++) {
                $p = $coords[$i % $n];
                $pn = $coords[($i + 1) % $n];
                $mx = round(($p[0] + $pn[0]) / 2, 2);
                $my = round(($p[1] + $pn[1]) / 2, 2);
                $path .= " Q {$p[0]} {$p[1]}, $mx $my";
            }
            $color = $stains[mt_rand(0, count($stains) - 1)];
            $out .= "<path d='$path Z' fill='$color' opacity='0.55' />";
        }
        return $out;
    }

    public function getOrbit()
    {
        $cx = $this->system->system['width'] / 2;
        $cy = $this->system->system['height'] / 2;
        [$left, $top, $right, $bottom] = $this->distance;
        $k = 0.5522847498;
        $kL = $left * $k; $kT = $top * $k; $kR = $right * $k; $kB = $bottom * $k;
        $path = "M " . ($cx - $left) . " $cy"
            . " C " . ($cx - $left) . " " . ($cy - $kT) . ", " . ($cx - $kL) . " " . ($cy - $top) . ", $cx " . ($cy - $top)
            . " C " . ($cx + $kR) . " " . ($cy - $top) . ", " . ($cx + $right) . " " . ($cy - $kT) . ", " . ($cx + $right) . " $cy"
            . " C " . ($cx + $right) . " " . ($cy + $kB) . ", " . ($cx + $kR) . " " . ($cy + $bottom) . ", $cx " . ($cy + $bottom)
            . " C " . ($cx - $kL) . " " . ($cy + $bottom) . ", " . ($cx - $left) . " " . ($cy + $kB) . ", " . ($cx - $left) . " $cy Z";
        $stroke = $this->system->debug
            ? "stroke='lightgrey' stroke-width='0.1'"
            : "stroke='" . Color::rgba('#ffffff', 0.06) . "' stroke-width='0.4'";
        return "<path fill='none' $stroke id='orbit-$this->id' d='$path' />";
    }

    public function getPlanet()
    {
        $r = $this->size;
        $id = $this->id;
        $st = $this->theme->planet($this->index);

        // Flat terminator: dark side is a disc-clipped ellipse offset toward anti-sun (down-right).
        $termId = "terminator-$id";
        $atmId = "atmosphere-$id";
        $clipId = "clip-$id";
        $shadowId = "drop-$id";

        $defs = "<defs>
            <clipPath id='$clipId'><circle cx='0' cy='0' r='$r' /></clipPath>
            <filter id='$shadowId' x='-50%' y='-50%' width='200%' height='200%'>
                <feGaussianBlur stdDeviation='" . round($r * 0.12, 2) . "' />
            </filter>
        </defs>";

        $termCx = round($r * 0.55, 2);
        $termCy = round($r * 0.35, 2);
        $termR = round($r * 1.15, 2);

        $body = "
            $defs
            <circle cx='0.6' cy='0.9' r='" . round($r * 1.15, 2) . "' fill='" . Color::rgba('#000000', 0.35) . "' filter='url(#$shadowId)' />
            <circle cx='0' cy='0' r='" . round($r * 1.18, 2) . "' fill='none' stroke='{$st['atmosphere']}' stroke-width='" . round($r * 0.16, 2) . "' id='$atmId' />
            <g clip-path='url(#$clipId)'>
                <circle cx='0' cy='0' r='$r' fill='{$st['base']}' />
                <circle cx='" . round(-$r * 0.35, 2) . "' cy='" . round(-$r * 0.35, 2) . "' r='" . round($r * 0.9, 2) . "' fill='{$st['light']}' opacity='0.5' />
                " . $this->blobs($r, $st['stains']) . "
                <circle cx='$termCx' cy='$termCy' r='$termR' fill='{$st['dark']}' opacity='0.55' id='$termId' />
            </g>";

        $moon = $this->moonMarkup($id);

        $dur = mt_rand(20, 60);
        $offset = round($dur * mt_rand(0, 100) / 100, 2);

        $ringBack = '';
        $ringFront = '';
        if ($this->hasRing) {
            $ringObj = new Ring($r, $this->id, $this->theme->ring(), mt_rand(15, 32) / 100);
            $ringBack = $ringObj->back();
            $ringFront = $ringObj->front();
        }

        return "<g>
            $ringBack
            <g>
                $body
                $ringFront
                $moon
            </g>
            <animateMotion dur='{$dur}s' begin='-{$offset}s' repeatCount='indefinite'>
                <mpath xlink:href='#orbit-$this->id' />
            </animateMotion>
        </g>";
    }

    private function moonMarkup(string $planetId): string
    {
        if (!$this->moon) { return ''; }
        $ms = $this->theme->moon($this->index);
        $sz = $this->moon['size'];
        $md = $this->moon['distance'];
        $mk = $md * 0.5522847498;
        $mid = "moon-$planetId";
        $orbit = "M -$md 0 C -$md -$mk, -$mk -$md, 0 -$md S $md -$mk, $md 0 S $mk $md, 0 $md S -$md $mk, -$md 0 Z";
        $off = round(15 * mt_rand(0, 100) / 100, 2);
        $stroke = $this->system->debug ? "stroke='lightgrey' stroke-width='0.5'" : "stroke='none'";
        return "
            <path fill='none' $stroke d='$orbit' id='planet-$planetId'></path>
            <g>
                <clipPath id='clip-$mid'><circle cx='0' cy='0' r='$sz' /></clipPath>
                <circle cx='0.4' cy='0.5' r='" . round($sz * 1.2, 2) . "' fill='" . Color::rgba('#000000', 0.3) . "' />
                <g clip-path='url(#clip-$mid)'>
                    <circle cx='0' cy='0' r='$sz' fill='{$ms['base']}' />
                    <circle cx='" . round(-$sz * 0.3, 2) . "' cy='" . round(-$sz * 0.3, 2) . "' r='" . round($sz * 0.8, 2) . "' fill='{$ms['light']}' opacity='0.5' />
                    <circle cx='" . round($sz * 0.5, 2) . "' cy='" . round($sz * 0.35, 2) . "' r='" . round($sz * 1.1, 2) . "' fill='{$ms['dark']}' opacity='0.5' />
                </g>
                <animateMotion keyPoints='1;0' keyTimes='0;1' dur='15s' begin='-{$off}s' repeatCount='indefinite'>
                    <mpath xlink:href='#planet-$planetId' />
                </animateMotion>
            </g>";
    }
}
